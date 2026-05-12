import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { ScoredEvent } from './types';
import { EVENT_LIST_ORDER_BY } from '../../events/order';

export async function graphLane(
  seedEntityIds: string[],
  workspaceId: string = '',
): Promise<Array<ScoredEvent<'graph'> & { entity_names: string[] }>> {
  if (seedEntityIds.length === 0) return [];

  try {
    const placeholders = seedEntityIds.map(() => '?').join(',');
    const wsFilter = workspaceId ? ' AND e.workspace_id = ?' : '';
    const result = await db.execute({
      sql: `SELECT e.*, ent.canonical_name AS matched_entity_name,
              max(er.confidence) AS relation_confidence
            FROM entity_relations er
            JOIN event_entities ee ON ee.entity_id = er.to_entity_id
            JOIN events e ON e.id = ee.event_id
            JOIN entities ent ON ent.id = er.to_entity_id
            WHERE er.from_entity_id IN (${placeholders})
              AND er.to_entity_id NOT IN (${placeholders})${wsFilter}
            GROUP BY e.id
            ORDER BY relation_confidence DESC, ${EVENT_LIST_ORDER_BY}
            LIMIT 20`,
      args: workspaceId ? [...seedEntityIds, ...seedEntityIds, workspaceId] : [...seedEntityIds, ...seedEntityIds],
    });

    return result.rows.map((r) => {
      const relConf = typeof r.relation_confidence === 'number' ? r.relation_confidence : 0.5;
      return {
        ...rowToEvent(r as unknown as Record<string, unknown>),
        score: relConf,
        source: 'graph' as const,
        entity_names: typeof r.matched_entity_name === 'string' ? [r.matched_entity_name] : [],
      };
    });
  } catch {
    return [];
  }
}
