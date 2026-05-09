import { db } from '../db/client';
import type { StatsSnapshot } from '../types';
import { computeAllStats } from './compute';

const EXPECTED_KINDS = [
  'entity_velocity_7d', 'entity_velocity_30d',
  'status_health_7d', 'status_health_30d',
  'actor_activity_7d', 'actor_activity_30d',
  'entity_coverage_7d', 'entity_coverage_30d',
  'top_entities_7d', 'top_entities_30d',
];

export async function refreshSnapshots(): Promise<void> {
  const [snapshots7, snapshots30] = await Promise.all([
    computeAllStats(7),
    computeAllStats(30),
  ]);

  const all = [...snapshots7, ...snapshots30];

  for (const snapshot of all) {
    await db.execute({
      sql: `INSERT INTO stats_snapshots (id, kind, window_start, window_end, generated_at, source_count, min_sample_met, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshot.id,
        snapshot.kind,
        snapshot.window_start,
        snapshot.window_end,
        snapshot.generated_at,
        snapshot.source_count,
        snapshot.min_sample_met ? 1 : 0,
        JSON.stringify(snapshot.data),
      ],
    });
  }

  const staleThreshold = new Date(Date.now() - 48 * 3600000).toISOString();
  const kinds = [...new Set(all.map((s) => s.kind))];
  for (const kind of kinds) {
    await db.execute({
      sql: `DELETE FROM stats_snapshots WHERE kind = ? AND generated_at < ?`,
      args: [kind, staleThreshold],
    });
  }
}

export async function hasAllExpectedKinds(): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT DISTINCT kind FROM stats_snapshots`,
    args: [],
  });
  const existing = new Set(result.rows.map((r) => r.kind as string));
  return EXPECTED_KINDS.every((k) => existing.has(k));
}

export async function getLatestSnapshots(): Promise<StatsSnapshot[]> {
  const result = await db.execute({
    sql: `SELECT * FROM stats_snapshots ORDER BY generated_at DESC LIMIT 50`,
    args: [],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    generated_at: r.generated_at as string,
    source_count: r.source_count as number,
    min_sample_met: Boolean(r.min_sample_met),
    data: JSON.parse(r.data_json as string) as Record<string, unknown>,
  }));
}

export async function getLatestSnapshotGeneratedAt(): Promise<string | null> {
  const result = await db.execute({
    sql: `SELECT generated_at FROM stats_snapshots ORDER BY generated_at DESC LIMIT 1`,
    args: [],
  });

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].generated_at as string;
}
