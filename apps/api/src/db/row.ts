import type { EventRow } from '../types';

export function rowToEvent(row: Record<string, unknown>): EventRow {
  return {
    id: row.id as string,
    schema_version: row.schema_version as number,
    source: row.source as string,
    provider_id: row.provider_id as string | null,
    provider_type: row.provider_type as string,
    provider_name: row.provider_name as string,
    event_type: row.event_type as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string | null,
    entity_name: row.entity_name as string | null,
    actor_name: row.actor_name as string | null,
    actor_email_hash: row.actor_email_hash as string | null,
    status: row.status as string | null,
    due_at: row.due_at as string | null,
    completed_at: row.completed_at as string | null,
    occurred_at: row.occurred_at as string,
    emitted_at: row.emitted_at as string,
    ingested_at: row.ingested_at as string,
    url: row.url as string | null,
    title: row.title as string,
    summary: row.summary as string,
    searchable_text: row.searchable_text as string,
    payload_redacted_json: row.payload_redacted_json as string,
    payload_hash: row.payload_hash as string,
    quality: row.quality as 'complete' | 'partial' | 'degraded',
  };
}
