import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { processResource } from './process';

type Attachment = {
  name: string;
  mime_type: string;
  url: string;
  size?: number;
};

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const FETCH_TIMEOUT_MS = 30_000;

export async function extractEventAttachments(
  eventId: string,
  attachments: Attachment[],
): Promise<string[]> {
  const resourceIds: string[] = [];

  for (const att of attachments) {
    if (!SUPPORTED_MIME_TYPES.has(att.mime_type)) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(att.url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      const id = randomUUID();
      const now = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO resources (id, title, description, mime_type, file_size, source_type, source_event_id, status, uploaded_at, updated_at)
              VALUES (?, ?, '', ?, ?, 'event_attachment', ?, 'processing', ?, ?)`,
        args: [id, att.name, att.mime_type, buffer.length, eventId, now, now],
      });

      processResource(id, buffer, att.mime_type).catch((err) => {
        db.execute({
          sql: `UPDATE resources SET status = 'error', error = ?, updated_at = ? WHERE id = ?`,
          args: [err instanceof Error ? err.message : String(err), new Date().toISOString(), id],
        }).catch(() => {});
      });

      resourceIds.push(id);
    } catch {
      // skip failed attachments
    }
  }

  return resourceIds;
}
