import { Hono } from 'hono';
import { db } from '../db/client';
import { requireWorkspace } from '../security/workspace';
import type { InferredFieldMapping } from '../types';

export const schemasRoutes = new Hono();

schemasRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const rows = await db.execute({
    sql: 'SELECT id, provider_type, event_type_pattern, sample_keys_hash, needs_review, inferred_at, confirmed_at, inferred_by FROM provider_schemas WHERE workspace_id = ? ORDER BY inferred_at DESC LIMIT ? OFFSET ?',
    args: [ws.workspaceId, limit, offset],
  });

  const countResult = await db.execute({ sql: 'SELECT COUNT(*) as total FROM provider_schemas WHERE workspace_id = ?', args: [ws.workspaceId] });
  const total = countResult.rows[0].total as number;

  return c.json({ schemas: rows.rows, total, limit, offset });
});

schemasRoutes.get('/jobs', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const rows = await db.execute({
    sql: 'SELECT * FROM schema_inference_jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50',
    args: [ws.workspaceId],
  });
  return c.json({ jobs: rows.rows });
});

schemasRoutes.get('/:id', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT * FROM provider_schemas WHERE id = ? AND workspace_id = ?',
    args: [id, ws.workspaceId],
  });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const row = result.rows[0];
  const schema = {
    ...row,
    field_mappings: JSON.parse(row.field_mappings_json as string) as InferredFieldMapping[],
    needs_review: Boolean(row.needs_review),
  };

  return c.json({ schema });
});

schemasRoutes.post('/:id/confirm', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT id, provider_type FROM provider_schemas WHERE id = ? AND workspace_id = ?',
    args: [id, ws.workspaceId],
  });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const providerType = result.rows[0].provider_type as string;
  const now = new Date().toISOString();

  await db.execute({
    sql: 'UPDATE provider_schemas SET confirmed_at = ?, needs_review = 0 WHERE id = ? AND workspace_id = ?',
    args: [now, id, ws.workspaceId],
  });

  await db.execute({
    sql: "UPDATE events SET quality = 'complete' WHERE workspace_id = ? AND id IN (SELECT event_id FROM dynamic_facts WHERE provider_type = ? AND workspace_id = ?)",
    args: [ws.workspaceId, providerType, ws.workspaceId],
  });

  return c.json({ ok: true });
});

schemasRoutes.post('/:id/reject', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT id FROM provider_schemas WHERE id = ? AND workspace_id = ?',
    args: [id, ws.workspaceId],
  });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  await db.execute({
    sql: 'DELETE FROM provider_schemas WHERE id = ? AND workspace_id = ?',
    args: [id, ws.workspaceId],
  });

  return c.json({ ok: true });
});
