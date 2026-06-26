import { log } from '../lib/logger';
import { db } from '../db/client';
import { forEachWorkspace } from '../db/workspaces';
import { tokenSimilarity } from './link';
import { normalizeLabel } from '../ontology/query';

const CROSS_NAME_THRESHOLD = 0.6;
const BATCH_SIZE = 100;

type EntityRow = {
  id: string;
  canonical_name: string;
  type_concept_id: string;
  provider_types: string;
};

type AliasGroup = {
  alias_value: string;
  entity_ids: string[];
};

async function findSharedExternalIds(workspaceId: string = ''): Promise<AliasGroup[]> {
  const wsClause = workspaceId ? ' AND ea.workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT ea.alias_value, group_concat(DISTINCT ea.entity_id) AS entity_ids
          FROM entity_aliases ea
          WHERE ea.alias_type = 'external_id'${wsClause}
          GROUP BY ea.alias_value
          HAVING COUNT(DISTINCT ea.entity_id) > 1
          LIMIT ?`,
    args: workspaceId ? [workspaceId, BATCH_SIZE] : [BATCH_SIZE],
  });

  return result.rows.map((r) => ({
    alias_value: r.alias_value as string,
    entity_ids: (r.entity_ids as string).split(','),
  }));
}

async function findCrossProviderEntities(workspaceId: string = ''): Promise<EntityRow[]> {
  const wsClause = workspaceId ? ' AND e.workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT e.id, e.canonical_name, e.type_concept_id,
            group_concat(DISTINCT ea.provider_type) AS provider_types
          FROM entities e
          JOIN entity_aliases ea ON ea.entity_id = e.id
          WHERE e.canonical_name != '' AND ea.provider_type IS NOT NULL${wsClause}
          GROUP BY e.id
          HAVING LENGTH(e.canonical_name) > 2`,
    args: workspaceId ? [workspaceId] : [],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    canonical_name: r.canonical_name as string,
    type_concept_id: r.type_concept_id as string,
    provider_types: r.provider_types as string,
  }));
}

async function ensureCrossLinkConcept(label: string, workspaceId: string = ''): Promise<string> {
  const id = `concept_relation_type_${normalizeLabel(label)}`;
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO ontology_concepts (
            id, kind, label, description, capabilities_json, examples_json,
            confidence, state, source, created_at, updated_at, confirmed_at, workspace_id
          ) VALUES (?, 'relation_type', ?, ?, '[]', '[]', 0.85, 'confirmed', 'cross-link:auto', ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, label, `Cross-provider relation: ${label.replace(/_/g, ' ')}`, now, now, now, workspaceId],
  });
  return id;
}

async function upsertCrossRelation(
  fromId: string,
  toId: string,
  conceptId: string,
  confidence: number,
  source: string,
  workspaceId: string = '',
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO entity_relations (
            from_entity_id, to_entity_id, relation_concept_id, confidence, source, created_at, updated_at, workspace_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(from_entity_id, to_entity_id, relation_concept_id) DO UPDATE SET
            confidence = max(entity_relations.confidence, excluded.confidence),
            updated_at = excluded.updated_at`,
    args: [fromId, toId, conceptId, confidence, source, now, now, workspaceId],
  });
}

async function linkBySharedExternalIds(workspaceId: string = ''): Promise<number> {
  const groups = await findSharedExternalIds(workspaceId);
  const conceptId = await ensureCrossLinkConcept('same_entity', workspaceId);
  let count = 0;

  for (const group of groups) {
    for (let i = 0; i < group.entity_ids.length; i++) {
      for (let j = i + 1; j < group.entity_ids.length; j++) {
        await upsertCrossRelation(group.entity_ids[i], group.entity_ids[j], conceptId, 0.92, 'cross-link:shared_external_id', workspaceId);
        await upsertCrossRelation(group.entity_ids[j], group.entity_ids[i], conceptId, 0.92, 'cross-link:shared_external_id', workspaceId);
        count += 2;
      }
    }
  }

  return count;
}

async function linkByNameSimilarity(workspaceId: string = ''): Promise<number> {
  const entities = await findCrossProviderEntities(workspaceId);
  const conceptId = await ensureCrossLinkConcept('same_entity', workspaceId);
  let count = 0;

  const wsClause = workspaceId ? ' AND workspace_id = ?' : '';
  const existingResult = await db.execute({
    sql: `SELECT from_entity_id || ':' || to_entity_id AS pair
          FROM entity_relations
          WHERE source LIKE 'cross-link:%'${wsClause}`,
    args: workspaceId ? [workspaceId] : [],
  });
  const existing = new Set(existingResult.rows.map((r) => r.pair as string));

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (a.type_concept_id !== b.type_concept_id) continue;

      const pairKey = `${a.id}:${b.id}`;
      const reversePairKey = `${b.id}:${a.id}`;
      if (existing.has(pairKey) || existing.has(reversePairKey)) continue;

      const aProviders = new Set(a.provider_types.split(','));
      const bProviders = new Set(b.provider_types.split(','));
      let crossProvider = true;
      for (const p of aProviders) if (bProviders.has(p)) { crossProvider = false; break; }
      if (!crossProvider) continue;

      const sim = tokenSimilarity(a.canonical_name, b.canonical_name);
      if (sim >= CROSS_NAME_THRESHOLD) {
        const confidence = Math.min(0.88, 0.65 + sim * 0.23);
        await upsertCrossRelation(a.id, b.id, conceptId, confidence, 'cross-link:name_similarity', workspaceId);
        await upsertCrossRelation(b.id, a.id, conceptId, confidence, 'cross-link:name_similarity', workspaceId);
        existing.add(pairKey);
        existing.add(reversePairKey);
        count += 2;
      }
    }
  }

  return count;
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const idLinks = await linkBySharedExternalIds(workspaceId);
    const nameLinks = await linkByNameSimilarity(workspaceId);
    const total = idLinks + nameLinks;
    if (total > 0) {
      log.info('created relations', { tag: 'cross-link', workspaceId, total, idLinks, nameLinks });
    }
  });
}

export const crossLinkWorker = { run };
