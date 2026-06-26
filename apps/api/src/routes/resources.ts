import { Hono } from 'hono';
import { log } from '../lib/logger';
import { randomUUID } from 'crypto';
import { basename } from 'node:path';
import { requireWorkspace } from '../security/workspace';
import { db } from '../db/client';
import { processResource } from '../resources/process';
import { saveUpload, readUpload, removeUpload, uploadExists } from '../resources/storage';

export const resourcesRoutes = new Hono();

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
  '.csv': 'text/csv', '.json': 'application/json',
};

const SUPPORTED = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];

function resolveMime(name: string, type: string): string {
  if (type && type !== 'application/octet-stream') return type;
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? (MIME_BY_EXT[name.slice(dot).toLowerCase()] ?? 'application/octet-stream') : 'application/octet-stream';
}

resourcesRoutes.post('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let body: Record<string, string | File | (string | File)[]>;
    try {
      body = await c.req.parseBody({ all: true });
    } catch (err) {
      log.error('multipart parse failed', { tag: 'resources', error: err instanceof Error ? err.message : String(err) });
      return c.json({ error: 'invalid_multipart_body' }, 400);
    }
    const raw = body['files'];
    const fileEntries = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const files = fileEntries.filter((f): f is File => f instanceof File);

    if (!files.length) return c.json({ error: 'file_required' }, 400);

    const resolved = files.map((f) => ({ file: f, mime: resolveMime(f.name, f.type) }));
    const bad = resolved.find((r) => !SUPPORTED.includes(r.mime));
    if (bad) return c.json({ error: 'unsupported_mime_type', mime_type: bad.mime, supported: SUPPORTED }, 400);

    const ids: string[] = [];

    for (const { file, mime } of resolved) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = await saveUpload(id, buffer, mime);

      await db.execute({
        sql: `INSERT INTO resources (id, workspace_id, title, description, mime_type, file_size, source_type, file_path, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'upload', ?, ?, ?)`,
        args: [id, ws.workspaceId, file.name, '', mime, buffer.length, filePath, now, now],
      });

      processResource(id, buffer, mime).catch((err) => log.error('resource processing failed', { tag: 'resources', resourceId: id, error: err instanceof Error ? err.message : String(err) }));
      ids.push(id);
    }

    return c.json({ ids }, 201);
  }

  const { files } = await c.req.json<{ files: Array<{ name: string; type: string; data: string }> }>();
  if (!files?.length) return c.json({ error: 'file_required' }, 400);

  const resolvedJson = files.map((f) => ({ file: f, mime: resolveMime(f.name, f.type) }));
  const badJson = resolvedJson.find((r) => !SUPPORTED.includes(r.mime));
  if (badJson) return c.json({ error: 'unsupported_mime_type', mime_type: badJson.mime, supported: SUPPORTED }, 400);

  const ids: string[] = [];

  for (const { file, mime } of resolvedJson) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const buffer = Buffer.from(file.data, 'base64');
    const filePath = await saveUpload(id, buffer, mime);

    await db.execute({
      sql: `INSERT INTO resources (id, workspace_id, title, description, mime_type, file_size, source_type, file_path, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'upload', ?, ?, ?)`,
      args: [id, ws.workspaceId, file.name, '', mime, buffer.length, filePath, now, now],
    });

    processResource(id, buffer, mime).catch((err) => log.error('resource processing failed', { tag: 'resources', resourceId: id, error: err instanceof Error ? err.message : String(err) }));
    ids.push(id);
  }

  return c.json({ ids }, 201);
});

resourcesRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `SELECT id, title, description, mime_type, file_size, source_type, chunk_count, status, error, uploaded_at, updated_at,
            file_path IS NOT NULL AS has_file
     FROM resources WHERE workspace_id = ? ORDER BY uploaded_at DESC LIMIT 100`,
    args: [ws.workspaceId],
  });

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
      has_file: !!r.has_file,
    })),
  });
});

resourcesRoutes.get('/:id', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const [resource, chunks] = await Promise.all([
    db.execute({ sql: `SELECT *, file_path IS NOT NULL AS has_file FROM resources WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] }),
    db.execute({ sql: `SELECT id, chunk_index, content, token_count, embedding_status FROM resource_chunks WHERE resource_id = ? AND workspace_id = ? ORDER BY chunk_index`, args: [id, ws.workspaceId] }),
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
    has_file: !!r.has_file,
    chunks: chunks.rows.map((ch) => ({
      id: ch.id,
      chunk_index: ch.chunk_index,
      content: ch.content,
      token_count: ch.token_count,
      embedding_status: ch.embedding_status,
    })),
  });
});

resourcesRoutes.get('/:id/file', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({ sql: `SELECT title, mime_type, file_path FROM resources WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });

  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const r = result.rows[0];
  const filePath = r.file_path as string | null;

  if (!filePath || !(await uploadExists(filePath))) {
    return c.json({ error: 'file_not_available' }, 404);
  }

  const buffer = await readUpload(filePath);
  const rawName = (r.title as string) || basename(filePath);
  const safeName = rawName.replace(/["\r\n\\]/g, '_').replace(/[^\x20-\x7E]/g, '_');

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': r.mime_type as string,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buffer.length),
    },
  });
});

resourcesRoutes.delete('/:id', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({ sql: `SELECT id, file_path FROM resources WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const filePath = result.rows[0].file_path as string | null;

  await db.execute({ sql: `DELETE FROM resource_chunks WHERE resource_id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });
  await db.execute({ sql: `DELETE FROM resources WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });

  if (filePath) {
    await removeUpload(filePath).catch((err) => log.error('upload removal failed', { tag: 'resources', error: err instanceof Error ? err.message : String(err) }));
  }

  return c.json({ ok: true });
});
