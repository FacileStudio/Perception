import { db } from '../db/client';
import { config } from '../config';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomUUID } from 'crypto';

const SESSION_COOKIE = 'perception_session';
const SESSION_TTL_HOURS = 24 * 7;

const USER_COLORS = ['#818cf8', '#f472b6', '#fb923c', '#34d399', '#60a5fa', '#a78bfa', '#f87171', '#22d3ee'];

export async function upsertUser(email: string, source: 'local' | 'oidc', name?: string): Promise<string> {
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email],
  });
  if (existing.rows.length > 0) {
    if (name) {
      await db.execute({ sql: 'UPDATE users SET name = ? WHERE email = ?', args: [name, email] });
    }
    return existing.rows[0].id as string;
  }
  const countRes = await db.execute('SELECT COUNT(*) as c FROM users');
  const count = Number(countRes.rows[0].c ?? 0);
  const color = USER_COLORS[count % USER_COLORS.length];
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO users (id, email, name, color, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, email, name ?? null, color, source, new Date().toISOString()],
  });
  return id;
}

export async function createSession(c: Context, userId: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  await db.execute({
    sql: 'INSERT INTO sessions (id, created_at, expires_at, user_id) VALUES (?, ?, ?, ?)',
    args: [id, now.toISOString(), expires.toISOString(), userId],
  });
  const isSecure = !config.localDevAuthDisabled;
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  });
  return id;
}

export async function getSession(c: Context): Promise<{ sessionId: string; userId: string } | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const result = await db.execute({
    sql: 'SELECT id, user_id FROM sessions WHERE id = ? AND expires_at > ?',
    args: [id, new Date().toISOString()],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { sessionId: row.id as string, userId: row.user_id as string };
}

export async function getSessionWithUser(c: Context): Promise<{ id: string; email: string; name: string | null; image: string | null; color: string; source: string } | null> {
  if (config.localDevAuthDisabled) {
    return { id: 'dev', email: 'dev@local', name: 'Dev User', image: null, color: '#818cf8', source: 'local' };
  }
  const session = await getSession(c);
  if (!session) return null;
  const result = await db.execute({
    sql: 'SELECT id, email, name, color, source FROM users WHERE id = ?',
    args: [session.userId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  let image: string | null = null;
  try {
    const imgRes = await db.execute({
      sql: 'SELECT image FROM user WHERE email = ?',
      args: [row.email as string],
    });
    if (imgRes.rows.length > 0) image = imgRes.rows[0].image as string | null;
  } catch {}
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string | null,
    image,
    color: row.color as string,
    source: row.source as string,
  };
}

export async function destroySession(c: Context): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [id] });
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function requireSession(c: Context): Promise<boolean> {
  if (config.localDevAuthDisabled) return true;
  const session = await getSession(c);
  return session !== null;
}
