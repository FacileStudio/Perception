import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { requireSession } from '../security/session';
import { db } from '../db/client';
import { processResource } from '../resources/process';

export const resourcesRoutes = new Hono();

resourcesRoutes.post('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string) || '';
  const description = (formData.get('description') as string) || '';

  if (!file) return c.json({ error: 'file_required' }, 400);

  const supported = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];
  if (!supported.some((t) => file.type.startsWith(t.split('/')[0]) || file.type === t)) {
    return c.json({ error: 'unsupported_mime_type', mime_type: file.type, supported }, 400);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const buffer = Buffer.from(await file.arrayBuffer());

  await db.execute({
    sql: `INSERT INTO resources (id, title, description, mime_type, file_size, source_type, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, 'upload', ?, ?)`,
    args: [id, title || file.name, description, file.type, buffer.length, now, now],
  });

  processResource(id, buffer, file.type).catch(console.error);

  return c.json({ id, title: title || file.name, status: 'processing' }, 201);
});

resourcesRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute(
    `SELECT id, title, description, mime_type, file_size, source_type, chunk_count, status, error, uploaded_at, updated_at
     FROM resources ORDER BY uploaded_at DESC LIMIT 100`,
  );

  return c.json({
    resources: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      mime_type: r.mime_type,
      file_size: r.file_size,
      source_type: r.source_type,
      chunk_count: r.chunk_count,
      status: r.status,
      error: r.error,
      uploaded_at: r.uploaded_at,
      updated_at: r.updated_at,
    })),
  });
});

resourcesRoutes.get('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const [resource, chunks] = await Promise.all([
    db.execute({ sql: `SELECT * FROM resources WHERE id = ?`, args: [id] }),
    db.execute({ sql: `SELECT id, chunk_index, content, token_count, embedding_status FROM resource_chunks WHERE resource_id = ? ORDER BY chunk_index`, args: [id] }),
  ]);

  if (resource.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const r = resource.rows[0];
  return c.json({
    id: r.id,
    title: r.title,
    description: r.description,
    mime_type: r.mime_type,
    file_size: r.file_size,
    source_type: r.source_type,
    chunk_count: r.chunk_count,
    status: r.status,
    error: r.error,
    uploaded_at: r.uploaded_at,
    updated_at: r.updated_at,
    chunks: chunks.rows.map((ch) => ({
      id: ch.id,
      chunk_index: ch.chunk_index,
      content: ch.content,
      token_count: ch.token_count,
      embedding_status: ch.embedding_status,
    })),
  });
});

resourcesRoutes.delete('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({ sql: `SELECT id FROM resources WHERE id = ?`, args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  await db.execute({ sql: `DELETE FROM resource_chunks WHERE resource_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM resources WHERE id = ?`, args: [id] });

  return c.json({ ok: true });
});
