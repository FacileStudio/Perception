import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { InValue } from '@libsql/client';
import type { EventRow, StatsSnapshot } from '../types';
import type { QueryPlan } from './planner';

export type RetrievalResult = {
  events: Array<EventRow & { score: number; source: 'vector' | 'fts' | 'sql' | 'stats' }>;
  stats: StatsSnapshot[];
};

async function vectorLane(queryEmbedding: number[]): Promise<Array<EventRow & { score: number; source: 'vector' }>> {
  try {
    const vecJson = JSON.stringify(queryEmbedding);
    const result = await db.execute({
      sql: `SELECT e.*, v.distance AS score FROM vector_top_k('event_embeddings_vector_idx', vector32(?), 40) v JOIN event_embeddings ee ON ee.rowid = v.id JOIN events e ON e.id = ee.event_id WHERE ee.status = 'ready'`,
      args: [vecJson],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? r.score : 0,
      source: 'vector' as const,
    }));
  } catch {
    return [];
  }
}

async function ftsLane(message: string): Promise<Array<EventRow & { score: number; source: 'fts' }>> {
  try {
    const result = await db.execute({
      sql: `SELECT e.*, rank AS score FROM event_fts JOIN events e ON e.rowid = event_fts.rowid WHERE event_fts MATCH ? LIMIT 20`,
      args: [message],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? r.score : 0,
      source: 'fts' as const,
    }));
  } catch {
    return [];
  }
}

async function sqlLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'sql' }>> {
  const conditions: string[] = ['1=1'];
  const args: InValue[] = [];

  if (plan.providerFilters.length > 0) {
    const placeholders = plan.providerFilters.map(() => '?').join(',');
    conditions.push(`provider_type IN (${placeholders})`);
    args.push(...plan.providerFilters);
  }

  if (plan.entityHints.length > 0) {
    const placeholders = plan.entityHints.map(() => '?').join(',');
    conditions.push(`entity_type IN (${placeholders})`);
    args.push(...plan.entityHints);
  }

  if (plan.timeWindow) {
    conditions.push(`occurred_at >= ? AND occurred_at <= ?`);
    args.push(plan.timeWindow.from, plan.timeWindow.to);
  }

  const where = conditions.join(' AND ');
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${where} ORDER BY occurred_at DESC LIMIT 30`,
    args,
  });

  return result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.5,
    source: 'sql' as const,
  }));
}

async function statsLane(): Promise<StatsSnapshot[]> {
  const result = await db.execute({
    sql: `SELECT * FROM stats_snapshots ORDER BY generated_at DESC LIMIT 5`,
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

function mergeAndRank(
  lanes: Array<Array<EventRow & { score: number; source: 'vector' | 'fts' | 'sql' | 'stats' }>>,
  plan: QueryPlan,
): Array<EventRow & { score: number; source: 'vector' | 'fts' | 'sql' | 'stats' }> {
  const best = new Map<string, EventRow & { score: number; source: 'vector' | 'fts' | 'sql' | 'stats' }>();

  for (const lane of lanes) {
    for (const event of lane) {
      const existing = best.get(event.id);
      if (!existing || event.score > existing.score) {
        best.set(event.id, event);
      }
    }
  }

  const ranked = Array.from(best.values()).map((event) => {
    let bonus = 0;
    if (plan.providerFilters.some((p) => event.provider_type === p)) bonus += 0.3;
    if (plan.entityHints.some((e) => event.entity_type === e)) bonus += 0.3;
    if (plan.timeWindow) {
      const eventTime = new Date(event.occurred_at).getTime();
      const windowEnd = new Date(plan.timeWindow.to).getTime();
      if (eventTime >= windowEnd - 86400000) bonus += 0.2;
    }
    return { ...event, score: event.score + bonus };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 25);
}

export async function retrieveContext(plan: QueryPlan, queryEmbedding: number[]): Promise<RetrievalResult> {
  const [vectorEvents, ftsEvents, sqlEvents, stats] = await Promise.all([
    vectorLane(queryEmbedding),
    ftsLane(plan.rawMessage),
    plan.requiresSqlFacts ? sqlLane(plan) : Promise.resolve([] as Array<EventRow & { score: number; source: 'sql' }>),
    plan.requiresStats ? statsLane() : Promise.resolve([] as StatsSnapshot[]),
  ]);

  const events = mergeAndRank([vectorEvents, ftsEvents, sqlEvents], plan);

  return { events, stats };
}
