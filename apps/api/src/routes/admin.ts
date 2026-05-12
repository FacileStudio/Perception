import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getWorkerStatuses, getWorkerHistory, executeWorker, areWorkersPaused } from '../workers/registry';
import { setSetting } from '../db/settings';
import { retryFailedEmbeddings, backfillMissingEmbeddings, getEmbeddingStats, reembedAll } from '../embeddings/admin';
import { reinferAllSchemas } from '../schema-registry/jobs';
import { reprocessActorEntities } from '../entities/backfill';
import { db } from '../db/client';
import { runEvaluation } from '../eval/runner';
import { promoteToFixture } from '../eval/promote';

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

adminRoutes.get('/topology', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const snapshotResult = await db.execute(
    `SELECT * FROM topology_snapshots ORDER BY computed_at DESC LIMIT 1`,
  ).catch(() => ({ rows: [] }));

  if (snapshotResult.rows.length === 0) {
    return c.json({ snapshot: null, gaps: [] });
  }

  const snapshot = snapshotResult.rows[0];
  const gapIds: string[] = JSON.parse(snapshot.gap_entity_ids as string);

  let gaps: Array<{ id: string; name: string; type: string }> = [];
  if (gapIds.length > 0) {
    const placeholders = gapIds.map(() => '?').join(',');
    const gapRows = await db.execute({
      sql: `SELECT e.id, e.canonical_name, oc.label AS type_label
            FROM entities e
            JOIN ontology_concepts oc ON oc.id = e.type_concept_id
            WHERE e.id IN (${placeholders})`,
      args: gapIds,
    });
    gaps = gapRows.rows.map((r) => ({
      id: r.id as string,
      name: r.canonical_name as string,
      type: r.type_label as string,
    }));
  }

  return c.json({
    snapshot: {
      id: snapshot.id,
      computed_at: snapshot.computed_at,
      h0_component_count: snapshot.h0_component_count,
      h1_loop_count: snapshot.h1_loop_count,
      max_h0_persistence: snapshot.max_h0_persistence,
      persistence_pairs: JSON.parse(snapshot.persistence_pairs as string),
    },
    gaps,
  });
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

adminRoutes.post('/eval/run', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  try {
    const result = await runEvaluation();
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 400);
  }
});

adminRoutes.get('/eval/runs', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute(
    `SELECT id, ran_at, fixture_count, precision_at_5, recall_at_5, mrr, lane_hit_rates, duration_ms, regression_detected
     FROM eval_runs ORDER BY ran_at DESC LIMIT 20`,
  );

  return c.json({
    runs: result.rows.map((r) => ({
      id: r.id,
      ran_at: r.ran_at,
      fixture_count: r.fixture_count,
      precision_at_5: r.precision_at_5,
      recall_at_5: r.recall_at_5,
      mrr: r.mrr,
      lane_hit_rates: JSON.parse(r.lane_hit_rates as string),
      duration_ms: r.duration_ms,
      regression_detected: Boolean(r.regression_detected),
    })),
  });
});

adminRoutes.get('/eval/runs/:runId', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const runId = c.req.param('runId');
  const [run, results] = await Promise.all([
    db.execute({ sql: `SELECT * FROM eval_runs WHERE id = ?`, args: [runId] }),
    db.execute({
      sql: `SELECT er.*, ef.question, ef.intent FROM eval_results er JOIN eval_fixtures ef ON ef.id = er.fixture_id WHERE er.run_id = ? ORDER BY er.score ASC`,
      args: [runId],
    }),
  ]);

  if (run.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const r = run.rows[0];
  return c.json({
    id: r.id,
    ran_at: r.ran_at,
    fixture_count: r.fixture_count,
    precision_at_5: r.precision_at_5,
    recall_at_5: r.recall_at_5,
    mrr: r.mrr,
    lane_hit_rates: JSON.parse(r.lane_hit_rates as string),
    duration_ms: r.duration_ms,
    regression_detected: Boolean(r.regression_detected),
    results: results.rows.map((res) => ({
      id: res.id,
      fixture_id: res.fixture_id,
      question: res.question,
      intent: res.intent,
      retrieved_event_ids: JSON.parse(res.retrieved_event_ids as string),
      retrieved_lanes: JSON.parse(res.retrieved_lanes as string),
      precision: res.precision_val,
      recall: res.recall_val,
      reciprocal_rank: res.reciprocal_rank,
      score: res.score,
    })),
  });
});

adminRoutes.get('/eval/fixtures', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute(
    `SELECT id, question, expected_event_ids, expected_lanes, intent, notes, source_message_id, created_at
     FROM eval_fixtures ORDER BY created_at DESC`,
  );

  return c.json({
    fixtures: result.rows.map((r) => ({
      id: r.id,
      question: r.question,
      expected_event_ids: JSON.parse(r.expected_event_ids as string),
      expected_lanes: JSON.parse(r.expected_lanes as string),
      intent: r.intent,
      notes: r.notes,
      source_message_id: r.source_message_id,
      created_at: r.created_at,
    })),
  });
});

adminRoutes.post('/eval/fixtures', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{
    question: string;
    expected_event_ids: string[];
    expected_lanes?: string[];
    intent: string;
    notes?: string;
  }>();

  if (!body.question || !body.intent) {
    return c.json({ error: 'question_and_intent_required' }, 400);
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO eval_fixtures (id, question, expected_event_ids, expected_lanes, intent, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, body.question, JSON.stringify(body.expected_event_ids ?? []), JSON.stringify(body.expected_lanes ?? []), body.intent, body.notes ?? '', new Date().toISOString()],
  });

  return c.json({ id }, 201);
});

adminRoutes.delete('/eval/fixtures/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  await db.execute({ sql: `DELETE FROM eval_results WHERE fixture_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM eval_fixtures WHERE id = ?`, args: [id] });
  return c.json({ ok: true });
});

adminRoutes.post('/eval/promote/:messageId', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const messageId = c.req.param('messageId');
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));
  const fixtureId = await promoteToFixture(messageId, (body as { notes?: string }).notes);

  if (!fixtureId) return c.json({ error: 'message_not_found_or_not_upvoted' }, 404);
  return c.json({ fixture_id: fixtureId }, 201);
});
