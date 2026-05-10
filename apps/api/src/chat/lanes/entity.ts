import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { QueryPlan } from '../planner';
import type { ScoredEvent } from './types';
import { EVENT_LIST_ORDER_BY } from '../../events/order';

export async function entityLane(plan: QueryPlan): Promise<Array<ScoredEvent<'entity'> & { entity_names: string[] }>> {
  if (plan.queryTerms.length === 0) return [];

  const aliasClauses = plan.queryTerms.map(() => 'ea.alias_value LIKE ?').join(' OR ');
  const nameClauses = plan.queryTerms.map(() => 'lower(ent.canonical_name) LIKE ?').join(' OR ');
  const args = [
    ...plan.queryTerms.map((term) => `%${term.replace(/_/g, ' ')}%`),
    ...plan.queryTerms.map((term) => `%${term.replace(/_/g, ' ')}%`),
  ];

  try {
    const result = await db.execute({
      sql: `SELECT e.*, ent.canonical_name AS matched_entity_name, max(coalesce(ea.confidence, 0), ee.confidence) AS match_score
        FROM entities ent
        JOIN event_entities ee ON ee.entity_id = ent.id
        JOIN events e ON e.id = ee.event_id
        LEFT JOIN entity_aliases ea ON ea.entity_id = ent.id
        WHERE (${aliasClauses}) OR (${nameClauses})
        GROUP BY e.id
        ORDER BY match_score DESC, ${EVENT_LIST_ORDER_BY}
        LIMIT 30`,
      args,
    });

    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.match_score === 'number' ? r.match_score : 0.75,
      source: 'entity' as const,
      entity_names: typeof r.matched_entity_name === 'string' ? [r.matched_entity_name] : [],
    }));
  } catch {
    return [];
  }
}

export async function extractSeedEntityIds(
  entityEvents: Array<ScoredEvent<'entity'> & { entity_names: string[] }>,
): Promise<string[]> {
  if (entityEvents.length === 0) return [];

  const names = new Set<string>();
  for (const e of entityEvents) {
    for (const name of e.entity_names) names.add(name);
  }
  if (names.size === 0) return [];

  const nameClauses = Array.from(names).map(() => 'canonical_name = ?').join(' OR ');
  const result = await db.execute({
    sql: `SELECT id FROM entities WHERE ${nameClauses} LIMIT 10`,
    args: Array.from(names),
  });
  return result.rows.map((r) => r.id as string);
}
