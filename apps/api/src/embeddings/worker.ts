import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import { getEffectiveSetting } from '../db/settings';
import { buildEmbeddingInput, hashInput } from './input';
import { embedDocuments } from './voyage';
import { forEachWorkspace } from '../db/workspaces';

async function unlockStaleLocks(workspaceId: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.execute({
    sql: `UPDATE event_embeddings SET status = 'error', last_error = 'stale_lock' WHERE status = 'locked' AND locked_at < ? AND workspace_id = ?`,
    args: [staleThreshold, workspaceId],
  });
}

async function claimBatch(workspaceId: string): Promise<string[]> {
  const result = await db.execute({
    sql: `SELECT event_id FROM event_embeddings WHERE status IN ('pending','error') AND attempts < 5 AND workspace_id = ? ORDER BY embedded_at ASC NULLS FIRST LIMIT 10`,
    args: [workspaceId],
  });
  const ids = result.rows.map((r) => r.event_id as string);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  await db.execute({
    sql: `UPDATE event_embeddings SET status = 'locked', locked_at = ? WHERE event_id IN (${placeholders}) AND workspace_id = ?`,
    args: [new Date().toISOString(), ...ids, workspaceId],
  });
  return ids;
}

async function processEvent(eventId: string, workspaceId: string): Promise<void> {
  const evResult = await db.execute({
    sql: 'SELECT * FROM events WHERE id = ? AND workspace_id = ?',
    args: [eventId, workspaceId],
  });

  if (evResult.rows.length === 0) {
    await db.execute({
      sql: `UPDATE event_embeddings SET status = 'error', last_error = 'event_not_found', attempts = attempts + 1 WHERE event_id = ? AND workspace_id = ?`,
      args: [eventId, workspaceId],
    });
    return;
  }

  const row = evResult.rows[0];
  const event = rowToEvent(row as unknown as Record<string, unknown>);

  const factsResult = await db.execute({
    sql: 'SELECT facts_json FROM dynamic_facts WHERE event_id = ? AND workspace_id = ?',
    args: [eventId, workspaceId],
  });

  let facts: Record<string, unknown> | null = null;
  if (factsResult.rows.length > 0 && factsResult.rows[0].facts_json) {
    try {
      facts = JSON.parse(factsResult.rows[0].facts_json as string);
    } catch {
      facts = null;
    }
  }

  const input = buildEmbeddingInput(event, facts);
  const inputHash = hashInput(input);
  const embeddings = await embedDocuments([input], workspaceId);
  const embedding = embeddings[0];
  const vecJson = JSON.stringify(embedding);

  await db.execute({
    sql: `UPDATE event_embeddings SET embedding = vector32(?), status = 'ready', embedded_at = ?, attempts = attempts + 1, input_hash = ?, model = ?, dimensions = ? WHERE event_id = ? AND workspace_id = ?`,
    args: [vecJson, new Date().toISOString(), inputHash, await getEffectiveSetting('embedding_model', workspaceId), await getEffectiveSetting('embedding_dimensions', workspaceId), eventId, workspaceId],
  });
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    await unlockStaleLocks(workspaceId);
    const ids = await claimBatch(workspaceId);

    for (const eventId of ids) {
      try {
        await processEvent(eventId, workspaceId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.execute({
          sql: `UPDATE event_embeddings SET status = 'error', last_error = ?, attempts = attempts + 1 WHERE event_id = ? AND workspace_id = ?`,
          args: [msg, eventId, workspaceId],
        });
      }
    }
  });
}

export const embeddingWorker = { run };
