import { db } from '../db/client';
import { computeInterval, updateNonconformityScore, checkForChangePointReset } from './conformal';
import type { QuestionType } from './types';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const openForecasts = await db.execute({
      sql: `SELECT f.id, f.question_type, f.entity_id,
              (SELECT MAX(fb.step) FROM forecast_beliefs fb WHERE fb.forecast_id = f.id) AS latest_step,
              (SELECT MAX(fi.belief_step) FROM forecast_intervals fi WHERE fi.forecast_id = f.id) AS latest_interval_step
            FROM forecasts f
            WHERE f.status = 'open' AND f.workspace_id = ?
            ORDER BY f.created_at ASC LIMIT 50`,
      args: [workspaceId],
    });

    let computed = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of openForecasts.rows) {
      try {
        const r = row as Record<string, unknown>;
        const forecastId = r.id as string;
        const questionType = r.question_type as QuestionType;
        const entityId = r.entity_id as string | null;
        const latestStep = r.latest_step != null ? Number(r.latest_step) : null;
        const latestIntervalStep = r.latest_interval_step != null ? Number(r.latest_interval_step) : null;

        if (latestStep == null) {
          skipped++;
          continue;
        }

        if (latestIntervalStep != null && latestIntervalStep >= latestStep) {
          skipped++;
          continue;
        }

        if (entityId) {
          await checkForChangePointReset(entityId, workspaceId);
        }

        const belief = await db.execute({
          sql: `SELECT probability FROM forecast_beliefs WHERE forecast_id = ? AND step = ?`,
          args: [forecastId, latestStep],
        });

        if (belief.rows.length === 0) {
          skipped++;
          continue;
        }

        const probability = Number((belief.rows[0] as Record<string, unknown>).probability);
        await computeInterval(forecastId, latestStep, probability, questionType, workspaceId);
        computed++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[conformal-worker] failed to compute interval: ${msg}`);
      }
    }

    const resolved = await db.execute({
      sql: `SELECT f.id, f.resolution_value FROM forecasts f
            WHERE f.status = 'resolved' AND f.resolution_value IS NOT NULL AND f.workspace_id = ?
              AND EXISTS (
                SELECT 1 FROM forecast_intervals fi
                WHERE fi.forecast_id = f.id AND fi.nonconformity_score IS NULL
              )
            ORDER BY f.resolved_at DESC LIMIT 50`,
      args: [workspaceId],
    });

    let scored = 0;
    for (const row of resolved.rows) {
      try {
        const r = row as Record<string, unknown>;
        await updateNonconformityScore(r.id as string, Number(r.resolution_value), workspaceId);
        scored++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[conformal-worker] failed to update score: ${msg}`);
      }
    }

    if (computed > 0 || scored > 0 || errors > 0) {
      console.log(`[conformal-worker] intervals_computed=${computed} skipped=${skipped} scores_updated=${scored} errors=${errors} (workspace ${workspaceId})`);
    }
  });
}

export const conformalWorker = { run };
