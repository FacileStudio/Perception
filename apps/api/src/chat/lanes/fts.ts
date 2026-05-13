import { db } from '../../db/client';
import { rowToEvent } from '../../db/row';
import type { ScoredEvent } from './types';

export async function ftsLane(queryTerms: string[], workspaceId: string = ''): Promise<ScoredEvent<'fts'>[]> {
  if (queryTerms.length === 0) return [];
  try {
    const ftsQuery = queryTerms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const wsAnd = workspaceId ? ' AND e.workspace_id = ?' : '';
    const result = await db.execute({
      sql: `SELECT e.*, rank AS score FROM event_fts JOIN events e ON e.rowid = event_fts.rowid WHERE event_fts MATCH ?${wsAnd} LIMIT 20`,
      args: workspaceId ? [ftsQuery, workspaceId] : [ftsQuery],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? Math.min(2, Math.abs(r.score)) : 0,
      source: 'fts' as const,
    }));
  } catch {
    return [];
  }
}
