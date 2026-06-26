import { log } from '../lib/logger';
import { db } from '../db/client';
import { mapPayload } from './mapper';
import type { NookEventEnvelope, ProviderSchema } from '../types';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
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
              AND e.workspace_id = ?
              AND ps.workspace_id = ?
            LIMIT 50`,
      args: [workspaceId, workspaceId],
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
        sql: `UPDATE dynamic_facts SET facts_json = ? WHERE event_id = ? AND workspace_id = ?`,
        args: [JSON.stringify(facts), eventId, workspaceId],
      });

      await db.execute({
        sql: `UPDATE events SET quality = ? WHERE id = ? AND workspace_id = ?`,
        args: [quality, eventId, workspaceId],
      });

      await db.execute({
        sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0 WHERE event_id = ? AND workspace_id = ?`,
        args: [eventId, workspaceId],
      });
    }

    log.info('processed events', { tag: 'uplift-worker', count: result.rows.length, workspaceId });
  });
}

export const upliftWorker = { run };
