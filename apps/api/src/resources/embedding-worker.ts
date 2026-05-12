import { db } from '../db/client';
import { embedDocuments } from '../embeddings/voyage';
import { hashChunkInput } from './chunker';
import { forEachWorkspace } from '../db/workspaces';

async function unlockStaleLocks(workspaceId: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.execute({
    sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = 'stale_lock' WHERE embedding_status = 'locked' AND locked_at < ? AND workspace_id = ?`,
    args: [staleThreshold, workspaceId],
  });
}

async function claimBatch(workspaceId: string): Promise<string[]> {
  const result = await db.execute({
    sql: `SELECT id FROM resource_chunks WHERE embedding_status IN ('pending','error') AND attempts < 5 AND workspace_id = ? ORDER BY chunk_index ASC LIMIT 10`,
    args: [workspaceId],
  });
  const ids = result.rows.map((r) => r.id as string);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  await db.execute({
    sql: `UPDATE resource_chunks SET embedding_status = 'locked', locked_at = ? WHERE id IN (${placeholders}) AND workspace_id = ?`,
    args: [new Date().toISOString(), ...ids, workspaceId],
  });
  return ids;
}

async function processChunk(chunkId: string, workspaceId: string): Promise<void> {
  const result = await db.execute({
    sql: `SELECT rc.content, r.title FROM resource_chunks rc JOIN resources r ON r.id = rc.resource_id WHERE rc.id = ? AND rc.workspace_id = ?`,
    args: [chunkId, workspaceId],
  });

  if (result.rows.length === 0) {
    await db.execute({
      sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = 'chunk_not_found', attempts = attempts + 1 WHERE id = ? AND workspace_id = ?`,
      args: [chunkId, workspaceId],
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
    sql: `UPDATE resource_chunks SET embedding = vector32(?), embedding_status = 'ready', input_hash = ?, attempts = attempts + 1 WHERE id = ? AND workspace_id = ?`,
    args: [vecJson, inputHash, chunkId, workspaceId],
  });
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    await unlockStaleLocks(workspaceId);
    const ids = await claimBatch(workspaceId);

    for (const chunkId of ids) {
      try {
        await processChunk(chunkId, workspaceId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.execute({
          sql: `UPDATE resource_chunks SET embedding_status = 'error', last_error = ?, attempts = attempts + 1 WHERE id = ? AND workspace_id = ?`,
          args: [msg, chunkId, workspaceId],
        });
      }
    }
  });
}

export const resourceEmbeddingWorker = { run };
