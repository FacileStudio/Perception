import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getLatestSnapshotGeneratedAt, getLatestSnapshots, hasAllExpectedKinds, refreshSnapshots } from '../stats/snapshots';
import { db } from '../db/client';

export const statsRoutes = new Hono();

const STATS_STALE_MS = 15 * 60 * 1000;

statsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const forceRefresh = c.req.query('refresh') === '1';
  const latestGeneratedAt = await getLatestSnapshotGeneratedAt();
  const shouldBootstrap = latestGeneratedAt === null;
  const isStale = latestGeneratedAt !== null && Date.now() - new Date(latestGeneratedAt).getTime() > STATS_STALE_MS;
  const missingKinds = !shouldBootstrap && !(await hasAllExpectedKinds());

  if (forceRefresh || shouldBootstrap || isStale || missingKinds) {
    await refreshSnapshots();
  }

  const [snapshots, graphHealthRow] = await Promise.all([
    getLatestSnapshots(),
    db.execute(`SELECT * FROM graph_health_snapshots ORDER BY computed_at DESC LIMIT 1`).catch(() => ({ rows: [] })),
  ]);

  const graphHealth = graphHealthRow.rows.length > 0
    ? {
        computed_at: graphHealthRow.rows[0].computed_at,
        node_count: graphHealthRow.rows[0].node_count,
        edge_count: graphHealthRow.rows[0].edge_count,
        degree_entropy: graphHealthRow.rows[0].degree_entropy,
        isolated_node_ratio: graphHealthRow.rows[0].isolated_node_ratio,
        largest_component_ratio: graphHealthRow.rows[0].largest_component_ratio,
      }
    : null;

  return c.json({ snapshots, graph_health: graphHealth });
});
