import { Hono } from 'hono';
import { requireWorkspace } from '../security/workspace';
import { db } from '../db/client';

export const notificationsRoutes = new Hono();

notificationsRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const filter = c.req.query('filter') ?? 'all';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);

  let whereClause = '';
  if (filter === 'unread') whereClause = 'WHERE read_at IS NULL';
  else if (filter === 'read') whereClause = 'WHERE read_at IS NOT NULL';

  const [notifs, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT id, type, severity, title, message, entity_id, entity_name, metadata_json, created_at, read_at
            FROM notifications ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM notifications ${whereClause}`,
      args: [],
    }),
  ]);

  const notifications = notifs.rows.map(r => ({
    id: r.id as string,
    type: r.type as string,
    severity: r.severity as string,
    title: r.title as string,
    message: r.message as string,
    entity_id: r.entity_id as string | null,
    entity_name: r.entity_name as string | null,
    metadata: JSON.parse((r.metadata_json as string) || '{}'),
    created_at: r.created_at as string,
    read_at: r.read_at as string | null,
  }));

  return c.json({ notifications, total: Number(countResult.rows[0]?.cnt ?? 0) });
});

notificationsRoutes.get('/unread-count', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute('SELECT COUNT(*) as cnt FROM notifications WHERE read_at IS NULL');
  return c.json({ count: Number(result.rows[0]?.cnt ?? 0) });
});

notificationsRoutes.patch('/:id/read', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  await db.execute({
    sql: 'UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL',
    args: [new Date().toISOString(), id],
  });

  return c.json({ ok: true });
});

notificationsRoutes.patch('/read-all', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: 'UPDATE notifications SET read_at = ? WHERE read_at IS NULL',
    args: [new Date().toISOString()],
  });

  return c.json({ ok: true, marked: result.rowsAffected });
});
