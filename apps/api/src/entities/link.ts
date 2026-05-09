import { db } from '../db/client';
import { normalizeLabel } from '../ontology/query';

type EntityCandidate = {
  id: string;
  canonical_name: string;
  capabilities: string[];
};

type RelationRule = {
  fromCap: string;
  toCap: string;
  label: string;
  confidence: number;
};

const RULES: RelationRule[] = [
  { fromCap: 'source_code',      toCap: 'service',            label: 'deployed_from',   confidence: 0.82 },
  { fromCap: 'work_item',        toCap: 'service',            label: 'references',      confidence: 0.72 },
  { fromCap: 'work_item',        toCap: 'source_code',        label: 'references',      confidence: 0.72 },
  { fromCap: 'work_item',        toCap: 'organization',       label: 'belongs_to',      confidence: 0.70 },
  { fromCap: 'work_item',        toCap: 'commercial_account', label: 'belongs_to',      confidence: 0.68 },
  { fromCap: 'document',         toCap: 'organization',       label: 'issued_to',       confidence: 0.74 },
  { fromCap: 'document',         toCap: 'service',            label: 'references',      confidence: 0.68 },
  { fromCap: 'financial_record', toCap: 'organization',       label: 'billed_to',       confidence: 0.78 },
  { fromCap: 'financial_record', toCap: 'document',           label: 'related_to',      confidence: 0.68 },
  { fromCap: 'person',           toCap: 'organization',       label: 'member_of',       confidence: 0.68 },
  { fromCap: 'person',           toCap: 'document',           label: 'associated_with', confidence: 0.66 },
  { fromCap: 'person',           toCap: 'work_item',          label: 'authored',        confidence: 0.74 },
];

const NAME_SIMILARITY_THRESHOLD = 0.5;

function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const tokA = tok(a);
  const tokB = tok(b);
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) if (tokB.has(t)) shared++;
  return shared / Math.min(tokA.size, tokB.size);
}

async function ensureRelationConcept(label: string): Promise<string> {
  const id = `concept_relation_type_${normalizeLabel(label)}`;
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO ontology_concepts (
            id, kind, label, description, capabilities_json, examples_json,
            confidence, state, source, created_at, updated_at, confirmed_at
          ) VALUES (?, 'relation_type', ?, ?, '[]', '[]', 0.80, 'confirmed', 'link:auto', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [id, label, `Relation: ${label.replace(/_/g, ' ')}`, now, now, now],
  });
  return id;
}

async function upsertRelation(
  fromId: string,
  toId: string,
  conceptId: string,
  confidence: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO entity_relations (
            from_entity_id, to_entity_id, relation_concept_id, confidence, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'link:auto', ?, ?)
          ON CONFLICT(from_entity_id, to_entity_id, relation_concept_id) DO UPDATE SET
            confidence = max(entity_relations.confidence, excluded.confidence),
            updated_at = excluded.updated_at`,
    args: [fromId, toId, conceptId, confidence, now, now],
  });
}

type RelationHit = { fromId: string; toId: string; label: string; confidence: number };

function matchRules(
  entity: { id: string; canonicalName: string; capabilities: string[] },
  candidates: EntityCandidate[],
  bothDirections: boolean,
): RelationHit[] {
  const hits: RelationHit[] = [];
  const seen = new Set<string>();

  const push = (fromId: string, toId: string, label: string, confidence: number) => {
    const key = `${fromId}:${toId}:${label}`;
    if (!seen.has(key)) { seen.add(key); hits.push({ fromId, toId, label, confidence }); }
  };

  for (const c of candidates) {
    if (c.id === entity.id) continue;

    for (const rule of RULES) {
      if (entity.capabilities.includes(rule.fromCap) && c.capabilities.includes(rule.toCap)) {
        push(entity.id, c.id, rule.label, rule.confidence);
      }
      if (bothDirections && c.capabilities.includes(rule.fromCap) && entity.capabilities.includes(rule.toCap)) {
        push(c.id, entity.id, rule.label, rule.confidence);
      }
    }

    const sim = tokenSimilarity(entity.canonicalName, c.canonical_name);
    if (sim >= NAME_SIMILARITY_THRESHOLD) {
      push(entity.id, c.id, 'same_project', Math.min(0.92, 0.70 + sim * 0.22));
    }
  }

  return hits;
}

async function fetchCandidates(excludeId?: string): Promise<EntityCandidate[]> {
  const result = await db.execute({
    sql: `SELECT e.id, e.canonical_name, oc.capabilities_json
          FROM entities e
          JOIN ontology_concepts oc ON oc.id = e.type_concept_id
          ${excludeId ? 'WHERE e.id != ?' : ''}`,
    args: excludeId ? [excludeId] : [],
  });
  return result.rows.map((r) => ({
    id: r.id as string,
    canonical_name: r.canonical_name as string,
    capabilities: JSON.parse(r.capabilities_json as string) as string[],
  }));
}

export async function extractEntityRelations(entity: {
  id: string;
  canonicalName: string;
  capabilities: string[];
}): Promise<number> {
  const candidates = await fetchCandidates(entity.id);
  const hits = matchRules(entity, candidates, true);
  for (const hit of hits) {
    const conceptId = await ensureRelationConcept(hit.label);
    await upsertRelation(hit.fromId, hit.toId, conceptId, hit.confidence);
  }
  return hits.length;
}

export async function extractAllMissingRelations(): Promise<number> {
  const all = await fetchCandidates();
  let total = 0;

  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    for (let j = 0; j < all.length; j++) {
      if (i === j) continue;
      const b = all[j];

      for (const rule of RULES) {
        if (a.capabilities.includes(rule.fromCap) && b.capabilities.includes(rule.toCap)) {
          const conceptId = await ensureRelationConcept(rule.label);
          await upsertRelation(a.id, b.id, conceptId, rule.confidence);
          total++;
        }
      }
    }

    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      const sim = tokenSimilarity(a.canonical_name, b.canonical_name);
      if (sim >= NAME_SIMILARITY_THRESHOLD) {
        const conceptId = await ensureRelationConcept('same_project');
        await upsertRelation(a.id, b.id, conceptId, Math.min(0.92, 0.70 + sim * 0.22));
        total++;
      }
    }
  }

  return total;
}
