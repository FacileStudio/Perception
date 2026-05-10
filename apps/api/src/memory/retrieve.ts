import { db } from '../db/client';
import type { MemoryEpisode } from './types';

export async function fetchMemoryEpisodes(queryEmbedding: number[]): Promise<MemoryEpisode[]> {
  try {
    const buf = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const result = await db.execute({
      sql: `SELECT id, session_id, summary, entity_refs, occurred_at, retrieval_hits
            FROM memory_episodes
            WHERE embedding_status = 'ready'
            ORDER BY vector_distance_cos(embedding, ?) ASC
            LIMIT 3`,
      args: [buf],
    });

    if (result.rows.length === 0) return [];

    const ids = result.rows.map((r) => r.id as string);
    const placeholders = ids.map(() => '?').join(',');
    db.execute({
      sql: `UPDATE memory_episodes SET retrieval_hits = retrieval_hits + 1 WHERE id IN (${placeholders})`,
      args: ids,
    }).catch(() => {});

    return result.rows.map((r) => ({
      id: r.id as string,
      sessionId: r.session_id as string,
      summary: r.summary as string,
      entityRefs: JSON.parse(r.entity_refs as string) as string[],
      occurredAt: r.occurred_at as string,
      retrievalHits: (r.retrieval_hits as number) + 1,
      embeddingStatus: 'ready' as const,
    }));
  } catch {
    return [];
  }
}
