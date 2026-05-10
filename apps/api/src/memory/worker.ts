import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { extractMemoryEpisodes } from './generate';
import { embedDocuments } from '../embeddings/voyage';

const IDLE_THRESHOLD_MS = 30 * 60 * 1000;
const PRUNE_AGE_DAYS = 90;

async function run(): Promise<void> {
  const cutoff = new Date(Date.now() - IDLE_THRESHOLD_MS).toISOString();
  const pruneCutoff = new Date(Date.now() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `DELETE FROM memory_episodes WHERE occurred_at < ? AND retrieval_hits = 0`,
    args: [pruneCutoff],
  });

  const idleSessions = await db.execute({
    sql: `SELECT cs.id
          FROM chat_sessions cs
          WHERE cs.updated_at < ?
            AND cs.id NOT IN (SELECT DISTINCT session_id FROM memory_episodes)
            AND (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) >= 2
          ORDER BY cs.updated_at DESC
          LIMIT 10`,
    args: [cutoff],
  });

  if (idleSessions.rows.length === 0) return;

  let created = 0;
  let embedded = 0;

  for (const row of idleSessions.rows) {
    const sessionId = row.id as string;

    const episodes = await extractMemoryEpisodes(sessionId);
    if (episodes.length === 0) continue;

    const summaries: string[] = [];
    const ids: string[] = [];

    for (const ep of episodes) {
      const id = randomUUID();
      ids.push(id);
      summaries.push(ep.summary);

      await db.execute({
        sql: `INSERT INTO memory_episodes (id, session_id, summary, entity_refs, occurred_at, retrieval_hits, embedding_status)
              VALUES (?, ?, ?, ?, ?, 0, 'pending')`,
        args: [id, sessionId, ep.summary, JSON.stringify(ep.entityRefs), new Date().toISOString()],
      });
      created++;
    }

    try {
      const embeddings = await embedDocuments(summaries);
      for (let i = 0; i < ids.length; i++) {
        const buf = new Float32Array(embeddings[i]);
        await db.execute({
          sql: `UPDATE memory_episodes SET embedding = ?, embedding_status = 'ready' WHERE id = ?`,
          args: [Buffer.from(buf.buffer), ids[i]],
        });
        embedded++;
      }
    } catch {
      for (const id of ids) {
        await db.execute({
          sql: `UPDATE memory_episodes SET embedding_status = 'error' WHERE id = ?`,
          args: [id],
        });
      }
    }
  }

  if (created > 0) {
    console.log(`[memory] ${created} episodes extracted, ${embedded} embedded`);
  }
}

export const memoryWorker = { run };
