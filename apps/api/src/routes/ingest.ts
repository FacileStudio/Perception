import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { verifyNookSignature } from '../security/hmac';
import { processIngestEvent } from '../ingest/pipeline';
import type { NookEventEnvelope } from '../types';

export const ingestRoutes = new Hono();

async function resolveIngestWorkspace(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } }): Promise<string> {
  const fromHeader = c.req.header('x-perception-workspace');
  if (fromHeader) return fromHeader;

  const fromQuery = c.req.query('workspace');
  if (fromQuery) return fromQuery;

  const setting = await db.execute("SELECT value FROM app_settings WHERE key = 'default_workspace_id'");
  if (setting.rows.length > 0) return setting.rows[0].value as string;

  const first = await db.execute('SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1');
  if (first.rows.length > 0) return first.rows[0].id as string;

  return 'default';
}

ingestRoutes.post('/', async (c) => {
  const rawBody = await c.req.text();

  const eventId = c.req.header('x-nook-event-id') ?? '';
  const timestamp = c.req.header('x-nook-timestamp') ?? '';
  const schemaVersion = c.req.header('x-nook-schema-version') ?? '';
  const signature = c.req.header('x-nook-signature-256') ?? '';

  const workspaceId = await resolveIngestWorkspace(c);

  const hmacResult = await verifyNookSignature(rawBody, {
    eventId,
    timestamp,
    schemaVersion,
    signature,
  });

  if (!hmacResult.ok) {
    const ip = c.req.header('x-forwarded-for') ?? '';
    const ipHash = createHash('sha256').update(ip).digest('hex');
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    await db.execute({
      sql: 'INSERT INTO ingest_rejections (id, received_at, reason, event_id, source_ip_hash, payload_hash, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), new Date().toISOString(), hmacResult.reason, eventId || null, ipHash, bodyHash, workspaceId],
    });
    return c.json({ error: 'unauthorized', reason: hmacResult.reason }, 401);
  }

  let envelope: NookEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as NookEventEnvelope;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const result = await processIngestEvent(envelope, workspaceId);

  if ('error' in result) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result, 202);
});
