import { db } from '../db/client';

export type ResourceChunk = {
  id: string;
  resourceId: string;
  resourceTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export async function fetchResourceChunks(queryEmbedding: number[]): Promise<ResourceChunk[]> {
  try {
    const buf = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const result = await db.execute({
      sql: `SELECT rc.id, rc.resource_id, rc.chunk_index, rc.content, r.title AS resource_title,
                   vector_distance_cos(rc.embedding, ?) AS distance
            FROM resource_chunks rc
            JOIN resources r ON r.id = rc.resource_id
            WHERE rc.embedding_status = 'ready' AND r.status = 'ready'
            ORDER BY distance ASC
            LIMIT 5`,
      args: [buf],
    });

    return result.rows.map((r) => ({
      id: r.id as string,
      resourceId: r.resource_id as string,
      resourceTitle: r.resource_title as string,
      chunkIndex: r.chunk_index as number,
      content: r.content as string,
      score: typeof r.distance === 'number' ? Math.max(0, 1 - r.distance) : 0,
    }));
  } catch {
    return [];
  }
}
