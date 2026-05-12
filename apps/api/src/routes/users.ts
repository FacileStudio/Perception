import { Hono } from 'hono';
import { db } from '../db/client';
import { requireWorkspace, getWorkspaceContext } from '../security/workspace';
import { auth } from '../auth';

export const usersRoutes = new Hono();

usersRoutes.get('/me', async (c) => {
  const ws = await getWorkspaceContext(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);
  return c.json({
    user: {
      id: ws.userId,
      email: ws.userEmail,
      name: ws.userName,
      color: '#818cf8',
      source: 'better-auth',
    },
  });
});

usersRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.image, m.role, m.createdAt
          FROM member m
          JOIN user u ON u.id = m.userId
          WHERE m.organizationId = ?
          ORDER BY m.createdAt ASC`,
    args: [ws.workspaceId],
  });
  const users = result.rows.map(r => ({
    id: r.id as string,
    email: r.email as string,
    name: r.name as string | null,
    color: '#818cf8',
    source: 'better-auth',
    created_at: r.createdAt as string,
  }));
  return c.json({ users });
});
