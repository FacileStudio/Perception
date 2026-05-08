import { Hono } from 'hono';
import { config } from '../config';
import { createSession, destroySession, requireSession } from '../security/session';

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
  await createSession(c);
  return c.json({ ok: true });
});

authRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/status', async (c) => {
  const authenticated = await requireSession(c);
  return c.json({ authenticated });
});
