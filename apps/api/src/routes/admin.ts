import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import { config } from '../config';

export const adminRoutes = new Hono();

adminRoutes.post('/embedding-jobs/retry', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0, last_error = NULL WHERE status = 'error'`,
    args: [],
  });

  return c.json({ reset: result.rowsAffected });
});

adminRoutes.post('/backfill-embeddings', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO event_embeddings (event_id, model, dimensions, input_hash, status) SELECT id, ?, ?, '', 'pending' FROM events WHERE id NOT IN (SELECT event_id FROM event_embeddings)`,
    args: [config.embeddingModel, config.embeddingDimensions],
  });

  return c.json({ enqueued: result.rowsAffected });
});

adminRoutes.post('/reinfer-schemas', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const schemas = await db.execute({
    sql: `SELECT ps.provider_type, ps.event_type_pattern,
                 (SELECT e.id FROM events e WHERE e.provider_type = ps.provider_type LIMIT 1) AS sample_event_id
          FROM provider_schemas ps`,
    args: [],
  });

  let queued = 0;
  for (const row of schemas.rows) {
    const providerType = row.provider_type as string;
    const eventType = (row.event_type_pattern as string | null) ?? providerType;
    const sampleEventId = row.sample_event_id as string | null;
    if (!sampleEventId) continue;

    const existing = await db.execute({
      sql: "SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')",
      args: [providerType, eventType],
    });
    if (existing.rows.length > 0) continue;

    await db.execute({
      sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), providerType, eventType, sampleEventId, 'pending', new Date().toISOString()],
    });
    queued++;
  }

  return c.json({ queued });
});
