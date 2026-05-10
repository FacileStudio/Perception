import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { InValue } from '@libsql/client';
import type { QueryPlan } from '../planner';
import type { ScoredEvent, TemporalPeriod } from './types';
import { EVENT_LIST_ORDER_BY } from '../../events/order';

export function buildSqlConditions(plan: QueryPlan, window: { from: string; to: string } | null): { where: string; args: InValue[] } {
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

  if (window) {
    conditions.push(`occurred_at >= ? AND occurred_at <= ?`);
    args.push(window.from, window.to);
  }

  return { where: conditions.join(' AND '), args };
}

export async function sqlLane(plan: QueryPlan): Promise<ScoredEvent<'sql'>[]> {
  const { where, args } = buildSqlConditions(plan, plan.timeWindow);
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args,
  });

  const currentEvents = result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.5,
    source: 'sql' as const,
    ...(plan.compareWindow ? { period: 'current' as TemporalPeriod } : {}),
  }));

  if (!plan.compareWindow) return currentEvents;

  const prev = buildSqlConditions(plan, plan.compareWindow);
  const prevResult = await db.execute({
    sql: `SELECT * FROM events WHERE ${prev.where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args: prev.args,
  });

  const previousEvents = prevResult.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.35,
    source: 'sql' as const,
    period: 'previous' as TemporalPeriod,
  }));

  return [...currentEvents, ...previousEvents];
}

export async function recentLane(plan: QueryPlan): Promise<ScoredEvent<'sql'>[]> {
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

  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args,
  });

  return result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.1,
    source: 'sql' as const,
  }));
}
