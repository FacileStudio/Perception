import { db } from '../db/client';
import {
  ensureStrategiesSeeded,
  generateStrategyForecasts,
  updateStrategyScores,
  retireUnderperformers,
} from './ensemble';

async function run(): Promise<void> {
  await ensureStrategiesSeeded();

  const openForecasts = await db.execute(
    `SELECT f.id FROM forecasts f
     WHERE f.status = 'open'
       AND NOT EXISTS (SELECT 1 FROM strategy_forecasts sf WHERE sf.forecast_id = f.id)
     ORDER BY f.created_at ASC LIMIT 20`,
  );

  let generated = 0;
  let errors = 0;
  for (const row of openForecasts.rows) {
    try {
      await generateStrategyForecasts(row.id as string);
      generated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ensemble-worker] failed to generate for ${row.id}: ${msg}`);
    }
  }

  const lastScoredResult = await db.execute({
    sql: `SELECT value FROM app_settings WHERE key = 'ensemble_last_scored_at'`,
    args: [],
  });
  const lastScoredAt = lastScoredResult.rows.length > 0
    ? (lastScoredResult.rows[0].value as string)
    : '1970-01-01T00:00:00Z';

  const resolved = await db.execute({
    sql: `SELECT f.id, f.resolution_value, f.resolved_at FROM forecasts f
          WHERE f.status = 'resolved'
            AND f.question_type = 'binary'
            AND f.resolution_value IS NOT NULL
            AND f.resolved_at > ?
            AND EXISTS (SELECT 1 FROM strategy_forecasts sf WHERE sf.forecast_id = f.id)
          ORDER BY f.resolved_at ASC LIMIT 20`,
    args: [lastScoredAt],
  });

  let scored = 0;
  for (const row of resolved.rows) {
    try {
      await updateStrategyScores(row.id as string, Number(row.resolution_value));
      scored++;
      await db.execute({
        sql: `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('ensemble_last_scored_at', ?, ?)`,
        args: [row.resolved_at as string, new Date().toISOString()],
      });
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ensemble-worker] failed to score ${row.id}: ${msg}`);
    }
  }

  const retired = await retireUnderperformers();

  if (generated > 0 || scored > 0 || retired > 0 || errors > 0) {
    console.log(`[ensemble-worker] generated=${generated} scored=${scored} retired=${retired} errors=${errors}`);
  }
}

export const ensembleWorker = { run };
