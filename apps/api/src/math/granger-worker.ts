import { randomUUID } from 'crypto';
import { log } from '../lib/logger';
import { db } from '../db/client';
import { grangerTest, firstDifference } from './granger';
import { forEachWorkspace } from '../db/workspaces';

const MIN_DAYS = 60;
const MIN_NONZERO_RATIO = 0.5;
const P_VALUE_THRESHOLD = 0.01;

type DailyCounts = Map<string, Map<string, number>>;

function fillMissingDays(counts: DailyCounts): Map<string, number[]> {
  const allDays = new Set<string>();
  for (const dayMap of counts.values()) {
    for (const day of dayMap.keys()) allDays.add(day);
  }
  const sorted = [...allDays].sort();
  if (sorted.length === 0) return new Map();

  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  const fullDays: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    fullDays.push(d.toISOString().slice(0, 10));
  }

  const result = new Map<string, number[]>();
  for (const [series, dayMap] of counts) {
    const values = fullDays.map((day) => dayMap.get(day) ?? 0);
    result.set(series, values);
  }
  return result;
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const rows = await db.execute({
      sql: `SELECT date(occurred_at) as day, COALESCE(entity_type, 'unknown') || ':' || COALESCE(provider_type, 'unknown') as series_key, COUNT(*) as cnt
       FROM events WHERE occurred_at > datetime('now', '-120 days') AND workspace_id = ?
       GROUP BY day, series_key`,
      args: [workspaceId],
    });

    const counts: DailyCounts = new Map();
    for (const row of rows.rows) {
      const key = row.series_key as string;
      const day = row.day as string;
      const cnt = row.cnt as number;
      if (!counts.has(key)) counts.set(key, new Map());
      counts.get(key)!.set(day, cnt);
    }

    const filled = fillMissingDays(counts);

    const qualifying: Map<string, number[]> = new Map();
    for (const [key, values] of filled) {
      if (values.length < MIN_DAYS) continue;
      const nonZero = values.filter((v) => v > 0).length;
      if (nonZero / values.length < MIN_NONZERO_RATIO) continue;
      qualifying.set(key, values);
    }

    const keys = [...qualifying.keys()];
    if (keys.length < 2) return;

    const numTests = keys.length * (keys.length - 1);
    const bonferroni = P_VALUE_THRESHOLD / numTests;
    let detected = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        if (i === j) continue;

        const yRaw = qualifying.get(keys[i])!;
        const xRaw = qualifying.get(keys[j])!;

        const y = firstDifference(yRaw);
        const x = firstDifference(xRaw);

        const result = grangerTest(y, x);
        if (!result || result.pValue >= bonferroni) continue;

        const cause = keys[j];
        const effect = keys[i];

        const reverseResult = grangerTest(x, y);
        const reverseSig = reverseResult && reverseResult.pValue < bonferroni;
        const direction = reverseSig ? 'bidirectional' : 'forward';

        if (direction === 'bidirectional' && i > j) continue;

        await db.execute({
          sql: `UPDATE causal_links SET superseded_at = ? WHERE cause_series = ? AND effect_series = ? AND superseded_at IS NULL AND workspace_id = ?`,
          args: [now, cause, effect, workspaceId],
        });

        if (direction === 'bidirectional') {
          await db.execute({
            sql: `UPDATE causal_links SET superseded_at = ? WHERE cause_series = ? AND effect_series = ? AND superseded_at IS NULL AND workspace_id = ?`,
            args: [now, effect, cause, workspaceId],
          });
        }

        await db.execute({
          sql: `INSERT INTO causal_links (id, cause_series, effect_series, lag_days, f_statistic, p_value, bic_score, sample_size, direction, detected_at, workspace_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            cause,
            effect,
            result.lag,
            result.fStatistic,
            result.pValue,
            result.bic,
            result.sampleSize,
            direction,
            now,
            workspaceId,
          ],
        });

        detected++;
      }
    }

    if (detected > 0) {
      log.info('detected causal links', { tag: 'granger', detected, workspaceId });
    }
  });
}

export const grangerWorker = { run };
