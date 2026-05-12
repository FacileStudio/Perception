import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { runMigrations } from './db/migrations';
import { db } from './db/client';
import { auth } from './auth';
import { ingestRoutes } from './routes/ingest';
import { chatRoutes } from './routes/chat';
import { eventsRoutes } from './routes/events';
import { schemasRoutes } from './routes/schemas';
import { adminRoutes } from './routes/admin';
import { statsRoutes } from './routes/stats';
import { settingsRoutes } from './routes/settings';
import { entitiesRoutes } from './routes/entities';
import { usersRoutes } from './routes/users';
import { notificationsRoutes } from './routes/notifications';
import { resourcesRoutes } from './routes/resources';
import { proposalRoutes } from './routes/proposals';
import { workspaceRoutes } from './routes/workspaces';
import { config } from './config';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean),
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Session-Id'],
}));
app.use('/ingest', bodyLimit({ maxSize: 1 * 1024 * 1024 }));
app.use('/resources', bodyLimit({ maxSize: 50 * 1024 * 1024 }));

app.get('/health', (c) => c.json({ ok: true }));
app.get('/ready', async (c) => {
  try {
    await db.execute('SELECT 1');
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: 'db_unavailable' }, 503);
  }
});

app.on(['POST', 'GET'], '/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

app.route('/ingest', ingestRoutes);
app.route('/chat', chatRoutes);
app.route('/events', eventsRoutes);
app.route('/schemas', schemasRoutes);
app.route('/admin', adminRoutes);
app.route('/stats', statsRoutes);
app.route('/settings', settingsRoutes);
app.route('/entities', entitiesRoutes);
app.route('/users', usersRoutes);
app.route('/notifications', notificationsRoutes);
app.route('/resources', resourcesRoutes);
app.route('/proposals', proposalRoutes);
app.route('/workspaces', workspaceRoutes);

const { forecastRoutes } = await import('./routes/forecasts');
app.route('/forecasts', forecastRoutes);

app.onError((err, c) => {
  console.error('[error]', err);
  const origin = c.req.header('origin');
  const allowed = ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean);
  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  return c.json({ error: 'internal_error' }, 500);
});

await runMigrations();
await bootstrapDefaultWorkspace();
console.log(`[perception] API ready on :${config.port}`);

async function bootstrapDefaultWorkspace() {
  const existing = await db.execute("SELECT id FROM organization WHERE slug = 'default'");
  if (existing.rows.length > 0) return;

  const orgId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT OR IGNORE INTO organization (id, name, slug, logo, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    args: [orgId, 'Default Workspace', 'default', null, null, now],
  });

  await db.execute("UPDATE events SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE entities SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE ontology_concepts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE chat_sessions SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE notifications SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE forecasts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE resources SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE action_proposals SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE provider_schemas SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE dynamic_facts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE entity_aliases SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE entity_relations SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE entity_communities SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE entity_narratives SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE event_entities SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE event_concepts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE ontology_concept_aliases SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE memory_episodes SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE stats_snapshots SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE change_points SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE graph_health_snapshots SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE concept_drift_alerts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE event_counts_daily SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE causal_links SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE forecast_resolutions SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE forecast_beliefs SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE forecast_intervals SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE forecast_strategies SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE strategy_forecasts SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE calibration_snapshots SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE topology_snapshots SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE retrieval_outcomes SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE retrieval_weight_versions SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE schema_inference_jobs SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE chat_messages SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE resource_chunks SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE eval_fixtures SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE eval_runs SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE eval_results SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE ingest_rejections SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);
  await db.execute("UPDATE token_usage SET workspace_id = ? WHERE workspace_id = 'default'", [orgId]);

  const userResult = await db.execute("SELECT id FROM users LIMIT 1");
  if (userResult.rows.length > 0) {
    for (const row of userResult.rows) {
      const oldUserId = row.id as string;
      const userRow = await db.execute({ sql: "SELECT email, name FROM users WHERE id = ?", args: [oldUserId] });
      if (userRow.rows.length === 0) continue;
      const email = userRow.rows[0].email as string;
      const name = userRow.rows[0].name as string | null;

      const existingBaUser = await db.execute({ sql: "SELECT id FROM user WHERE email = ?", args: [email] });
      let baUserId: string;
      if (existingBaUser.rows.length > 0) {
        baUserId = existingBaUser.rows[0].id as string;
      } else {
        baUserId = crypto.randomUUID();
        await db.execute({
          sql: "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
          args: [baUserId, name ?? email, email, 0, now, now],
        });
      }

      const existingMember = await db.execute({
        sql: "SELECT id FROM member WHERE userId = ? AND organizationId = ?",
        args: [baUserId, orgId],
      });
      if (existingMember.rows.length === 0) {
        await db.execute({
          sql: "INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES (?, ?, ?, ?, ?)",
          args: [crypto.randomUUID(), baUserId, orgId, 'owner', now],
        });
      }
    }
  }

  console.log(`[workspace] bootstrapped default workspace: ${orgId}`);
}

import { registerWorker, scheduleWorker } from './workers/registry';

const { embeddingWorker } = await import('./embeddings/worker');
const { schemaInferenceWorker } = await import('./schema-registry/worker');
const { upliftWorker } = await import('./ingest/uplift-worker');
const { crossLinkWorker } = await import('./entities/cross-link-worker');
const { notificationWorker } = await import('./notifications/worker');
const { communityWorker } = await import('./communities/worker');
const { narrativeWorker } = await import('./narratives/worker');
const { memoryWorker } = await import('./memory/worker');
const { changePointWorker } = await import('./math/change-points-worker');
const { graphHealthWorker } = await import('./math/graph-health-worker');
const { conceptDriftWorker } = await import('./math/concept-drift-worker');
const { grangerWorker } = await import('./math/granger-worker');
const { resourceEmbeddingWorker } = await import('./resources/embedding-worker');
const { banditWorker } = await import('./chat/bandit-worker');
const { proposalWorker } = await import('./proposals/worker');
const { forecastWorker } = await import('./forecasts/worker');
const { resolutionWorker } = await import('./forecasts/resolution-worker');
const { beliefWorker } = await import('./forecasts/belief-worker');
const { tdaWorker } = await import('./math/tda-worker');
const { calibrationWorker } = await import('./forecasts/calibration-worker');
const { conformalWorker } = await import('./forecasts/conformal-worker');
const { ensembleWorker } = await import('./forecasts/ensemble-worker');

registerWorker({ name: 'embedding', description: 'Generates vector embeddings for events', intervalMs: 5_000, run: embeddingWorker.run });
registerWorker({ name: 'schema-inference', description: 'Infers and applies provider schemas', intervalMs: 15_000, run: schemaInferenceWorker.run });
registerWorker({ name: 'uplift', description: 'Upgrades degraded events with confirmed schemas', intervalMs: 6 * 60 * 60 * 1000, run: upliftWorker.run });
registerWorker({ name: 'cross-link', description: 'Discovers cross-provider entity relationships', intervalMs: 12 * 60 * 60 * 1000, run: crossLinkWorker.run });
registerWorker({ name: 'notifications', description: 'Evaluates anomalies and generates alerts', intervalMs: 24 * 60 * 60 * 1000, run: notificationWorker.run });
registerWorker({ name: 'communities', description: 'Detects entity communities and generates summaries', intervalMs: 6 * 60 * 60 * 1000, run: communityWorker.run });
registerWorker({ name: 'narratives', description: 'Generates per-entity operational narratives', intervalMs: 6 * 60 * 60 * 1000, run: narrativeWorker.run });
registerWorker({ name: 'memory', description: 'Extracts durable memory episodes from idle sessions', intervalMs: 30 * 60 * 1000, run: memoryWorker.run });
registerWorker({ name: 'change-points', description: 'Detects regime changes via BOCPD on entity event series', intervalMs: 12 * 60 * 60 * 1000, run: changePointWorker.run });
registerWorker({ name: 'graph-health', description: 'Computes graph entropy and connectivity health metrics', intervalMs: 7 * 24 * 60 * 60 * 1000, run: graphHealthWorker.run });
registerWorker({ name: 'concept-drift', description: 'Detects distribution drift per provider and invalidates schemas', intervalMs: 24 * 60 * 60 * 1000, run: conceptDriftWorker.run });
registerWorker({ name: 'granger', description: 'Detects Granger-causal relationships between event series', intervalMs: 24 * 60 * 60 * 1000, run: grangerWorker.run });
registerWorker({ name: 'resource-embedding', description: 'Generates vector embeddings for resource chunks', intervalMs: 5_000, run: resourceEmbeddingWorker.run });
registerWorker({ name: 'bandit', description: 'Fits retrieval lane weights from feedback via Thompson sampling', intervalMs: 24 * 60 * 60 * 1000, run: banditWorker.run });
registerWorker({ name: 'proposals', description: 'Generates action proposals from detected gaps', intervalMs: 24 * 60 * 60 * 1000, run: proposalWorker.run });
registerWorker({ name: 'forecasts', description: 'Generates forecast questions from detected signals', intervalMs: 24 * 60 * 60 * 1000, run: forecastWorker.run });
registerWorker({ name: 'resolution-oracle', description: 'Auto-resolves matured forecasts', intervalMs: 60 * 60 * 1000, run: resolutionWorker.run });
registerWorker({ name: 'belief-updater', description: 'Updates Bayesian belief states for open forecasts', intervalMs: 6 * 60 * 60 * 1000, run: beliefWorker.run });
registerWorker({ name: 'tda', description: 'Computes topological persistence for knowledge gap detection', intervalMs: 7 * 24 * 60 * 60 * 1000, run: tdaWorker.run });
registerWorker({ name: 'calibration', description: 'Computes forecast calibration scores and reliability diagrams', intervalMs: 7 * 24 * 60 * 60 * 1000, run: calibrationWorker.run });
registerWorker({ name: 'conformal', description: 'Computes conformal prediction intervals for forecasts', intervalMs: 6 * 60 * 60 * 1000, run: conformalWorker.run });
registerWorker({ name: 'ensemble', description: 'Generates strategy forecasts and updates track-record weights', intervalMs: 24 * 60 * 60 * 1000, run: ensembleWorker.run });

scheduleWorker('embedding');
scheduleWorker('schema-inference');
scheduleWorker('uplift', 30_000);
scheduleWorker('cross-link', 60_000);
scheduleWorker('notifications', 120_000);
scheduleWorker('communities', 180_000);
scheduleWorker('narratives', 240_000);
scheduleWorker('memory', 300_000);
scheduleWorker('change-points', 360_000);
scheduleWorker('graph-health', 420_000);
scheduleWorker('concept-drift', 480_000);
scheduleWorker('granger', 600_000);
scheduleWorker('resource-embedding');
scheduleWorker('bandit', 660_000);
scheduleWorker('proposals', 720_000);
scheduleWorker('forecasts', 780_000);
scheduleWorker('resolution-oracle', 60_000);
scheduleWorker('belief-updater', 840_000);
scheduleWorker('tda', 900_000);
scheduleWorker('calibration', 960_000);
scheduleWorker('conformal', 1020_000);
scheduleWorker('ensemble', 1080_000);

export default {
  port: config.port,
  fetch: app.fetch,
};
