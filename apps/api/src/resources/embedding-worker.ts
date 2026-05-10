import { db } from '../db/client';
import { embedDocuments } from '../embeddings/voyage';
import { hashChunkInput } from './chunker';

async function unlockStaleLocks(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.execute({
    sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = 'stale_lock' WHERE embedding_status = 'locked' AND locked_at < ?`,
    args: [staleThreshold],
  });
}

async function claimBatch(): Promise<string[]> {
  const result = await db.execute({
    sql: `SELECT id FROM resource_chunks WHERE embedding_status IN ('pending','error') AND attempts < 5 ORDER BY chunk_index ASC LIMIT 10`,
    args: [],
  });
  const ids = result.rows.map((r) => r.id as string);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  await db.execute({
    sql: `UPDATE resource_chunks SET embedding_status = 'locked', locked_at = ? WHERE id IN (${placeholders})`,
    args: [new Date().toISOString(), ...ids],
  });
  return ids;
}

async function processChunk(chunkId: string): Promise<void> {
  const result = await db.execute({
    sql: `SELECT rc.content, r.title FROM resource_chunks rc JOIN resources r ON r.id = rc.resource_id WHERE rc.id = ?`,
    args: [chunkId],
  });

  if (result.rows.length === 0) {
    await db.execute({
      sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = 'chunk_not_found', attempts = attempts + 1 WHERE id = ?`,
      args: [chunkId],
    });
    return;
  }

  const row = result.rows[0];
  const title = row.title as string;
  const content = row.content as string;
  const input = `${title}: ${content}`;
  const inputHash = hashChunkInput(input);
  const embeddings = await embedDocuments([input]);
  const vecJson = JSON.stringify(embeddings[0]);

  await db.execute({
    sql: `UPDATE resource_chunks SET embedding = vector32(?), embedding_status = 'ready', input_hash = ?, attempts = attempts + 1 WHERE id = ?`,
    args: [vecJson, inputHash, chunkId],
  });
}

async function run(): Promise<void> {
  await unlockStaleLocks();
  const ids = await claimBatch();

  for (const chunkId of ids) {
    try {
      await processChunk(chunkId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.execute({
        sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = ?, attempts = attempts + 1 WHERE id = ?`,
        args: [msg, chunkId],
      });
    }
  }
}

export const resourceEmbeddingWorker = { run };
