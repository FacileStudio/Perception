import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getLatestSnapshotGeneratedAt, getLatestSnapshots, hasAllExpectedKinds, refreshSnapshots } from '../stats/snapshots';
import { db } from '../db/client';
import { daysAgoIso } from '../lib/time';

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

statsRoutes.get('/intelligence', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const thirtyDaysAgo = daysAgoIso(30);

  const [
    graphHealthRow,
    memoryCount,
    changePointsRow,
    driftAlertsRow,
    totalEntities,
    entitiesWithNarratives,
    entitiesInCommunities,
    entitiesWithRelations,
    changePointsList,
    providerHealth,
    isolatedEntities,
    driftAlertsList,
  ] = await Promise.all([
    db.execute(`SELECT * FROM graph_health_snapshots ORDER BY computed_at DESC LIMIT 1`).catch(() => ({ rows: [] })),
    db.execute(`SELECT COUNT(*) AS cnt FROM memory_episodes`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute({ sql: `SELECT COUNT(*) AS cnt FROM change_points WHERE detected_at > ?`, args: [thirtyDaysAgo] }).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute({ sql: `SELECT COUNT(*) AS cnt FROM concept_drift_alerts WHERE detected_at > ?`, args: [thirtyDaysAgo] }).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(`SELECT COUNT(*) AS cnt FROM entities`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(`SELECT COUNT(*) AS cnt FROM entity_narratives`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(`SELECT COUNT(DISTINCT m.value) AS cnt FROM entity_communities ec, json_each(ec.member_entity_ids) AS m WHERE ec.stale = 0`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute(`SELECT COUNT(*) AS cnt FROM (SELECT DISTINCT from_entity_id AS eid FROM entity_relations UNION SELECT DISTINCT to_entity_id AS eid FROM entity_relations)`).catch(() => ({ rows: [{ cnt: 0 }] })),
    db.execute({
      sql: `SELECT cp.entity_id, e.canonical_name, cp.pre_mean, cp.post_mean, cp.detected_at
            FROM change_points cp
            JOIN entities e ON e.id = cp.entity_id
            WHERE cp.detected_at > ?
            ORDER BY cp.detected_at DESC
            LIMIT 15`,
      args: [thirtyDaysAgo],
    }).catch(() => ({ rows: [] })),
    db.execute({
      sql: `SELECT
              ev.provider_type,
              ev.provider_name,
              COUNT(*) AS event_count,
              (SELECT COUNT(*) FROM concept_drift_alerts cda WHERE cda.provider_type = ev.provider_type AND cda.detected_at > ?) AS drift_count,
              (SELECT CASE WHEN ps.confirmed_at IS NOT NULL THEN 1 ELSE 0 END FROM provider_schemas ps WHERE ps.provider_type = ev.provider_type LIMIT 1) AS schema_confirmed
            FROM events ev
            WHERE ev.occurred_at > ?
            GROUP BY ev.provider_type, ev.provider_name
            ORDER BY event_count DESC`,
      args: [thirtyDaysAgo, thirtyDaysAgo],
    }).catch(() => ({ rows: [] })),
    db.execute(`
      SELECT e.id, e.canonical_name, oc.label AS type_label,
             (SELECT COUNT(*) FROM event_entities ee WHERE ee.entity_id = e.id) AS event_count
      FROM entities e
      JOIN ontology_concepts oc ON oc.id = e.type_concept_id
      WHERE e.id NOT IN (
        SELECT from_entity_id FROM entity_relations
        UNION
        SELECT to_entity_id FROM entity_relations
      )
      AND e.id IN (SELECT DISTINCT entity_id FROM event_entities)
      ORDER BY event_count DESC
      LIMIT 20
    `).catch(() => ({ rows: [] })),
    db.execute(`
      SELECT id, provider_type, field_name, detected_at, drift_score
      FROM concept_drift_alerts
      ORDER BY detected_at DESC
      LIMIT 10
    `).catch(() => ({ rows: [] })),
  ]);

  const totalEnt = Number(totalEntities.rows[0]?.cnt ?? 0);

  return c.json({
    graph_health: graphHealthRow.rows.length > 0 ? {
      largest_component_ratio: graphHealthRow.rows[0].largest_component_ratio as number,
      degree_entropy: graphHealthRow.rows[0].degree_entropy as number,
      isolated_node_ratio: graphHealthRow.rows[0].isolated_node_ratio as number,
      node_count: graphHealthRow.rows[0].node_count as number,
      edge_count: graphHealthRow.rows[0].edge_count as number,
    } : null,
    memory_episodes: Number(memoryCount.rows[0]?.cnt ?? 0),
    change_points_30d: Number(changePointsRow.rows[0]?.cnt ?? 0),
    drift_alerts_30d: Number(driftAlertsRow.rows[0]?.cnt ?? 0),
    coverage: {
      total_entities: totalEnt,
      with_narratives: Number(entitiesWithNarratives.rows[0]?.cnt ?? 0),
      in_communities: Number(entitiesInCommunities.rows[0]?.cnt ?? 0),
      with_relations: Math.min(Number(entitiesWithRelations.rows[0]?.cnt ?? 0), totalEnt),
    },
    change_points: changePointsList.rows.map((r) => ({
      entity_id: r.entity_id as string,
      entity_name: r.canonical_name as string,
      pre_mean: r.pre_mean as number,
      post_mean: r.post_mean as number,
      detected_at: r.detected_at as string,
    })),
    providers: providerHealth.rows.map((r) => ({
      provider_type: r.provider_type as string,
      provider_name: r.provider_name as string,
      event_count: Number(r.event_count),
      drifted: Number(r.drift_count) > 0,
      schema_confirmed: r.schema_confirmed === 1,
    })),
    isolated_entities: isolatedEntities.rows.map((r) => ({
      id: r.id as string,
      name: r.canonical_name as string,
      type: r.type_label as string,
      event_count: Number(r.event_count),
    })),
    drift_alerts: driftAlertsList.rows.map((r) => ({
      id: r.id as string,
      provider_type: r.provider_type as string,
      field_name: r.field_name as string,
      detected_at: r.detected_at as string,
      drift_score: r.drift_score as number,
    })),
  });
});
