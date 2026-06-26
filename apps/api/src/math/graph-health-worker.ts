import { randomUUID } from 'crypto';
import { log } from '../lib/logger';
import { db } from '../db/client';
import { computeGraphHealth } from './graph-entropy';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const [nodesResult, edgesResult, activeEntitiesResult] = await Promise.all([
      db.execute({ sql: `SELECT id FROM entities WHERE workspace_id = ?`, args: [workspaceId] }),
      db.execute({ sql: `SELECT from_entity_id AS "from", to_entity_id AS "to" FROM entity_relations WHERE workspace_id = ?`, args: [workspaceId] }),
      db.execute({
        sql: `SELECT DISTINCT ee.entity_id FROM event_entities ee
         JOIN events ev ON ev.id = ee.event_id
         WHERE ev.occurred_at > datetime('now', '-90 days') AND ev.workspace_id = ?`,
        args: [workspaceId],
      }),
    ]);

    const nodes = nodesResult.rows.map((r) => r.id as string);
    const edges = edgesResult.rows.map((r) => ({
      from: r.from as string,
      to: r.to as string,
    }));
    const entityIdsWithEvents = new Set(activeEntitiesResult.rows.map((r) => r.entity_id as string));

    const health = computeGraphHealth(nodes, edges, entityIdsWithEvents);

    await db.execute({
      sql: `INSERT INTO graph_health_snapshots (id, computed_at, node_count, edge_count, degree_entropy, isolated_node_ratio, largest_component_ratio, workspace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        new Date().toISOString(),
        health.nodeCount,
        health.edgeCount,
        health.degreeEntropy,
        health.isolatedNodeRatio,
        health.largestComponentRatio,
        workspaceId,
      ],
    });

    log.info('graph health computed', {
      tag: 'graph-health',
      nodes: health.nodeCount,
      edges: health.edgeCount,
      entropy: parseFloat(health.degreeEntropy.toFixed(2)),
      isolated_pct: parseFloat((health.isolatedNodeRatio * 100).toFixed(1)),
      lcc_pct: parseFloat((health.largestComponentRatio * 100).toFixed(1)),
      workspaceId,
    });
  });
}

export const graphHealthWorker = { run };
