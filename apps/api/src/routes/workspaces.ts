import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { requireWorkspace } from '../security/workspace';
import { getAllEffectiveSettings, setWorkspaceSetting, getSettingSource } from '../db/settings';

const WS_SETTINGS_KEYS = [
  'anthropic_api_key',
  'voyage_api_key',
  'llm_model',
  'embedding_model',
  'embedding_dimensions',
  'retention_days',
  'store_raw_payloads',
  'email_body_indexing',
  'notification_webhook_url',
];

const SENSITIVE_KEYS = new Set(['anthropic_api_key', 'voyage_api_key']);

function maskValue(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key) || value.length <= 8) return value;
  return '••••••••' + value.slice(-4);
}

export const workspaceRoutes = new Hono();

workspaceRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `SELECT o.id, o.name, o.slug, o.logo, o.createdAt, m.role
          FROM member m
          JOIN organization o ON o.id = m.organizationId
          WHERE m.userId = ?
          ORDER BY o.createdAt ASC`,
    args: [ws.userId],
  });

  const workspaces = result.rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    logo: r.logo as string | null,
    role: r.role as string,
    created_at: r.createdAt as string,
  }));

  return c.json({ workspaces, active_workspace_id: ws.workspaceId });
});

workspaceRoutes.post('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{ name: string; slug?: string }>();
  if (!body.name?.trim()) return c.json({ error: 'name_required' }, 400);

  const name = body.name.trim();
  const slug = (body.slug?.trim() || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const existing = await db.execute({
    sql: 'SELECT id FROM organization WHERE slug = ?',
    args: [slug],
  });
  if (existing.rows.length > 0) return c.json({ error: 'slug_taken' }, 409);

  const orgId = randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: 'INSERT INTO organization (id, name, slug, logo, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    args: [orgId, name, slug, null, null, now],
  });

  await db.execute({
    sql: "INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)",
    args: [randomUUID(), ws.userId, orgId, now],
  });

  return c.json({
    id: orgId,
    name,
    slug,
    role: 'owner',
    created_at: now,
  }, 201);
});

workspaceRoutes.patch('/:id', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');

  const memberCheck = await db.execute({
    sql: 'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (memberCheck.rows.length === 0) return c.json({ error: 'forbidden' }, 403);
  const role = memberCheck.rows[0].role as string;
  if (role !== 'owner' && role !== 'admin') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ name?: string; slug?: string }>();
  const updates: string[] = [];
  const args: (string | null)[] = [];

  if (body.name?.trim()) {
    updates.push('name = ?');
    args.push(body.name.trim());
  }

  if (body.slug?.trim()) {
    const slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await db.execute({
      sql: 'SELECT id FROM organization WHERE slug = ? AND id != ?',
      args: [slug, wsId],
    });
    if (existing.rows.length > 0) return c.json({ error: 'slug_taken' }, 409);
    updates.push('slug = ?');
    args.push(slug);
  }

  if (updates.length === 0) return c.json({ error: 'no_changes' }, 400);

  args.push(wsId);
  await db.execute({
    sql: `UPDATE organization SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });

  const updated = await db.execute({
    sql: 'SELECT id, name, slug FROM organization WHERE id = ?',
    args: [wsId],
  });

  return c.json({
    id: updated.rows[0].id as string,
    name: updated.rows[0].name as string,
    slug: updated.rows[0].slug as string,
  });
});

workspaceRoutes.get('/:id/settings', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const isMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (isMember.rows.length === 0) return c.json({ error: 'forbidden' }, 403);

  const all = await getAllEffectiveSettings(wsId);
  const settings: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const key of WS_SETTINGS_KEYS) {
    const value = all[key] ?? '';
    settings[key] = maskValue(key, value);
    sources[key] = await getSettingSource(key, wsId);
  }
  return c.json({ settings, sources });
});

workspaceRoutes.put('/:id/settings', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const memberCheck = await db.execute({
    sql: 'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (memberCheck.rows.length === 0) return c.json({ error: 'forbidden' }, 403);
  const role = memberCheck.rows[0].role as string;
  if (role !== 'owner' && role !== 'admin') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<Record<string, string | null>>();
  for (const [key, value] of Object.entries(body)) {
    if (!WS_SETTINGS_KEYS.includes(key)) continue;
    await setWorkspaceSetting(wsId, key, value);
  }

  return c.json({ ok: true });
});

workspaceRoutes.post('/:id/invite', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const memberCheck = await db.execute({
    sql: 'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (memberCheck.rows.length === 0) return c.json({ error: 'forbidden' }, 403);
  const callerRole = memberCheck.rows[0].role as string;
  if (callerRole !== 'owner' && callerRole !== 'admin') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ email: string; role?: string }>();
  if (!body.email?.trim()) return c.json({ error: 'email_required' }, 400);

  const email = body.email.trim();
  const role = body.role === 'admin' ? 'admin' : 'member';

  const userRow = await db.execute({
    sql: 'SELECT id FROM user WHERE email = ?',
    args: [email],
  });

  if (userRow.rows.length === 0) {
    const userId = randomUUID();
    const now = new Date().toISOString();
    await db.execute({
      sql: 'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      args: [userId, email, email, 0, now, now],
    });
    await db.execute({
      sql: 'INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
      args: [randomUUID(), userId, wsId, role, now],
    });
    return c.json({ ok: true, created_user: true });
  }

  const userId = userRow.rows[0].id as string;
  const existingMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [userId, wsId],
  });
  if (existingMember.rows.length > 0) return c.json({ error: 'already_member' }, 409);

  await db.execute({
    sql: 'INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES (?, ?, ?, ?, ?)',
    args: [randomUUID(), userId, wsId, role, new Date().toISOString()],
  });

  return c.json({ ok: true, created_user: false });
});

workspaceRoutes.delete('/:id/members/:memberId', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const memberId = c.req.param('memberId');

  const callerCheck = await db.execute({
    sql: 'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (callerCheck.rows.length === 0) return c.json({ error: 'forbidden' }, 403);
  const callerRole = callerCheck.rows[0].role as string;
  if (callerRole !== 'owner' && callerRole !== 'admin') return c.json({ error: 'forbidden' }, 403);

  const target = await db.execute({
    sql: 'SELECT role FROM member WHERE id = ? AND organizationId = ?',
    args: [memberId, wsId],
  });
  if (target.rows.length === 0) return c.json({ error: 'not_found' }, 404);
  if (target.rows[0].role === 'owner') return c.json({ error: 'cannot_remove_owner' }, 403);

  await db.execute({
    sql: 'DELETE FROM member WHERE id = ? AND organizationId = ?',
    args: [memberId, wsId],
  });

  return c.json({ ok: true });
});

workspaceRoutes.patch('/:id/members/:memberId/role', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const memberId = c.req.param('memberId');

  const callerCheck = await db.execute({
    sql: 'SELECT role FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
  });
  if (callerCheck.rows.length === 0) return c.json({ error: 'forbidden' }, 403);
  if (callerCheck.rows[0].role !== 'owner') return c.json({ error: 'only_owner_can_change_roles' }, 403);

  const body = await c.req.json<{ role: string }>();
  if (!['admin', 'member'].includes(body.role)) return c.json({ error: 'invalid_role' }, 400);

  const target = await db.execute({
    sql: 'SELECT role FROM member WHERE id = ? AND organizationId = ?',
    args: [memberId, wsId],
  });
  if (target.rows.length === 0) return c.json({ error: 'not_found' }, 404);
  if (target.rows[0].role === 'owner') return c.json({ error: 'cannot_change_owner_role' }, 403);

  await db.execute({
    sql: 'UPDATE member SET role = ? WHERE id = ? AND organizationId = ?',
    args: [body.role, memberId, wsId],
  });

  return c.json({ ok: true });
});

workspaceRoutes.get('/:id/members', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const isMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
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
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const wsId = c.req.param('id');
  const isMember = await db.execute({
    sql: 'SELECT id FROM member WHERE userId = ? AND organizationId = ?',
    args: [ws.userId, wsId],
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
