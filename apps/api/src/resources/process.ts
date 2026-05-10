import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { extractText } from './extract';
import { chunkText, hashChunkInput } from './chunker';

export async function processResource(resourceId: string, buffer: Buffer, mimeType: string): Promise<void> {
  try {
    const text = await extractText(buffer, mimeType);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await db.execute({
        sql: `UPDATE resources SET status = 'error', error = 'no_text_extracted', updated_at = ? WHERE id = ?`,
        args: [new Date().toISOString(), resourceId],
      });
      return;
    }

    const statements = chunks.map((chunk) => ({
      sql: `INSERT INTO resource_chunks (id, resource_id, chunk_index, content, token_count, input_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), resourceId, chunk.chunkIndex, chunk.content, chunk.tokenCount, hashChunkInput(chunk.content)],
    }));

    await db.batch(statements);

    await db.execute({
      sql: `UPDATE resources SET chunk_count = ?, status = 'ready', updated_at = ? WHERE id = ?`,
      args: [chunks.length, new Date().toISOString(), resourceId],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.execute({
      sql: `UPDATE resources SET status = 'error', error = ?, updated_at = ? WHERE id = ?`,
      args: [msg, new Date().toISOString(), resourceId],
    });
  }
}
