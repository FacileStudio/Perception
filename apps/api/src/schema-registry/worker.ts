import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { inferSchema } from './infer';
import type { InferredFieldMapping } from '../types';

const SHA256_RE = /^[0-9a-f]{64}$/i;
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;

async function applySchemaToFacts(
  providerType: string,
  fieldMappings: InferredFieldMapping[],
): Promise<void> {
  const factsRows = await db.execute({
    sql: 'SELECT df.event_id, df.facts_json FROM dynamic_facts df WHERE df.provider_type = ?',
    args: [providerType],
  });

  const actorMapping = fieldMappings.find((m) => m.role === 'actor');

  for (const row of factsRows.rows) {
    const eventId = row.event_id as string;
    const existing = JSON.parse(row.facts_json as string) as Record<string, unknown>;
    const mapped: Record<string, unknown> = {};

    for (const mapping of fieldMappings) {
      const val = existing[mapping.source_key];
      if (val !== undefined) {
        mapped[mapping.target_key] = val;
      }
    }

    await db.execute({
      sql: 'UPDATE dynamic_facts SET facts_json = ? WHERE event_id = ?',
      args: [JSON.stringify(mapped), eventId],
    });

    if (actorMapping) {
      const actorVal = existing[actorMapping.source_key];
      if (actorVal != null) {
        const strVal = String(actorVal);
        if (!SHA256_RE.test(strVal)) {
          await db.execute({
            sql: 'UPDATE events SET actor_name = ? WHERE id = ? AND actor_name IS NULL',
            args: [strVal, eventId],
          });
        }
      }
    }
  }

  await db.execute({
    sql: "UPDATE events SET quality = 'complete' WHERE id IN (SELECT event_id FROM dynamic_facts WHERE provider_type = ?)",
    args: [providerType],
  });
}

async function backfillActorFromText(): Promise<void> {
  const rows = await db.execute({
    sql: `SELECT id, title, summary FROM events
          WHERE actor_name IS NULL OR length(actor_name) = 64`,
    args: [],
  });

  for (const row of rows.rows) {
    const text = `${row.title ?? ''} ${row.summary ?? ''}`;
    const m = text.match(EMAIL_RE);
    if (!m) continue;
    await db.execute({
      sql: 'UPDATE events SET actor_name = ? WHERE id = ?',
      args: [m[0], row.id],
    });
  }
}

async function backfillUnconfirmedSchemas(): Promise<void> {
  await db.execute({
    sql: 'UPDATE provider_schemas SET confirmed_at = inferred_at WHERE confirmed_at IS NULL',
    args: [],
  });
  await db.execute({
    sql: "UPDATE events SET quality = 'complete' WHERE quality != 'complete' AND id IN (SELECT event_id FROM dynamic_facts)",
    args: [],
  });
}

export const schemaInferenceWorker = {
  async run(): Promise<void> {
    await backfillUnconfirmedSchemas();
    await backfillActorFromText();

    const pending = await db.execute(
      "SELECT * FROM schema_inference_jobs WHERE status = 'pending' LIMIT 3",
    );

    for (const row of pending.rows) {
      const jobId = row.id as string;
      const providerType = row.provider_type as string;
      const eventType = row.event_type as string;
      const sampleEventId = row.sample_event_id as string;

      await db.execute({
        sql: "UPDATE schema_inference_jobs SET status = 'running' WHERE id = ?",
        args: [jobId],
      });

      try {
        const factsRow = await db.execute({
          sql: 'SELECT facts_json FROM dynamic_facts WHERE event_id = ?',
          args: [sampleEventId],
        });

        if (factsRow.rows.length === 0) {
          await db.execute({
            sql: "UPDATE schema_inference_jobs SET status = 'error', error = ?, completed_at = ? WHERE id = ?",
            args: ['sample_event_not_found', new Date().toISOString(), jobId],
          });
          continue;
        }

        const sampleFacts = JSON.parse(factsRow.rows[0].facts_json as string) as Record<string, unknown>;
        const mappings = await inferSchema(providerType, eventType, sampleFacts);

        if (mappings.length === 0) {
          await db.execute({
            sql: "UPDATE schema_inference_jobs SET status = 'error', error = ?, completed_at = ? WHERE id = ?",
            args: ['no_mappings_inferred', new Date().toISOString(), jobId],
          });
          continue;
        }

        const keysHash = Object.keys(sampleFacts).sort().join(',');
        const existingSchema = await db.execute({
          sql: 'SELECT id FROM provider_schemas WHERE provider_type = ? AND event_type_pattern = ?',
          args: [providerType, eventType],
        });

        const now = new Date().toISOString();
        const schemaId = existingSchema.rows.length > 0
          ? (existingSchema.rows[0].id as string)
          : randomUUID();

        if (existingSchema.rows.length > 0) {
          await db.execute({
            sql: 'UPDATE provider_schemas SET field_mappings_json = ?, sample_keys_hash = ?, needs_review = 0, inferred_at = ?, confirmed_at = ? WHERE id = ?',
            args: [JSON.stringify(mappings), keysHash, now, now, schemaId],
          });
        } else {
          await db.execute({
            sql: 'INSERT INTO provider_schemas (id, provider_type, event_type_pattern, field_mappings_json, sample_keys_hash, needs_review, inferred_at, confirmed_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
            args: [schemaId, providerType, eventType, JSON.stringify(mappings), keysHash, now, now],
          });
        }

        await applySchemaToFacts(providerType, mappings);

        await db.execute({
          sql: "UPDATE schema_inference_jobs SET status = 'done', completed_at = ? WHERE id = ?",
          args: [now, jobId],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.execute({
          sql: "UPDATE schema_inference_jobs SET status = 'error', error = ?, completed_at = ? WHERE id = ?",
          args: [msg, new Date().toISOString(), jobId],
        });
      }
    }
  },
};
