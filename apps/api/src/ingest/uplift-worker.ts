import { db } from '../db/client';
import { mapPayload } from './mapper';
import type { NookEventEnvelope, ProviderSchema } from '../types';

async function run(): Promise<void> {
  const result = await db.execute({
    sql: `SELECT e.id, e.provider_type, e.event_type, e.quality, e.payload_redacted_json,
            ps.id AS schema_id, ps.field_mappings_json, ps.searchable_text_template,
            ps.sample_keys_hash, ps.needs_review, ps.inferred_at, ps.confirmed_at,
            ps.inferred_by, ps.event_type_pattern
          FROM events e
          JOIN provider_schemas ps ON ps.provider_type = e.provider_type
            AND (ps.event_type_pattern IS NULL OR e.event_type LIKE ps.event_type_pattern)
          WHERE e.quality IN ('degraded', 'partial')
            AND ps.confirmed_at IS NOT NULL
          LIMIT 50`,
    args: [],
  });

  if (result.rows.length === 0) return;

  for (const row of result.rows) {
    const eventId = row.id as string;
    const payload = JSON.parse(row.payload_redacted_json as string) as Record<string, unknown>;

    const schema: ProviderSchema = {
      id: row.schema_id as string,
      provider_type: row.provider_type as string,
      event_type_pattern: row.event_type_pattern as string | null,
      field_mappings: JSON.parse(row.field_mappings_json as string),
      searchable_text_template: row.searchable_text_template as string | null,
      sample_keys_hash: row.sample_keys_hash as string,
      needs_review: Boolean(row.needs_review),
      inferred_at: row.inferred_at as string,
      confirmed_at: row.confirmed_at as string | null,
      inferred_by: row.inferred_by as string | null,
    };

    const envelope = {
      payload: { normalized: payload, raw: null },
    } as NookEventEnvelope;

    const { facts, quality } = mapPayload(envelope, schema);

    await db.execute({
      sql: `UPDATE dynamic_facts SET facts_json = ? WHERE event_id = ?`,
      args: [JSON.stringify(facts), eventId],
    });

    await db.execute({
      sql: `UPDATE events SET quality = ? WHERE id = ?`,
      args: [quality, eventId],
    });

    await db.execute({
      sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0 WHERE event_id = ?`,
      args: [eventId],
    });
  }

  console.log(`[uplift-worker] processed ${result.rows.length} events`);
}

export const upliftWorker = { run };
