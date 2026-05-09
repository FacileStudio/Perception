import { randomUUID } from 'crypto';
import * as ss from 'simple-statistics';
import { db } from '../db/client';
import type { StatsSnapshot } from '../types';

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function computeEntityVelocity(windowDays: number): Promise<StatsSnapshot> {
  const windowStart = daysAgoIso(windowDays);
  const windowEnd = nowIso();
  const prevStart = daysAgoIso(windowDays * 2);

  const [currResult, prevResult] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(labeled.label, e.entity_type) AS entity_type, COUNT(*) as cnt
            FROM events e
            LEFT JOIN (
              SELECT ec.event_id, oc.label
              FROM event_concepts ec
              JOIN ontology_concepts oc ON oc.id = ec.concept_id AND oc.kind = 'entity_type'
            ) labeled ON labeled.event_id = e.id
            WHERE e.occurred_at >= ?
            GROUP BY COALESCE(labeled.label, e.entity_type)`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT COALESCE(labeled.label, e.entity_type) AS entity_type, COUNT(*) as cnt
            FROM events e
            LEFT JOIN (
              SELECT ec.event_id, oc.label
              FROM event_concepts ec
              JOIN ontology_concepts oc ON oc.id = ec.concept_id AND oc.kind = 'entity_type'
            ) labeled ON labeled.event_id = e.id
            WHERE e.occurred_at >= ? AND e.occurred_at < ?
            GROUP BY COALESCE(labeled.label, e.entity_type)`,
      args: [prevStart, windowStart],
    }),
  ]);

  const curr: Record<string, number> = {};
  for (const r of currResult.rows) curr[r.entity_type as string] = r.cnt as number;

  const prev: Record<string, number> = {};
  for (const r of prevResult.rows) prev[r.entity_type as string] = r.cnt as number;

  const velocity: Record<string, { current: number; previous: number; delta: number }> = {};
  const allTypes = new Set([...Object.keys(curr), ...Object.keys(prev)]);
  for (const t of allTypes) {
    const c = curr[t] ?? 0;
    const p = prev[t] ?? 0;
    velocity[t] = { current: c, previous: p, delta: c - p };
  }

  const counts = Object.values(curr);
  const meanVal = counts.length > 0 ? ss.mean(counts) : 0;
  const stdVal = counts.length > 1 ? ss.standardDeviation(counts) : 0;

  return {
    id: randomUUID(),
    kind: `entity_velocity_${windowDays}d`,
    window_start: windowStart,
    window_end: windowEnd,
    generated_at: nowIso(),
    source_count: currResult.rows.length,
    min_sample_met: currResult.rows.length >= 5,
    data: { velocity, mean: meanVal, std_dev: stdVal },
  };
}

async function computeStatusHealth(windowDays: number): Promise<StatsSnapshot> {
  const windowStart = daysAgoIso(windowDays);
  const windowEnd = nowIso();

  let rows: Array<{ status_value: string; cnt: number }> = [];
  try {
    const result = await db.execute({
      sql: `
        SELECT json_extract(df.facts_json, '$.' || json_extract(fm.value, '$.target_key')) AS status_value, COUNT(*) AS cnt
        FROM dynamic_facts df
        JOIN events e ON e.id = df.event_id
        JOIN provider_schemas ps ON ps.provider_type = df.provider_type,
          json_each(ps.field_mappings_json) AS fm
        WHERE json_extract(fm.value, '$.role') = 'status'
          AND e.occurred_at >= ?
        GROUP BY status_value
      `,
      args: [windowStart],
    });
    rows = result.rows.map((r) => ({
      status_value: (r.status_value ?? 'unknown') as string,
      cnt: r.cnt as number,
    }));
  } catch {
    rows = [];
  }

  const distribution: Record<string, number> = {};
  for (const r of rows) distribution[r.status_value] = r.cnt;

  return {
    id: randomUUID(),
    kind: `status_health_${windowDays}d`,
    window_start: windowStart,
    window_end: windowEnd,
    generated_at: nowIso(),
    source_count: rows.length,
    min_sample_met: rows.length >= 5,
    data: { distribution },
  };
}

async function computeActorActivity(windowDays: number): Promise<StatsSnapshot> {
  const windowStart = daysAgoIso(windowDays);
  const windowEnd = nowIso();

  const result = await db.execute({
    sql: `SELECT actor_name, COUNT(*) as cnt FROM events WHERE occurred_at >= ? AND actor_name IS NOT NULL GROUP BY actor_name ORDER BY cnt DESC LIMIT 20`,
    args: [windowStart],
  });

  const actors: Record<string, number> = {};
  for (const r of result.rows) actors[r.actor_name as string] = r.cnt as number;

  const counts = Object.values(actors);
  const meanVal = counts.length > 0 ? ss.mean(counts) : 0;

  return {
    id: randomUUID(),
    kind: `actor_activity_${windowDays}d`,
    window_start: windowStart,
    window_end: windowEnd,
    generated_at: nowIso(),
    source_count: result.rows.length,
    min_sample_met: result.rows.length >= 5,
    data: { actors, mean: meanVal },
  };
}

async function computeEntityCoverage(windowDays: number): Promise<StatsSnapshot> {
  const windowStart = daysAgoIso(windowDays);
  const windowEnd = nowIso();

  const [totalResult, withEntityResult, labeledResult, uniqueEntitiesResult] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM events WHERE occurred_at >= ?`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT event_id) as cnt FROM event_entities WHERE event_id IN (SELECT id FROM events WHERE occurred_at >= ?)`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT event_id) as cnt FROM event_concepts WHERE event_id IN (SELECT id FROM events WHERE occurred_at >= ?)`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT entity_id) as cnt FROM event_entities WHERE event_id IN (SELECT id FROM events WHERE occurred_at >= ?)`,
      args: [windowStart],
    }),
  ]);

  const total = Number(totalResult.rows[0]?.cnt ?? 0);
  const withEntity = Number(withEntityResult.rows[0]?.cnt ?? 0);
  const labeled = Number(labeledResult.rows[0]?.cnt ?? 0);
  const uniqueEntities = Number(uniqueEntitiesResult.rows[0]?.cnt ?? 0);

  return {
    id: randomUUID(),
    kind: `entity_coverage_${windowDays}d`,
    window_start: windowStart,
    window_end: windowEnd,
    generated_at: nowIso(),
    source_count: total,
    min_sample_met: total >= 5,
    data: {
      total,
      with_entity: withEntity,
      labeled,
      unique_entities: uniqueEntities,
      entity_coverage_pct: total > 0 ? Math.round((withEntity / total) * 100) : 0,
      label_coverage_pct: total > 0 ? Math.round((labeled / total) * 100) : 0,
    },
  };
}

async function computeTopEntities(windowDays: number): Promise<StatsSnapshot> {
  const windowStart = daysAgoIso(windowDays);
  const windowEnd = nowIso();

  const result = await db.execute({
    sql: `SELECT en.canonical_name, oc.label AS entity_type, COUNT(DISTINCT ee.event_id) AS cnt
          FROM event_entities ee
          JOIN events ev ON ev.id = ee.event_id
          JOIN entities en ON en.id = ee.entity_id
          JOIN ontology_concepts oc ON oc.id = en.type_concept_id
          WHERE ev.occurred_at >= ?
          GROUP BY en.id, en.canonical_name, oc.label
          ORDER BY cnt DESC
          LIMIT 10`,
    args: [windowStart],
  });

  const entities = result.rows.map((r) => ({
    name: r.canonical_name as string,
    type: r.entity_type as string,
    count: Number(r.cnt),
  }));

  return {
    id: randomUUID(),
    kind: `top_entities_${windowDays}d`,
    window_start: windowStart,
    window_end: windowEnd,
    generated_at: nowIso(),
    source_count: result.rows.length,
    min_sample_met: result.rows.length >= 3,
    data: { entities },
  };
}

export async function computeAllStats(windowDays: number): Promise<StatsSnapshot[]> {
  const [entityVelocity, statusHealth, actorActivity, entityCoverage, topEntities] = await Promise.all([
    computeEntityVelocity(windowDays).catch(() => null),
    computeStatusHealth(windowDays).catch(() => null),
    computeActorActivity(windowDays).catch(() => null),
    computeEntityCoverage(windowDays).catch(() => null),
    computeTopEntities(windowDays).catch(() => null),
  ]);

  return [entityVelocity, statusHealth, actorActivity, entityCoverage, topEntities].filter((s): s is StatsSnapshot => s !== null);
}
