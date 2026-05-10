import { db } from '../db/client';
import { daysAgoIso } from '../lib/time';

export type AnomalyAlert = {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  entity_id?: string;
  entity_name?: string;
  metadata: Record<string, unknown>;
};

export async function detectEntityVelocitySpikes(): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const windowStart = daysAgoIso(7);
  const prevStart = daysAgoIso(28);

  const result = await db.execute({
    sql: `
      SELECT en.id, en.canonical_name,
             COUNT(CASE WHEN ev.occurred_at >= ? THEN 1 END) AS current_count,
             COUNT(CASE WHEN ev.occurred_at >= ? AND ev.occurred_at < ? THEN 1 END) AS prev_count
      FROM event_entities ee
      JOIN events ev ON ev.id = ee.event_id
      JOIN entities en ON en.id = ee.entity_id
      WHERE ev.occurred_at >= ?
      GROUP BY en.id, en.canonical_name
      HAVING current_count > 0
    `,
    args: [windowStart, prevStart, windowStart, prevStart],
  });

  const counts = result.rows.map(r => ({
    id: r.id as string,
    name: r.canonical_name as string,
    current: Number(r.current_count),
    prev: Number(r.prev_count),
  }));

  if (counts.length < 3) return alerts;

  const prevValues = counts.map(c => c.prev / 3).filter(v => v > 0);
  if (prevValues.length === 0) return alerts;

  const mean = prevValues.reduce((a, b) => a + b, 0) / prevValues.length;
  const variance = prevValues.reduce((a, v) => a + (v - mean) ** 2, 0) / prevValues.length;
  const stdDev = Math.sqrt(variance);
  const threshold = mean + 2 * stdDev;

  for (const entity of counts) {
    const weeklyAvg = entity.prev / 3;
    if (entity.current > threshold && entity.current > weeklyAvg * 2 && entity.current >= 5) {
      alerts.push({
        type: 'entity_velocity_spike',
        severity: entity.current > mean + 3 * stdDev ? 'critical' : 'warning',
        title: `${entity.name} activity spike`,
        message: `${entity.name} had ${entity.current} events this week vs ~${Math.round(weeklyAvg)} weekly average`,
        entity_id: entity.id,
        entity_name: entity.name,
        metadata: { current: entity.current, weekly_avg: Math.round(weeklyAvg), threshold: Math.round(threshold) },
      });
    }
  }

  return alerts;
}

export async function detectServiceHealthDegradation(): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const windowStart = daysAgoIso(7);
  const prevStart = daysAgoIso(14);

  const [currResult, prevResult] = await Promise.all([
    db.execute({
      sql: `SELECT provider_type, status, COUNT(*) AS cnt
            FROM events
            WHERE occurred_at >= ? AND status IS NOT NULL
            GROUP BY provider_type, status`,
      args: [windowStart],
    }),
    db.execute({
      sql: `SELECT provider_type, status, COUNT(*) AS cnt
            FROM events
            WHERE occurred_at >= ? AND occurred_at < ? AND status IS NOT NULL
            GROUP BY provider_type, status`,
      args: [prevStart, windowStart],
    }),
  ]);

  type StatusMap = Record<string, Record<string, number>>;
  function buildMap(rows: typeof currResult.rows): StatusMap {
    const m: StatusMap = {};
    for (const r of rows) {
      const p = r.provider_type as string;
      const s = r.status as string;
      if (!m[p]) m[p] = {};
      m[p][s] = Number(r.cnt);
    }
    return m;
  }

  const curr = buildMap(currResult.rows);
  const prev = buildMap(prevResult.rows);

  const ERROR_STATUSES = new Set(['error', 'failed', 'down', 'critical', 'offline', 'degraded']);

  for (const provider of Object.keys(curr)) {
    const currTotal = Object.values(curr[provider]).reduce((a, b) => a + b, 0);
    const currErrors = Object.entries(curr[provider])
      .filter(([s]) => ERROR_STATUSES.has(s.toLowerCase()))
      .reduce((a, [, c]) => a + c, 0);

    const prevTotal = Object.values(prev[provider] ?? {}).reduce((a, b) => a + b, 0);
    const prevErrors = Object.entries(prev[provider] ?? {})
      .filter(([s]) => ERROR_STATUSES.has(s.toLowerCase()))
      .reduce((a, [, c]) => a + c, 0);

    if (currTotal < 5) continue;

    const currErrorRate = currErrors / currTotal;
    const prevErrorRate = prevTotal > 0 ? prevErrors / prevTotal : 0;
    const shift = currErrorRate - prevErrorRate;

    if (shift > 0.3) {
      alerts.push({
        type: 'service_health_degradation',
        severity: currErrorRate > 0.5 ? 'critical' : 'warning',
        title: `${provider} health degradation`,
        message: `${provider} error rate shifted from ${Math.round(prevErrorRate * 100)}% to ${Math.round(currErrorRate * 100)}%`,
        metadata: { provider, current_error_rate: currErrorRate, previous_error_rate: prevErrorRate, shift },
      });
    }
  }

  return alerts;
}

export async function detectClientSilence(): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const twoWeeksAgo = daysAgoIso(14);
  const sixtyDaysAgo = daysAgoIso(60);

  const result = await db.execute({
    sql: `
      SELECT en.id, en.canonical_name, oc.label AS entity_type,
             MAX(ev.occurred_at) AS last_activity,
             COUNT(ev.id) AS total_events
      FROM entities en
      JOIN ontology_concepts oc ON oc.id = en.type_concept_id
      JOIN event_entities ee ON ee.entity_id = en.id
      JOIN events ev ON ev.id = ee.event_id
      WHERE ev.occurred_at >= ?
      GROUP BY en.id, en.canonical_name, oc.label
      HAVING MAX(ev.occurred_at) < ? AND total_events >= 3
    `,
    args: [sixtyDaysAgo, twoWeeksAgo],
  });

  for (const row of result.rows) {
    const name = row.canonical_name as string;
    const lastActivity = row.last_activity as string;
    const daysSince = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);

    alerts.push({
      type: 'client_silence',
      severity: daysSince > 30 ? 'critical' : 'warning',
      title: `${name} went quiet`,
      message: `No activity from ${name} in ${daysSince} days (last seen ${new Date(lastActivity).toLocaleDateString()})`,
      entity_id: row.id as string,
      entity_name: name,
      metadata: { days_since: daysSince, last_activity: lastActivity, entity_type: row.entity_type as string },
    });
  }

  return alerts;
}

export async function detectActorAbsence(): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const oneWeekAgo = daysAgoIso(7);
  const thirtyDaysAgo = daysAgoIso(30);

  const result = await db.execute({
    sql: `
      SELECT actor_name,
             MAX(occurred_at) AS last_seen,
             COUNT(*) AS total_events
      FROM events
      WHERE actor_name IS NOT NULL AND actor_name != ''
        AND occurred_at >= ?
      GROUP BY actor_name
      HAVING MAX(occurred_at) < ? AND total_events >= 5
    `,
    args: [thirtyDaysAgo, oneWeekAgo],
  });

  for (const row of result.rows) {
    const actor = row.actor_name as string;
    const lastSeen = row.last_seen as string;
    const daysSince = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000);

    alerts.push({
      type: 'actor_absence',
      severity: daysSince > 14 ? 'warning' : 'info',
      title: `${actor} inactive`,
      message: `${actor} hasn't been seen in ${daysSince} days (normally active, last seen ${new Date(lastSeen).toLocaleDateString()})`,
      metadata: { actor, days_since: daysSince, last_seen: lastSeen },
    });
  }

  return alerts;
}

export async function runAllEvaluators(): Promise<AnomalyAlert[]> {
  const results = await Promise.all([
    detectEntityVelocitySpikes().catch(() => []),
    detectServiceHealthDegradation().catch(() => []),
    detectClientSilence().catch(() => []),
    detectActorAbsence().catch(() => []),
  ]);
  return results.flat();
}
