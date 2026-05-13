import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

export async function retryFailedEmbeddings(workspaceId: string = ''): Promise<number> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0, last_error = NULL WHERE status = 'error'${wsFilter}`,
    args,
  });
  return result.rowsAffected;
}

export async function backfillMissingEmbeddings(workspaceId: string = ''): Promise<number> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [await getEffectiveSetting('embedding_model', workspaceId), await getEffectiveSetting('embedding_dimensions', workspaceId)];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO event_embeddings (event_id, model, dimensions, input_hash, status, workspace_id) SELECT id, ?, ?, '', 'pending', workspace_id FROM events WHERE id NOT IN (SELECT event_id FROM event_embeddings)${wsFilter}`,
    args,
  });
  return result.rowsAffected;
}

export async function getEmbeddingStats(workspaceId: string = ''): Promise<{ total: number; pending: number; ready: number; error: number; locked: number }> {
  const wsFilter = workspaceId ? ' WHERE workspace_id = ?' : '';
  const args: (string | number | null)[] = [];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT status, COUNT(*) AS cnt FROM event_embeddings${wsFilter} GROUP BY status`,
    args,
  });

  const stats: Record<string, number> = { pending: 0, ready: 0, error: 0, locked: 0 };
  for (const row of result.rows) {
    stats[row.status as string] = Number(row.cnt);
  }
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return { total, ...stats } as { total: number; pending: number; ready: number; error: number; locked: number };
}

export async function reembedAll(workspaceId: string = ''): Promise<number> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0, last_error = NULL WHERE status IN ('ready', 'error')${wsFilter}`,
    args,
  });
  return result.rowsAffected;
}
