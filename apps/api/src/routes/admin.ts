import { Hono } from 'hono';
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
