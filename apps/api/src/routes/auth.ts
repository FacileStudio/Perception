import { Hono } from 'hono';
import { config } from '../config';
import { db } from '../db/client';
import { createSession, destroySession, upsertUser, getSessionWithUser } from '../security/session';
import { isOIDCEnabled, initiateOIDCLogin, handleOIDCCallback } from '../security/oidc';

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
      const { email, name, picture } = await handleOIDCCallback(c);
      const userId = await upsertUser(email, 'oidc', name);
      if (picture) {
        try {
          await db.execute({
            sql: 'UPDATE user SET image = ? WHERE email = ?',
            args: [picture, email],
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
}
