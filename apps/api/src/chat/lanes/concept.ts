import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { InValue } from '@libsql/client';
import type { QueryPlan } from '../planner';
import type { ScoredEvent } from './types';
import { EVENT_LIST_ORDER_BY } from '../../events/order';

export async function conceptLane(plan: QueryPlan, workspaceId: string = ''): Promise<Array<ScoredEvent<'concept'> & { concepts: string[] }>> {
  const conditions: string[] = [];
  const args: InValue[] = [];

  if (plan.capabilities.length > 0) {
    for (const capability of plan.capabilities) {
      conditions.push('oc.capabilities_json LIKE ?');
      args.push(`%"${capability}"%`);
    }
  }

  if (plan.queryTerms.length > 0) {
    for (const term of plan.queryTerms) {
      conditions.push('(oc.label LIKE ? OR oca.alias LIKE ?)');
      args.push(`%${term}%`, `%${term}%`);
    }
  }

  if (conditions.length === 0) return [];

  const wsFilter = workspaceId ? ' AND e.workspace_id = ?' : '';
  if (workspaceId) args.push(workspaceId);

  try {
    const result = await db.execute({
      sql: `SELECT e.*, group_concat(DISTINCT oc.label) AS matched_concepts, max(ec.confidence + oc.confidence) AS match_score
        FROM event_concepts ec
        JOIN ontology_concepts oc ON oc.id = ec.concept_id
        LEFT JOIN ontology_concept_aliases oca ON oca.concept_id = oc.id
        JOIN events e ON e.id = ec.event_id
        WHERE (${conditions.join(' OR ')}) AND oc.state != 'rejected'${wsFilter}
        GROUP BY e.id
        ORDER BY match_score DESC, ${EVENT_LIST_ORDER_BY}
        LIMIT 30`,
      args,
    });

    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.match_score === 'number' ? r.match_score / 2 : 0.7,
      source: 'concept' as const,
      concepts: typeof r.matched_concepts === 'string' ? r.matched_concepts.split(',') : [],
    }));
  } catch {
    return [];
  }
}
