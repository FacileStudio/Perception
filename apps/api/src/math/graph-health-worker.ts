import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { computeGraphHealth } from './graph-entropy';

async function run(): Promise<void> {
  const [nodesResult, edgesResult, activeEntitiesResult] = await Promise.all([
    db.execute(`SELECT id FROM entities`),
    db.execute(`SELECT from_entity_id AS "from", to_entity_id AS "to" FROM entity_relations`),
    db.execute(
      `SELECT DISTINCT ee.entity_id FROM event_entities ee
       JOIN events ev ON ev.id = ee.event_id
       WHERE ev.occurred_at > datetime('now', '-90 days')`,
    ),
  ]);

  const nodes = nodesResult.rows.map((r) => r.id as string);
  const edges = edgesResult.rows.map((r) => ({
    from: r.from as string,
    to: r.to as string,
  }));
  const entityIdsWithEvents = new Set(activeEntitiesResult.rows.map((r) => r.entity_id as string));

  const health = computeGraphHealth(nodes, edges, entityIdsWithEvents);

  await db.execute({
    sql: `INSERT INTO graph_health_snapshots (id, computed_at, node_count, edge_count, degree_entropy, isolated_node_ratio, largest_component_ratio)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      new Date().toISOString(),
      health.nodeCount,
      health.edgeCount,
      health.degreeEntropy,
      health.isolatedNodeRatio,
      health.largestComponentRatio,
    ],
  });

  console.log(
    `[graph-health] nodes=${health.nodeCount} edges=${health.edgeCount} ` +
    `entropy=${health.degreeEntropy.toFixed(2)} isolated=${(health.isolatedNodeRatio * 100).toFixed(1)}% ` +
    `lcc=${(health.largestComponentRatio * 100).toFixed(1)}%`,
  );
}

export const graphHealthWorker = { run };
