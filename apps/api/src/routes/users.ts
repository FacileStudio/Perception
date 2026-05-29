import { Hono } from 'hono';
import { db } from '../db/client';
import { requireWorkspace, getWorkspaceContext } from '../security/workspace';

export const usersRoutes = new Hono();

usersRoutes.get('/me', async (c) => {
  const ws = await getWorkspaceContext(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);
  const acct = await db.execute({
    sql: "SELECT providerId FROM account WHERE userId = ? AND providerId != 'credential' LIMIT 1",
    args: [ws.userId],
  });
  const source = acct.rows.length > 0 ? 'oidc' : 'local';
  const imgRes = await db.execute({ sql: 'SELECT image FROM user WHERE id = ?', args: [ws.userId] });
  const image = imgRes.rows.length > 0 ? (imgRes.rows[0].image as string | null) : null;
  return c.json({
    user: {
      id: ws.userId,
      email: ws.userEmail,
      name: ws.userName,
      image,
      color: '#818cf8',
      source,
    },
  });
});

usersRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.image, m.role, m.createdAt,
                 EXISTS(SELECT 1 FROM account a WHERE a.userId = u.id AND a.providerId != 'credential') AS is_oidc
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
    image: r.image as string | null,
    color: '#818cf8',
    source: Number(r.is_oidc) ? 'oidc' : 'local',
    created_at: r.createdAt as string,
  }));
  return c.json({ users });
});
