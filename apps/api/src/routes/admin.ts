import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getWorkerStatuses, getWorkerHistory, executeWorker, areWorkersPaused } from '../workers/registry';
import { setSetting } from '../db/settings';
import { retryFailedEmbeddings, backfillMissingEmbeddings, getEmbeddingStats, reembedAll } from '../embeddings/admin';
import { reinferAllSchemas } from '../schema-registry/jobs';
import { reprocessActorEntities } from '../entities/backfill';

export const adminRoutes = new Hono();

adminRoutes.get('/workers', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const workers = await getWorkerStatuses();
  const paused = await areWorkersPaused();
  return c.json({ workers, paused });
});

adminRoutes.put('/workers/paused', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ paused: boolean }>();
  await setSetting('workers_paused', String(body.paused));
  return c.json({ ok: true, paused: body.paused });
});

adminRoutes.get('/workers/:name/history', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const history = await getWorkerHistory(c.req.param('name'));
  return c.json({ history });
});

adminRoutes.post('/workers/:name/run', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const name = c.req.param('name');
  try {
    await executeWorker(name);
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});

adminRoutes.post('/embedding-jobs/retry', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const reset = await retryFailedEmbeddings();
  return c.json({ reset });
});

adminRoutes.post('/backfill-embeddings', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const enqueued = await backfillMissingEmbeddings();
  return c.json({ enqueued });
});

adminRoutes.post('/reinfer-schemas', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const queued = await reinferAllSchemas();
  return c.json({ queued });
});

adminRoutes.get('/embedding-stats', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  return c.json(await getEmbeddingStats());
});

adminRoutes.post('/reembed-all', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  const reset = await reembedAll();
  return c.json({ reset });
});

adminRoutes.post('/reprocess-entities', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);
  return c.json(await reprocessActorEntities());
});
