import { db } from '../db/client';
import { config } from '../config';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomUUID } from 'crypto';

const SESSION_COOKIE = 'perception_session';
const SESSION_TTL_HOURS = 24 * 7;

export async function createSession(c: Context): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  await db.execute({
    sql: 'INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)',
    args: [id, now.toISOString(), expires.toISOString()],
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

export async function getSession(c: Context): Promise<string | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const result = await db.execute({
    sql: 'SELECT id FROM sessions WHERE id = ? AND expires_at > ?',
    args: [id, new Date().toISOString()],
  });
  return result.rows.length > 0 ? id : null;
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
