import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { runMigrations } from './db/migrations';
import { db } from './db/client';
import { authRoutes } from './routes/auth';
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
import { config } from './config';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean),
  credentials: true,
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

app.route('/auth', authRoutes);
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

app.onError((err, c) => {
  console.error('[error]', err);
  return c.json({ error: 'internal_error' }, 500);
});

await runMigrations();
console.log(`[perception] API ready on :${config.port}`);

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

export default {
  port: config.port,
  fetch: app.fetch,
};
