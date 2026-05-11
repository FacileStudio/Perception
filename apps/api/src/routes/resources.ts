import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { requireSession } from '../security/session';
import { db } from '../db/client';
import { processResource } from '../resources/process';

export const resourcesRoutes = new Hono();

const EXTENSION_MIMES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
};

function mimeFromName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return EXTENSION_MIMES[name.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

const SUPPORTED_MIMES = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];

type PendingUpload = {
  name: string;
  type: string;
  totalChunks: number;
  chunks: Map<number, Buffer>;
  createdAt: number;
};

const pendingUploads = new Map<string, PendingUpload>();

setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, u] of pendingUploads) {
    if (u.createdAt < cutoff) pendingUploads.delete(id);
  }
}, 60_000);

resourcesRoutes.post('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{
    upload_id: string;
    name: string;
    type: string;
    chunk_index: number;
    total_chunks: number;
    data: string;
  }>();

  if (!body.upload_id || !body.name || body.total_chunks < 1) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const mime = body.type || mimeFromName(body.name);
  if (!SUPPORTED_MIMES.some((t) => mime.startsWith(t.split('/')[0]) || mime === t)) {
    return c.json({ error: 'unsupported_mime_type', mime_type: mime, supported: SUPPORTED_MIMES }, 400);
  }

  let upload = pendingUploads.get(body.upload_id);
  if (!upload) {
    upload = { name: body.name, type: mime, totalChunks: body.total_chunks, chunks: new Map(), createdAt: Date.now() };
    pendingUploads.set(body.upload_id, upload);
  }

  upload.chunks.set(body.chunk_index, Buffer.from(body.data, 'base64'));

  if (upload.chunks.size < upload.totalChunks) {
    return c.json({ ok: true });
  }

  const buffers: Buffer[] = [];
  for (let i = 0; i < upload.totalChunks; i++) {
    const chunk = upload.chunks.get(i);
    if (!chunk) {
      pendingUploads.delete(body.upload_id);
      return c.json({ error: 'missing_chunk', chunk_index: i }, 400);
    }
    buffers.push(chunk);
  }
  const buffer = Buffer.concat(buffers);
  pendingUploads.delete(body.upload_id);

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO resources (id, title, description, mime_type, file_size, source_type, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, 'upload', ?, ?)`,
    args: [id, upload.name, '', upload.type, buffer.length, now, now],
  });

  processResource(id, buffer, upload.type).catch(console.error);

  return c.json({ id }, 201);
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
