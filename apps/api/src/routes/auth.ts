import { Hono } from 'hono';
import { config } from '../config';
import { db } from '../db/client';
import { createSession, destroySession, upsertUser, getSession, getSessionWithUser } from '../security/session';
import { isOIDCEnabled, initiateOIDCLogin, handleOIDCCallback, getDiscovery } from '../security/oidc';

export const authRoutes = new Hono();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

authRoutes.get('/config', (c) => {
  return c.json({
    sso_only: config.ssoOnly,
    oidc_enabled: isOIDCEnabled(),
  });
});

if (!config.ssoOnly) {
  authRoutes.post('/login', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.password !== 'string') {
      return c.json({ error: 'invalid_body' }, 400);
    }
    if (!config.adminPassword || body.password !== config.adminPassword) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const userId = await upsertUser(config.adminUsername, 'local');
    await createSession(c, userId);
    return c.json({ ok: true });
  });
}

authRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/status', async (c) => {
  const user = await getSessionWithUser(c);
  if (!user) {
    return c.json({ authenticated: false, user: null });
  }
  return c.json({ authenticated: true, user });
});

if (isOIDCEnabled()) {
  authRoutes.get('/oidc', async (c) => {
    try {
      return await initiateOIDCLogin(c);
    } catch (err) {
      console.error('[oidc] login initiation failed', err);
      return c.json({ error: 'oidc_unavailable' }, 503);
    }
  });

  authRoutes.get('/oidc/callback', async (c) => {
    try {
      const { email, name, picture, accessToken, refreshToken } = await handleOIDCCallback(c);
      const userId = await upsertUser(email, 'oidc', name);
      if (picture) {
        try {
          await db.execute({
            sql: 'UPDATE user SET image = ? WHERE email = ?',
            args: [picture, email],
          });
        } catch {}
      }
      if (accessToken || refreshToken) {
        try {
          await db.execute({
            sql: 'UPDATE users SET oidc_access_token = ?, oidc_refresh_token = ?, profile_synced_at = ? WHERE id = ?',
            args: [accessToken ?? null, refreshToken ?? null, new Date().toISOString(), userId],
          });
        } catch {}
      }
      await createSession(c, userId);
      const successUrl = config.oidcSuccessUrl || 'http://localhost:3000';
      return c.redirect(`${successUrl}/chat`);
    } catch (err) {
      console.error('[oidc] callback failed', err);
      const successUrl = config.oidcSuccessUrl || 'http://localhost:3000';
      return c.redirect(`${successUrl}/login?error=oidc_failed`);
    }
  });

  authRoutes.post('/sync-profile', async (c) => {
    const session = await getSession(c);
    if (!session) return c.json({ error: 'unauthorized' }, 401);

    const userRes = await db.execute({
      sql: 'SELECT id, email, source, oidc_access_token, oidc_refresh_token, profile_synced_at FROM users WHERE id = ?',
      args: [session.userId],
    });
    if (userRes.rows.length === 0) return c.json({ error: 'user_not_found' }, 404);
    const user = userRes.rows[0];

    if (user.source !== 'oidc') return c.json({ synced: false, reason: 'not_oidc_user' });
    if (!user.oidc_access_token) return c.json({ synced: false, reason: 'no_tokens' });

    const syncedAt = user.profile_synced_at ? new Date(user.profile_synced_at as string).getTime() : 0;
    if (Date.now() - syncedAt < 5 * 60 * 1000) return c.json({ synced: false, reason: 'rate_limited' });

    const discovery = await getDiscovery();
    let accessToken = user.oidc_access_token as string;
    let refreshToken = user.oidc_refresh_token as string | null;
    let tokensRefreshed = false;

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
      if (!tokenRes.ok) return c.json({ synced: false, reason: 'token_refresh_failed' });

      const newTokens = await tokenRes.json() as { access_token: string; refresh_token?: string };
      accessToken = newTokens.access_token;
      if (newTokens.refresh_token) refreshToken = newTokens.refresh_token;
      tokensRefreshed = true;

      userinfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!userinfoRes.ok) return c.json({ synced: false, reason: 'userinfo_failed' });

    const profile = await userinfoRes.json() as { name?: string; picture?: string };
    const now = new Date().toISOString();

    if (profile.name) {
      await db.execute({ sql: 'UPDATE users SET name = ? WHERE id = ?', args: [profile.name, session.userId] });
    }
    if (profile.picture) {
      try {
        await db.execute({ sql: 'UPDATE user SET image = ? WHERE email = ?', args: [profile.picture, user.email as string] });
      } catch {}
    }

    await db.execute({
      sql: 'UPDATE users SET oidc_access_token = ?, oidc_refresh_token = ?, profile_synced_at = ? WHERE id = ?',
      args: [accessToken, refreshToken ?? null, now, session.userId],
    });

    return c.json({ synced: true, refreshed: tokensRefreshed });
  });
}
