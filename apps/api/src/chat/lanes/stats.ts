import { db } from '../../db/client';
import type { StatsSnapshot } from '../../stats/types';
import type { QueryPlan } from '../planner';
import type { AnnotatedStatsSnapshot, TemporalPeriod } from './types';

export async function statsLane(plan: QueryPlan, workspaceId: string = ''): Promise<AnnotatedStatsSnapshot[]> {
  const mapRow = (r: Record<string, unknown>): StatsSnapshot => ({
    id: r.id as string,
    kind: r.kind as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    generated_at: r.generated_at as string,
    source_count: r.source_count as number,
    min_sample_met: Boolean(r.min_sample_met),
    data: JSON.parse(r.data_json as string) as Record<string, unknown>,
  });

  const wsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  const wsWhere = workspaceId ? ' WHERE workspace_id = ?' : '';

  if (plan.compareWindow && plan.timeWindow) {
    const [currentResult, previousResult] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM stats_snapshots WHERE window_end >= ? AND window_start <= ?${wsAnd} ORDER BY generated_at DESC LIMIT 5`,
        args: workspaceId ? [plan.timeWindow.from, plan.timeWindow.to, workspaceId] : [plan.timeWindow.from, plan.timeWindow.to],
      }),
      db.execute({
        sql: `SELECT * FROM stats_snapshots WHERE window_end >= ? AND window_start <= ?${wsAnd} ORDER BY generated_at DESC LIMIT 5`,
        args: workspaceId ? [plan.compareWindow.from, plan.compareWindow.to, workspaceId] : [plan.compareWindow.from, plan.compareWindow.to],
      }),
    ]);

    return [
      ...currentResult.rows.map((r) => ({ ...mapRow(r as unknown as Record<string, unknown>), period: 'current' as TemporalPeriod })),
      ...previousResult.rows.map((r) => ({ ...mapRow(r as unknown as Record<string, unknown>), period: 'previous' as TemporalPeriod })),
    ];
  }

  const result = await db.execute({
    sql: `SELECT * FROM stats_snapshots${wsWhere} ORDER BY generated_at DESC LIMIT 5`,
    args: workspaceId ? [workspaceId] : [],
  });
  return result.rows.map((r) => mapRow(r as unknown as Record<string, unknown>));
}
