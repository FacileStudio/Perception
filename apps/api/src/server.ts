import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { log, structuredLogger } from './lib/logger';
import { apiReference } from '@scalar/hono-api-reference';
import { runMigrations } from './db/migrations';
import { db } from './db/client';
import { auth, getAuthError } from './auth';
import { openApiSpec } from './openapi';
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

let ready = false;
let startupError: string | null = null;

const app = new Hono();

app.use('*', structuredLogger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean),
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Session-Id'],
}));
app.use('/ingest', bodyLimit({ maxSize: 1 * 1024 * 1024 }));
app.use('/resources', bodyLimit({ maxSize: 50 * 1024 * 1024 }));

app.get('/health', (c) => {
  const authErr = getAuthError();
  return c.json({ ok: true, ready, startupError: startupError ?? undefined, authError: authErr ?? undefined });
});
app.get('/ready', async (c) => {
  if (!ready) return c.json({ ok: false, error: 'initializing' }, 503);
  try {
    await db.execute('SELECT 1');
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: 'db_unavailable' }, 503);
  }
});

app.get('/docs/openapi.json', (c) => c.json(openApiSpec));
app.get('/docs', apiReference({ url: '/docs/openapi.json', pageTitle: 'Perception API' }));

app.get('/auth/config', (c) => {
  return c.json({
    sso_only: config.ssoOnly,
    oidc_enabled: !!(config.oidcIssuer && config.oidcClientId && config.oidcClientSecret && config.oidcRedirectUrl),
  });
});

app.get('/auth/status', async (c) => {
  if (config.localDevAuthDisabled) {
    return c.json({ authenticated: true, user: { id: 'dev', email: 'dev@local', name: 'Dev User', color: '#818cf8', source: 'local' } });
  }
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      const acct = await db.execute({
        sql: "SELECT providerId FROM account WHERE userId = ? AND providerId != 'credential' LIMIT 1",
        args: [session.user.id],
      });
      const source = acct.rows.length > 0 ? 'oidc' : 'local';
      return c.json({
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: session.user.image ?? null,
          color: '#818cf8',
          source,
        },
      });
    }
  } catch {}

  const oldSession = await getOldSession(c);
  if (oldSession) return c.json({ authenticated: true, user: oldSession });

  return c.json({ authenticated: false, user: null });
});

app.post('/auth/login', async (c) => {
  if (config.ssoOnly) {
    return c.json({ error: 'password_login_disabled' }, 403);
  }
  const body = await c.req.json().catch(() => null);
  if (!body?.password || body.password !== config.adminPassword) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const { createSession, upsertUser } = await import('./security/session');
  const userId = await upsertUser(config.adminUsername, 'local');
  await createSession(c, userId);
  return c.json({ ok: true });
});

if (config.oidcIssuer && config.oidcClientId) {
  app.get('/auth/oidc', async (c) => {
    try {
      const { initiateOIDCLogin } = await import('./security/oidc');
      return await initiateOIDCLogin(c);
    } catch (err) {
      log.error('login initiation failed', { tag: 'oidc', error: err instanceof Error ? err.message : String(err) });
      return c.json({ error: 'oidc_unavailable' }, 503);
    }
  });

  app.get('/auth/oidc/callback', async (c) => {
    try {
      const { handleOIDCCallback } = await import('./security/oidc');
      const { createSession, upsertUser } = await import('./security/session');
      const { db } = await import('./db/client');
      const result = await handleOIDCCallback(c);
      const userId = await upsertUser(result.email, 'oidc', result.name);
      await createSession(c, userId);
      if (result.accessToken) {
        await db.execute({
          sql: 'UPDATE users SET oidc_access_token = ?, oidc_refresh_token = ?, profile_synced_at = ? WHERE id = ?',
          args: [result.accessToken, result.refreshToken ?? null, new Date().toISOString(), userId],
        });
      }
      try {
        const updates: string[] = [];
        const args: (string | null)[] = [];
        if (result.name) { updates.push('name = ?'); args.push(result.name); }
        if (result.picture) { updates.push('image = ?'); args.push(result.picture); }
        if (updates.length > 0) {
          args.push(result.email);
          await db.execute({ sql: `UPDATE user SET ${updates.join(', ')} WHERE email = ?`, args });
        }
      } catch {}
      const successUrl = config.oidcSuccessUrl || 'http://localhost:3000';
      return c.redirect(`${successUrl}/chat`);
    } catch (err) {
      log.error('callback failed', { tag: 'oidc', error: err instanceof Error ? err.message : String(err) });
      const successUrl = config.oidcSuccessUrl || 'http://localhost:3000';
      return c.redirect(`${successUrl}/login?error=oidc_failed`);
    }
  });

  app.post('/auth/sync-profile', async (c) => {
    const { getSessionWithUser } = await import('./security/session');
    const currentUser = await getSessionWithUser(c);
    if (!currentUser) return c.json({ error: 'unauthorized' }, 401);

    if (currentUser.source !== 'oidc') return c.json({ synced: false });

    const { db } = await import('./db/client');
    const userRes = await db.execute({
      sql: 'SELECT oidc_access_token, oidc_refresh_token, profile_synced_at FROM users WHERE id = ?',
      args: [currentUser.id],
    });
    if (userRes.rows.length === 0) return c.json({ synced: false });
    const row = userRes.rows[0];

    if (!row.oidc_access_token) return c.json({ synced: false });

    const syncedAt = row.profile_synced_at ? new Date(row.profile_synced_at as string).getTime() : 0;
    if (Date.now() - syncedAt < 5 * 60 * 1000) return c.json({ synced: false });

    const { getDiscovery } = await import('./security/oidc');
    const discovery = await getDiscovery();
    let accessToken = row.oidc_access_token as string;
    let refreshToken = row.oidc_refresh_token as string | null;

    let userinfoRes = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (userinfoRes.status === 401 && refreshToken) {
      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.oidcClientId,
          client_secret: config.oidcClientSecret,
        }),
      });
      if (!tokenRes.ok) return c.json({ synced: false });

      const newTokens = await tokenRes.json() as { access_token: string; refresh_token?: string };
      accessToken = newTokens.access_token;
      if (newTokens.refresh_token) refreshToken = newTokens.refresh_token;

      userinfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!userinfoRes.ok) return c.json({ synced: false });

    const profile = await userinfoRes.json() as { name?: string; picture?: string };
    const now = new Date().toISOString();

    if (profile.name) {
      await db.execute({ sql: 'UPDATE users SET name = ? WHERE id = ?', args: [profile.name, currentUser.id] });
    }
    try {
      const updates: string[] = [];
      const args: (string | null)[] = [];
      if (profile.name) { updates.push('name = ?'); args.push(profile.name); }
      if (profile.picture) { updates.push('image = ?'); args.push(profile.picture); }
      if (updates.length > 0) {
        args.push(currentUser.email);
        await db.execute({ sql: `UPDATE user SET ${updates.join(', ')} WHERE email = ?`, args });
      }
    } catch {}

    await db.execute({
      sql: 'UPDATE users SET oidc_access_token = ?, oidc_refresh_token = ?, profile_synced_at = ? WHERE id = ?',
      args: [accessToken, refreshToken ?? null, now, currentUser.id],
    });

    return c.json({ synced: true });
  });
}

app.post('/auth/logout', async (c) => {
  try {
    const { destroySession } = await import('./security/session');
    await destroySession(c);
  } catch {}
  return c.json({ ok: true });
});

app.on(['POST', 'GET'], '/auth/*', (c) => {
  if (config.ssoOnly) {
    const path = new URL(c.req.url).pathname;
    if (path.includes('/sign-up') || path.includes('/sign-in/email')) {
      return c.json({ error: 'sso_only_mode' }, 403);
    }
  }
  try {
    return auth.handler(c.req.raw);
  } catch (e) {
    log.error('handler error', { tag: 'auth', error: e instanceof Error ? e.message : String(e) });
    return c.json({ error: 'auth_unavailable', detail: e instanceof Error ? e.message : String(e) }, 503);
  }
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

try {
  const { forecastRoutes } = await import('./routes/forecasts');
  app.route('/forecasts', forecastRoutes);
} catch (e) {
  log.error('forecast routes failed to load', { tag: 'startup', error: e instanceof Error ? e.message : String(e) });
}

app.onError((err, c) => {
  log.error('unhandled error', { tag: 'error', error: err instanceof Error ? err.message : String(err) });
  const origin = c.req.header('origin');
  const allowed = ['http://localhost:3000', 'http://localhost:5173', process.env.CLIENT_ORIGIN ?? ''].filter(Boolean);
  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  return c.json({ error: 'internal_error' }, 500);
});

async function getOldSession(c: any): Promise<{ id: string; email: string; name: string | null; color: string; source: string } | null> {
  try {
    const { getSessionWithUser } = await import('./security/session');
    return await getSessionWithUser(c);
  } catch {
    return null;
  }
}

export default {
  port: config.port,
  fetch: app.fetch,
};

log.info('HTTP server listening', { tag: 'perception', port: config.port });

(async () => {
  try {
    log.info('running migrations', { tag: 'startup' });
    await runMigrations();
    log.info('migrations complete', { tag: 'startup' });

    log.info('bootstrapping workspace', { tag: 'startup' });
    await bootstrapDefaultWorkspace();
    log.info('workspace bootstrap complete', { tag: 'startup' });

    ready = true;
    log.info('API fully ready', { tag: 'perception', port: config.port });

    await startWorkers();
  } catch (e) {
    startupError = e instanceof Error ? e.message : String(e);
    log.error('FATAL', { tag: 'startup', error: e instanceof Error ? e.message : String(e) });
    ready = true;
  }
})();

async function bootstrapDefaultWorkspace() {
  try {
    await db.execute("SELECT 1 FROM organization LIMIT 0");
  } catch {
    log.info('organization table not ready yet, skipping bootstrap', { tag: 'workspace' });
    return;
  }

  const existing = await db.execute("SELECT id FROM organization WHERE slug = 'default'");
  if (existing.rows.length > 0) return;

  const orgId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db.execute({
      sql: "INSERT OR IGNORE INTO organization (id, name, slug, logo, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      args: [orgId, 'Default Workspace', 'default', null, null, now],
    });

    const tables = [
      'events', 'event_embeddings', 'entities', 'ontology_concepts', 'chat_sessions',
      'notifications', 'forecasts', 'resources', 'action_proposals', 'provider_schemas',
      'dynamic_facts', 'entity_aliases', 'entity_relations', 'entity_communities',
      'entity_narratives', 'event_entities', 'event_concepts', 'ontology_concept_aliases',
      'memory_episodes', 'stats_snapshots', 'change_points', 'graph_health_snapshots',
      'concept_drift_alerts', 'event_counts_daily', 'causal_links', 'forecast_resolutions',
      'forecast_beliefs', 'forecast_intervals', 'forecast_strategies', 'strategy_forecasts',
      'calibration_snapshots', 'topology_snapshots', 'retrieval_outcomes',
      'retrieval_weight_versions', 'schema_inference_jobs', 'chat_messages',
      'resource_chunks', 'eval_fixtures', 'eval_runs', 'eval_results',
      'ingest_rejections', 'token_usage',
    ];

    for (const table of tables) {
      try {
        await db.execute({
          sql: `UPDATE ${table} SET workspace_id = ? WHERE workspace_id = 'default'`,
          args: [orgId],
        });
      } catch (e) {
        log.warn(`skipped backfill for ${table}`, { tag: 'workspace', error: e instanceof Error ? e.message : String(e) });
      }
    }

    try {
      const userResult = await db.execute("SELECT id, email, name FROM users");
      for (const row of userResult.rows) {
        const email = row.email as string;
        const name = row.name as string | null;

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
    } catch (e) {
      log.warn('user migration skipped', { tag: 'workspace', error: e instanceof Error ? e.message : String(e) });
    }

    log.info('bootstrapped default workspace', { tag: 'workspace', orgId });
  } catch (e) {
    log.error('bootstrap failed', { tag: 'workspace', error: e instanceof Error ? e.message : String(e) });
  }
}

async function startWorkers() {
  const { registerWorker, scheduleWorker } = await import('./workers/registry');

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

  log.info('all workers registered and scheduled', { tag: 'startup' });
}
