import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { computePersistence } from './persistent-homology';

async function run(): Promise<void> {
  const [edgeRows, nodeRows] = await Promise.all([
    db.execute(
      'SELECT from_entity_id, to_entity_id, confidence FROM entity_relations',
    ),
    db.execute(
      `SELECT DISTINCT id FROM entities WHERE id IN (
        SELECT from_entity_id FROM entity_relations
        UNION
        SELECT to_entity_id FROM entity_relations
        UNION
        SELECT entity_id FROM event_entities
      )`,
    ),
  ]);

  const edges = edgeRows.rows.map((r) => ({
    from: r.from_entity_id as string,
    to: r.to_entity_id as string,
    weight: 1 - (r.confidence as number),
  }));

  const nodes = nodeRows.rows.map((r) => r.id as string);

  const result = computePersistence(nodes, edges);

  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO topology_snapshots (id, computed_at, h0_component_count, h1_loop_count, max_h0_persistence, persistence_pairs, gap_entity_ids)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      now,
      result.h0ComponentCount,
      result.h1LoopCount,
      result.maxH0Persistence,
      JSON.stringify(result.pairs),
      JSON.stringify(result.gapEntityIds),
    ],
  });

  console.log(
    `[tda] h0=${result.h0ComponentCount} h1=${result.h1LoopCount} gaps=${result.gapEntityIds.length}`,
  );
}

export const tdaWorker = { run };
