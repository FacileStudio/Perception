import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { computePersistence } from './persistent-homology';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const [edgeRows, nodeRows] = await Promise.all([
      db.execute({
        sql: 'SELECT from_entity_id, to_entity_id, confidence FROM entity_relations WHERE workspace_id = ?',
        args: [workspaceId],
      }),
      db.execute({
        sql: `SELECT DISTINCT id FROM entities WHERE workspace_id = ? AND id IN (
          SELECT from_entity_id FROM entity_relations WHERE workspace_id = ?
          UNION
          SELECT to_entity_id FROM entity_relations WHERE workspace_id = ?
          UNION
          SELECT entity_id FROM event_entities
        )`,
        args: [workspaceId, workspaceId, workspaceId],
      }),
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
      sql: `INSERT INTO topology_snapshots (id, computed_at, h0_component_count, h1_loop_count, max_h0_persistence, persistence_pairs, gap_entity_ids, workspace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        now,
        result.h0ComponentCount,
        result.h1LoopCount,
        result.maxH0Persistence,
        JSON.stringify(result.pairs),
        JSON.stringify(result.gapEntityIds),
        workspaceId,
      ],
    });

    console.log(
      `[tda] h0=${result.h0ComponentCount} h1=${result.h1LoopCount} gaps=${result.gapEntityIds.length} (workspace ${workspaceId})`,
    );
  });
}

export const tdaWorker = { run };
