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
import { config } from './config';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean),
  credentials: true,
}));
app.use('/ingest', bodyLimit({ maxSize: 1 * 1024 * 1024 }));

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

app.onError((err, c) => {
  console.error('[error]', err);
  return c.json({ error: 'internal_error' }, 500);
});

await runMigrations();
console.log(`[perception] API ready on :${config.port}`);

const { embeddingWorker } = await import('./embeddings/worker');
const { schemaInferenceWorker } = await import('./schema-registry/worker');
setInterval(() => embeddingWorker.run().catch(console.error), 5000);
setInterval(() => schemaInferenceWorker.run().catch(console.error), 15000);

export default {
  port: config.port,
  fetch: app.fetch,
};
