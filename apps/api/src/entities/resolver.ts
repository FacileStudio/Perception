import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import type { ExtractedEvent, NookEventEnvelope } from '../types';

export type ResolvedEntity = {
  id: string;
  canonicalName: string;
};

function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/www\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableEntityId(providerType: string, providerId: string | null, entityType: string, entityId: string | null, entityName: string | null): string {
  const input = providerId && entityId
    ? `${providerType}:${providerId}:${entityType}:${entityId}`
    : `${providerType}:${entityType}:${normalizeAlias(entityName ?? entityId ?? 'unknown')}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 24);
  return `entity_${hash}`;
}

async function findExistingEntity(providerType: string, providerId: string | null, entityId: string | null, entityName: string | null, workspaceId: string = ''): Promise<string | null> {
  const aliases: Array<{ type: string; value: string }> = [];
  if (providerId && entityId) aliases.push({ type: 'provider_id', value: `${providerType}:${providerId}:${entityId}` });
  if (entityName) aliases.push({ type: 'name', value: normalizeAlias(entityName) });

  for (const alias of aliases) {
    const wsClause = workspaceId ? ' AND workspace_id = ?' : '';
    const existing = await db.execute({
      sql: `SELECT entity_id FROM entity_aliases WHERE alias_type = ? AND alias_value = ?${wsClause} LIMIT 1`,
      args: workspaceId ? [alias.type, alias.value, workspaceId] : [alias.type, alias.value],
    });
    if (existing.rows.length > 0) return existing.rows[0].entity_id as string;
  }

  return null;
}

export async function resolveEventEntity(
  envelope: NookEventEnvelope,
  extracted: Omit<ExtractedEvent, 'facts' | 'quality'>,
  typeConceptId: string,
  workspaceId: string = '',
): Promise<ResolvedEntity | null> {
  const entityName = extracted.entity_name ?? extracted.entity_id ?? null;
  if (!entityName) return null;

  const now = new Date().toISOString();
  const existingId = await findExistingEntity(
    envelope.provider.type,
    envelope.provider.id,
    extracted.entity_id,
    extracted.entity_name,
    workspaceId,
  );
  const entityId = existingId ?? stableEntityId(
    envelope.provider.type,
    envelope.provider.id,
    extracted.entity_type,
    extracted.entity_id,
    extracted.entity_name,
  );
  const confidence = extracted.entity_id ? 0.92 : 0.72;

  await db.execute({
    sql: `INSERT INTO entities (
      id, type_concept_id, canonical_name, description, status, confidence, created_at, updated_at, workspace_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      canonical_name = CASE
        WHEN entities.canonical_name = '' THEN excluded.canonical_name
        ELSE entities.canonical_name
      END,
      confidence = max(entities.confidence, excluded.confidence),
      updated_at = excluded.updated_at`,
    args: [
      entityId,
      typeConceptId,
      entityName,
      `${envelope.provider.name} ${extracted.entity_type}`,
      null,
      confidence,
      now,
      now,
      workspaceId,
    ],
  });

  const aliases: Array<{ type: string; value: string; confidence: number }> = [];
  if (envelope.provider.id && extracted.entity_id) {
    aliases.push({
      type: 'provider_id',
      value: `${envelope.provider.type}:${envelope.provider.id}:${extracted.entity_id}`,
      confidence: 0.98,
    });
  }
  if (extracted.entity_id) {
    aliases.push({ type: 'external_id', value: `${envelope.provider.type}:${extracted.entity_id}`, confidence: 0.9 });
  }
  if (extracted.entity_name) {
    aliases.push({ type: 'name', value: normalizeAlias(extracted.entity_name), confidence: 0.76 });
  }
  if (extracted.url) {
    aliases.push({ type: 'url', value: normalizeAlias(extracted.url), confidence: 0.84 });
  }

  for (const alias of aliases) {
    await db.execute({
      sql: `INSERT INTO entity_aliases (
        id, entity_id, alias_type, alias_value, provider_type, confidence, first_seen_at, last_seen_at, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(alias_type, alias_value) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        confidence = max(entity_aliases.confidence, excluded.confidence)`,
      args: [
        randomUUID(),
        entityId,
        alias.type,
        alias.value,
        envelope.provider.type,
        alias.confidence,
        now,
        now,
        workspaceId,
      ],
    });
  }

  return { id: entityId, canonicalName: entityName };
}
