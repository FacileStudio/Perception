import { db } from '../db/client';

export type EntityNarrative = {
  entityId: string;
  entityName: string;
  narrativeText: string;
  sourceEventCount: number;
  generatedAt: string;
  stalenessScore: number;
};

export async function fetchNarratives(seedEntityIds: string[]): Promise<EntityNarrative[]> {
  if (seedEntityIds.length === 0) return [];

  try {
    const placeholders = seedEntityIds.map(() => '?').join(',');
    const result = await db.execute({
      sql: `SELECT en.entity_id, e.canonical_name AS entity_name,
              en.narrative_text, en.source_event_count, en.generated_at, en.staleness_score
            FROM entity_narratives en
            JOIN entities e ON e.id = en.entity_id
            WHERE en.entity_id IN (${placeholders})
            ORDER BY en.source_event_count DESC
            LIMIT 3`,
      args: seedEntityIds,
    });

    return result.rows.map((r) => ({
      entityId: r.entity_id as string,
      entityName: r.entity_name as string,
      narrativeText: r.narrative_text as string,
      sourceEventCount: r.source_event_count as number,
      generatedAt: r.generated_at as string,
      stalenessScore: r.staleness_score as number,
    }));
  } catch {
    return [];
  }
}
