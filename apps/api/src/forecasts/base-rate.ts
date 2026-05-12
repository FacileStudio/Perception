import { db } from '../db/client';
import type { CandidateQuestion } from './types';

async function binaryBaseRate(candidate: CandidateQuestion, workspaceId: string = ''): Promise<number | null> {
  if (!candidate.entity_id) return null;

  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [candidate.entity_id];
  if (workspaceId) args.push(workspaceId);

  const result = await db.execute({
    sql: `SELECT day, cnt FROM event_counts_daily
          WHERE series_key LIKE ? || '%'${wsFilter}
          ORDER BY day ASC`,
    args,
  });

  if (result.rows.length < 14) return null;

  const dailyCounts = result.rows.map((r) => ({
    day: r.day as string,
    cnt: Number(r.cnt),
  }));

  let windows = 0;
  let hits = 0;
  for (let i = 0; i <= dailyCounts.length - 14; i += 14) {
    windows++;
    const windowSum = dailyCounts.slice(i, i + 14).reduce((s, d) => s + d.cnt, 0);
    if (windowSum > 0) hits++;
  }

  if (windows < 5) return null;
  return hits / windows;
}

async function numericBaseRate(candidate: CandidateQuestion, workspaceId: string = ''): Promise<number | null> {
  const seriesKey = candidate.entity_id;
  if (!seriesKey) return null;

  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [seriesKey];
  if (workspaceId) args.push(workspaceId);

  const result = await db.execute({
    sql: `SELECT day, cnt FROM event_counts_daily
          WHERE series_key = ?${wsFilter}
          ORDER BY day ASC`,
    args,
  });

  if (result.rows.length < 28) return null;

  const dailyCounts = result.rows.map((r) => Number(r.cnt));
  const weeklySums: number[] = [];
  for (let i = 0; i <= dailyCounts.length - 7; i += 7) {
    weeklySums.push(dailyCounts.slice(i, i + 7).reduce((s, c) => s + c, 0));
  }

  if (weeklySums.length < 4) return null;
  return weeklySums.reduce((s, v) => s + v, 0) / weeklySums.length;
}

export async function computeBaseRate(candidate: CandidateQuestion, workspaceId: string = ''): Promise<number | null> {
  switch (candidate.question_type) {
    case 'binary':
      return binaryBaseRate(candidate, workspaceId);
    case 'numeric':
      return numericBaseRate(candidate, workspaceId);
    case 'date':
      return null;
  }
}
