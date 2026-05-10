import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getWorkerStatuses, getWorkerHistory, executeWorker, areWorkersPaused } from '../workers/registry';
import { setSetting } from '../db/settings';
import { retryFailedEmbeddings, backfillMissingEmbeddings, getEmbeddingStats, reembedAll } from '../embeddings/admin';
import { reinferAllSchemas } from '../schema-registry/jobs';
import { reprocessActorEntities } from '../entities/backfill';
import { db } from '../db/client';

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

adminRoutes.get('/graph-health', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const [snapshotRow, isolatedRows] = await Promise.all([
    db.execute(`SELECT * FROM graph_health_snapshots ORDER BY computed_at DESC LIMIT 1`).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT e.id, e.canonical_name, oc.label AS type_label,
              (SELECT COUNT(*) FROM event_entities ee WHERE ee.entity_id = e.id) AS event_count
       FROM entities e
       JOIN ontology_concepts oc ON oc.id = e.type_concept_id
       WHERE e.id NOT IN (
         SELECT from_entity_id FROM entity_relations
         UNION
         SELECT to_entity_id FROM entity_relations
       )
       AND e.id IN (SELECT DISTINCT entity_id FROM event_entities)
       ORDER BY event_count DESC
       LIMIT 50`,
    ).catch(() => ({ rows: [] })),
  ]);

  const snapshot = snapshotRow.rows.length > 0 ? snapshotRow.rows[0] : null;
  const isolated = isolatedRows.rows.map((r) => ({
    id: r.id as string,
    name: r.canonical_name as string,
    type: r.type_label as string,
    event_count: Number(r.event_count),
  }));

  return c.json({ snapshot, isolated });
});

adminRoutes.get('/drift-alerts', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute(
    `SELECT id, provider_type, field_name, detected_at, old_distribution, new_distribution, drift_score
     FROM concept_drift_alerts
     ORDER BY detected_at DESC
     LIMIT 20`,
  ).catch(() => ({ rows: [] }));

  const alerts = result.rows.map((r) => ({
    id: r.id as string,
    provider_type: r.provider_type as string,
    field_name: r.field_name as string,
    detected_at: r.detected_at as string,
    old_distribution: JSON.parse(r.old_distribution as string),
    new_distribution: JSON.parse(r.new_distribution as string),
    drift_score: r.drift_score as number,
  }));

  return c.json({ alerts });
});
