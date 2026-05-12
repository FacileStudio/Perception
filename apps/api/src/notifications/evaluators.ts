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

export async function detectEntityVelocitySpikes(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const windowStart = daysAgoIso(7);
  const prevStart = daysAgoIso(28);
  const cpCutoff = daysAgoIso(30);

  const wsFilter = workspaceId ? ' AND ev.workspace_id = ?' : '';
  const wsFilterCp = workspaceId ? ' AND workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const [eventResult, cpResult] = await Promise.all([
    db.execute({
      sql: `
        SELECT en.id, en.canonical_name,
               COUNT(CASE WHEN ev.occurred_at >= ? THEN 1 END) AS current_count,
               COUNT(CASE WHEN ev.occurred_at >= ? AND ev.occurred_at < ? THEN 1 END) AS prev_count
        FROM event_entities ee
        JOIN events ev ON ev.id = ee.event_id
        JOIN entities en ON en.id = ee.entity_id
        WHERE ev.occurred_at >= ?${wsFilter}
        GROUP BY en.id, en.canonical_name
        HAVING current_count > 0
      `,
      args: [windowStart, prevStart, windowStart, prevStart, ...wsArgs],
    }),
    db.execute({
      sql: `
        SELECT cp.entity_id, cp.post_mean
        FROM change_points cp
        INNER JOIN (
          SELECT entity_id, MAX(detected_at) AS latest
          FROM change_points
          WHERE detected_at >= ?${wsFilterCp}
          GROUP BY entity_id
        ) latest_cp ON cp.entity_id = latest_cp.entity_id AND cp.detected_at = latest_cp.latest
      `,
      args: [cpCutoff, ...wsArgs],
    }),
  ]);

  const cpMap = new Map<string, number>();
  for (const row of cpResult.rows) {
    cpMap.set(row.entity_id as string, Number(row.post_mean));
  }

  for (const row of eventResult.rows) {
    const id = row.id as string;
    const name = row.canonical_name as string;
    const current = Number(row.current_count);
    const prev = Number(row.prev_count);
    const postMean = cpMap.get(id);

    if (postMean !== undefined && postMean > 0) {
      const expectedWeekly = 168 / postMean;
      if (current < 5 || expectedWeekly < 3) {
        const weeklyAvg = prev / 3;
        if (weeklyAvg <= 0 || current < 5 || current <= weeklyAvg * 2.5) continue;
        const ratio = current / weeklyAvg;
        alerts.push({
          type: 'entity_velocity_spike',
          severity: ratio > 4 ? 'critical' : 'warning',
          title: `${name} activity spike`,
          message: `${name} had ${current} events this week vs ~${Math.round(weeklyAvg)} weekly average`,
          entity_id: id,
          entity_name: name,
          metadata: { current, weekly_avg: Math.round(weeklyAvg), ratio: Math.round(ratio * 10) / 10, source: 'fallback' },
        });
        continue;
      }
      const ratio = current / expectedWeekly;
      if (ratio <= 2) continue;

      alerts.push({
        type: 'entity_velocity_spike',
        severity: ratio > 4 ? 'critical' : 'warning',
        title: `${name} activity spike`,
        message: `${name} had ${current} events this week vs ~${Math.round(expectedWeekly)} expected from recent regime`,
        entity_id: id,
        entity_name: name,
        metadata: { current, expected_weekly: Math.round(expectedWeekly), ratio: Math.round(ratio * 10) / 10, source: 'bocpd' },
      });
    } else {
      const weeklyAvg = prev / 3;
      if (weeklyAvg <= 0 || current < 5 || current <= weeklyAvg * 2.5) continue;

      const ratio = current / weeklyAvg;
      alerts.push({
        type: 'entity_velocity_spike',
        severity: ratio > 4 ? 'critical' : 'warning',
        title: `${name} activity spike`,
        message: `${name} had ${current} events this week vs ~${Math.round(weeklyAvg)} weekly average`,
        entity_id: id,
        entity_name: name,
        metadata: { current, weekly_avg: Math.round(weeklyAvg), ratio: Math.round(ratio * 10) / 10, source: 'fallback' },
      });
    }
  }

  return alerts;
}

export async function detectServiceHealthDegradation(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const windowStart = daysAgoIso(7);
  const prevStart = daysAgoIso(14);

  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const [currResult, prevResult] = await Promise.all([
    db.execute({
      sql: `SELECT provider_type, status, COUNT(*) AS cnt
            FROM events
            WHERE occurred_at >= ? AND status IS NOT NULL${wsFilter}
            GROUP BY provider_type, status`,
      args: [windowStart, ...wsArgs],
    }),
    db.execute({
      sql: `SELECT provider_type, status, COUNT(*) AS cnt
            FROM events
            WHERE occurred_at >= ? AND occurred_at < ? AND status IS NOT NULL${wsFilter}
            GROUP BY provider_type, status`,
      args: [prevStart, windowStart, ...wsArgs],
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

export async function detectClientSilence(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const twoWeeksAgo = daysAgoIso(14);
  const sixtyDaysAgo = daysAgoIso(60);

  const wsFilter = workspaceId ? ' AND ev.workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const result = await db.execute({
    sql: `
      SELECT en.id, en.canonical_name, oc.label AS entity_type,
             MAX(ev.occurred_at) AS last_activity,
             COUNT(ev.id) AS total_events
      FROM entities en
      JOIN ontology_concepts oc ON oc.id = en.type_concept_id
      JOIN event_entities ee ON ee.entity_id = en.id
      JOIN events ev ON ev.id = ee.event_id
      WHERE ev.occurred_at >= ?${wsFilter}
      GROUP BY en.id, en.canonical_name, oc.label
      HAVING MAX(ev.occurred_at) < ? AND total_events >= 3
    `,
    args: [sixtyDaysAgo, ...wsArgs, twoWeeksAgo],
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

export async function detectActorAbsence(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const oneWeekAgo = daysAgoIso(7);
  const thirtyDaysAgo = daysAgoIso(30);

  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const result = await db.execute({
    sql: `
      SELECT actor_name,
             MAX(occurred_at) AS last_seen,
             COUNT(*) AS total_events
      FROM events
      WHERE actor_name IS NOT NULL AND actor_name != ''
        AND occurred_at >= ?${wsFilter}
      GROUP BY actor_name
      HAVING MAX(occurred_at) < ? AND total_events >= 5
    `,
    args: [thirtyDaysAgo, ...wsArgs, oneWeekAgo],
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

export async function detectChangePoints(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const oneDayAgo = daysAgoIso(1);

  const wsFilter = workspaceId ? ' AND cp.workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const result = await db.execute({
    sql: `SELECT cp.entity_id, cp.pre_mean, cp.post_mean, cp.run_length_probability,
                 e.canonical_name
          FROM change_points cp
          JOIN entities e ON e.id = cp.entity_id
          WHERE cp.detected_at > ?${wsFilter}
          ORDER BY cp.detected_at DESC`,
    args: [oneDayAgo, ...wsArgs],
  });

  for (const row of result.rows) {
    const name = row.canonical_name as string;
    const preMean = Number(row.pre_mean);
    const postMean = Number(row.post_mean);
    const direction = postMean < preMean ? 'accelerated' : 'slowed down';
    const severity = Math.abs(postMean - preMean) / Math.max(preMean, 1) > 1 ? 'critical' as const : 'warning' as const;

    alerts.push({
      type: 'change_point',
      severity,
      title: `${name} activity ${direction}`,
      message: `Regime change detected for ${name}: inter-arrival time shifted from ~${preMean.toFixed(1)}h to ~${postMean.toFixed(1)}h`,
      entity_id: row.entity_id as string,
      entity_name: name,
      metadata: { pre_mean: preMean, post_mean: postMean, probability: row.run_length_probability },
    });
  }

  return alerts;
}

export async function runAllEvaluators(workspaceId: string = ''): Promise<AnomalyAlert[]> {
  const results = await Promise.all([
    detectEntityVelocitySpikes(workspaceId).catch(() => []),
    detectServiceHealthDegradation(workspaceId).catch(() => []),
    detectClientSilence(workspaceId).catch(() => []),
    detectActorAbsence(workspaceId).catch(() => []),
    detectChangePoints(workspaceId).catch(() => []),
  ]);
  return results.flat();
}
