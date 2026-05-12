import { createHash } from 'crypto';
import { db } from '../db/client';
import type { ProviderSchema, InferredFieldMapping } from '../types';

function parseSchema(row: Record<string, unknown>): ProviderSchema {
  return {
    id: row.id as string,
    provider_type: row.provider_type as string,
    event_type_pattern: (row.event_type_pattern as string | null) ?? null,
    field_mappings: JSON.parse(row.field_mappings_json as string) as InferredFieldMapping[],
    searchable_text_template: (row.searchable_text_template as string | null) ?? null,
    sample_keys_hash: row.sample_keys_hash as string,
    needs_review: Boolean(row.needs_review),
    inferred_at: row.inferred_at as string,
    confirmed_at: (row.confirmed_at as string | null) ?? null,
    inferred_by: (row.inferred_by as string | null) ?? null,
  };
}

export async function lookupSchema(
  providerType: string,
  eventType: string,
  workspaceId: string = '',
): Promise<ProviderSchema | null> {
  const wsClause = workspaceId ? ' AND workspace_id = ?' : '';
  const exact = await db.execute({
    sql: `SELECT * FROM provider_schemas WHERE provider_type = ? AND event_type_pattern = ?${wsClause} LIMIT 1`,
    args: workspaceId ? [providerType, eventType, workspaceId] : [providerType, eventType],
  });
  if (exact.rows.length > 0) return parseSchema(exact.rows[0] as unknown as Record<string, unknown>);

  const wildcard = await db.execute({
    sql: `SELECT * FROM provider_schemas WHERE provider_type = ? AND event_type_pattern IS NULL${wsClause} LIMIT 1`,
    args: workspaceId ? [providerType, workspaceId] : [providerType],
  });
  if (wildcard.rows.length > 0) return parseSchema(wildcard.rows[0] as unknown as Record<string, unknown>);

  return null;
}

export function computeKeysHash(normalized: Record<string, unknown>): string {
  const keys = Object.keys(normalized).sort().join(',');
  return createHash('sha256').update(keys).digest('hex');
}

export async function markNeedsReview(schemaId: string, workspaceId: string = ''): Promise<void> {
  const wsClause = workspaceId ? ' AND workspace_id = ?' : '';
  await db.execute({
    sql: `UPDATE provider_schemas SET needs_review = 1 WHERE id = ?${wsClause}`,
    args: workspaceId ? [schemaId, workspaceId] : [schemaId],
  });
}
