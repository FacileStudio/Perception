import { Hono } from 'hono';
import { db } from '../db/client';
import { requireSession, getSessionWithUser } from '../security/session';

export const usersRoutes = new Hono();

usersRoutes.get('/me', async (c) => {
  const user = await getSessionWithUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ user });
});

usersRoutes.get('/', async (c) => {
  const ok = await requireSession(c);
  if (!ok) return c.json({ error: 'unauthorized' }, 401);
  const result = await db.execute(
    'SELECT id, email, name, color, source, created_at FROM users ORDER BY created_at ASC'
  );
  const users = result.rows.map(r => ({
    id: r.id as string,
    email: r.email as string,
    name: r.name as string | null,
    color: r.color as string,
    source: r.source as string,
    created_at: r.created_at as string,
  }));
  return c.json({ users });
});
