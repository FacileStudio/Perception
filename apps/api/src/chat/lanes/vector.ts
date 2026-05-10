import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { ScoredEvent } from './types';

export async function vectorLane(queryEmbedding: number[]): Promise<ScoredEvent<'vector'>[]> {
  try {
    const vecJson = JSON.stringify(queryEmbedding);
    const result = await db.execute({
      sql: `SELECT e.*, v.distance AS score FROM vector_top_k('event_embeddings_vector_idx', vector32(?), 40) v JOIN event_embeddings ee ON ee.rowid = v.id JOIN events e ON e.id = ee.event_id WHERE ee.status = 'ready'`,
      args: [vecJson],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? Math.max(0, 1 - r.score) : 0,
      source: 'vector' as const,
    }));
  } catch {
    return [];
  }
}
