import { Hono } from 'hono';
import { auth } from '../auth';
import { db } from '../db/client';

export const workspaceRoutes = new Hono();

workspaceRoutes.get('/', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `SELECT o.id, o.name, o.slug, o.logo, o.createdAt, m.role
          FROM member m
          JOIN organization o ON o.id = m.organizationId
          WHERE m.userId = ?
          ORDER BY o.createdAt ASC`,
    args: [session.user.id],
  });

  const workspaces = result.rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    logo: r.logo as string | null,
    role: r.role as string,
    created_at: r.createdAt as string,
  }));

  const activeId = (session.session as any).activeOrganizationId as string | null;

  return c.json({ workspaces, active_workspace_id: activeId });
});

workspaceRoutes.get('/:id/members', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const isMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [session.user.id, wsId],
  });
  if (isMember.rows.length === 0) return c.json({ error: 'forbidden' }, 403);

  const members = await db.execute({
    sql: `SELECT m.id, m.role, m.createdAt, u.id as userId, u.name, u.email, u.image
          FROM member m
          JOIN user u ON u.id = m.userId
          WHERE m.organizationId = ?
          ORDER BY m.createdAt ASC`,
    args: [wsId],
  });

  return c.json({
    members: members.rows.map(r => ({
      id: r.id as string,
      user_id: r.userId as string,
      name: r.name as string,
      email: r.email as string,
      image: r.image as string | null,
      role: r.role as string,
      joined_at: r.createdAt as string,
    })),
  });
});

workspaceRoutes.get('/:id/stats', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const isMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [session.user.id, wsId],
  });
  if (isMember.rows.length === 0) return c.json({ error: 'forbidden' }, 403);

  const [events, entities, sessions, forecasts] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) as c FROM events WHERE workspace_id = ?', args: [wsId] }),
    db.execute({ sql: 'SELECT COUNT(*) as c FROM entities WHERE workspace_id = ?', args: [wsId] }),
    db.execute({ sql: 'SELECT COUNT(*) as c FROM chat_sessions WHERE workspace_id = ?', args: [wsId] }),
    db.execute({ sql: "SELECT COUNT(*) as c FROM forecasts WHERE workspace_id = ? AND status = 'open'", args: [wsId] }),
  ]);

  return c.json({
    event_count: Number(events.rows[0].c),
    entity_count: Number(entities.rows[0].c),
    session_count: Number(sessions.rows[0].c),
    open_forecast_count: Number(forecasts.rows[0].c),
  });
});
