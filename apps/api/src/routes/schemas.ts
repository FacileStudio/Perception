import { Hono } from 'hono';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import type { InferredFieldMapping } from '../types';

export const schemasRoutes = new Hono();

schemasRoutes.use('*', async (c, next) => {
  const ok = await requireSession(c);
  if (!ok) return c.json({ error: 'unauthorized' }, 401);
  return next();
});

schemasRoutes.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const rows = await db.execute({
    sql: 'SELECT id, provider_type, event_type_pattern, sample_keys_hash, needs_review, inferred_at, confirmed_at, inferred_by FROM provider_schemas ORDER BY inferred_at DESC LIMIT ? OFFSET ?',
    args: [limit, offset],
  });

  const countResult = await db.execute('SELECT COUNT(*) as total FROM provider_schemas');
  const total = countResult.rows[0].total as number;

  return c.json({ schemas: rows.rows, total, limit, offset });
});

schemasRoutes.get('/jobs', async (c) => {
  const rows = await db.execute(
    'SELECT * FROM schema_inference_jobs ORDER BY created_at DESC LIMIT 50',
  );
  return c.json({ jobs: rows.rows });
});

schemasRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT * FROM provider_schemas WHERE id = ?',
    args: [id],
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
  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT id, provider_type FROM provider_schemas WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const providerType = result.rows[0].provider_type as string;
  const now = new Date().toISOString();

  await db.execute({
    sql: 'UPDATE provider_schemas SET confirmed_at = ?, needs_review = 0 WHERE id = ?',
    args: [now, id],
  });

  await db.execute({
    sql: "UPDATE events SET quality = 'complete' WHERE id IN (SELECT event_id FROM dynamic_facts WHERE provider_type = ?)",
    args: [providerType],
  });

  return c.json({ ok: true });
});

schemasRoutes.post('/:id/reject', async (c) => {
  const id = c.req.param('id');
  const result = await db.execute({
    sql: 'SELECT id FROM provider_schemas WHERE id = ?',
    args: [id],
  });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  await db.execute({
    sql: 'DELETE FROM provider_schemas WHERE id = ?',
    args: [id],
  });

  return c.json({ ok: true });
});
