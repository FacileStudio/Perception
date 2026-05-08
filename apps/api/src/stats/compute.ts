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
      sql: `SELECT entity_type, COUNT(*) as cnt FROM events WHERE occurred_at >= ? AND quality = 'complete' GROUP BY entity_type`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT entity_type, COUNT(*) as cnt FROM events WHERE occurred_at >= ? AND occurred_at < ? AND quality = 'complete' GROUP BY entity_type`,
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
          AND e.quality = 'complete'
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
    sql: `SELECT actor_name, COUNT(*) as cnt FROM events WHERE occurred_at >= ? AND actor_name IS NOT NULL AND quality = 'complete' GROUP BY actor_name ORDER BY cnt DESC LIMIT 20`,
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

export async function computeAllStats(windowDays: number): Promise<StatsSnapshot[]> {
  const [entityVelocity, statusHealth, actorActivity] = await Promise.all([
    computeEntityVelocity(windowDays).catch(() => null),
    computeStatusHealth(windowDays).catch(() => null),
    computeActorActivity(windowDays).catch(() => null),
  ]);

  return [entityVelocity, statusHealth, actorActivity].filter((s): s is StatsSnapshot => s !== null);
}
