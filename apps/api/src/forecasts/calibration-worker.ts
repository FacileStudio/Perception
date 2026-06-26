import { log } from '../lib/logger';
import { db } from '../db/client';
import { randomUUID } from 'crypto';
import { computeCalibration } from './calibration';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const lastSnapshot = await db.execute({
      sql: `SELECT computed_at, brier_score FROM calibration_snapshots WHERE workspace_id = ? ORDER BY computed_at DESC LIMIT 1`,
      args: [workspaceId],
    });

    if (lastSnapshot.rows.length > 0) {
      const lastComputedAt = lastSnapshot.rows[0].computed_at as string;
      const resolvedSince = await db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM forecasts WHERE status = 'resolved' AND resolved_at > ? AND workspace_id = ?`,
        args: [lastComputedAt, workspaceId],
      });
      const count = Number(resolvedSince.rows[0].cnt);
      if (count < 20) return;
    }

    const snapshot = await computeCalibration(workspaceId);

    if (snapshot.forecast_count === 0) return;

    await db.execute({
      sql: `INSERT INTO calibration_snapshots
        (id, computed_at, bin_edges, bin_counts, bin_actuals, brier_score, log_score, resolution_score, reliability_score, uncertainty_score, sharpness_score, domain_scores, forecast_count, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshot.id,
        snapshot.computed_at,
        JSON.stringify(snapshot.bin_edges),
        JSON.stringify(snapshot.bin_counts),
        JSON.stringify(snapshot.bin_actuals),
        snapshot.brier_score,
        snapshot.log_score,
        snapshot.resolution_score,
        snapshot.reliability_score,
        snapshot.uncertainty_score,
        snapshot.sharpness_score,
        JSON.stringify(snapshot.domain_scores),
        snapshot.forecast_count,
        workspaceId,
      ],
    });

    if (lastSnapshot.rows.length > 0) {
      const prevBrier = Number(lastSnapshot.rows[0].brier_score);
      const delta = snapshot.brier_score - prevBrier;
      if (delta > 0.05) {
        await db.execute({
          sql: `INSERT INTO notifications (id, type, severity, title, message, entity_id, entity_name, metadata_json, created_at, workspace_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            'calibration_degradation',
            'warning',
            'Calibration degradation detected',
            `Brier score increased by ${delta.toFixed(3)} (${prevBrier.toFixed(3)} → ${snapshot.brier_score.toFixed(3)})`,
            null,
            null,
            JSON.stringify({ prev_brier: prevBrier, new_brier: snapshot.brier_score, delta }),
            snapshot.computed_at,
            workspaceId,
          ],
        });
      }
    }

    log.info('calibration snapshot', { tag: 'calibration-worker', snapshotId: snapshot.id, brier: parseFloat(snapshot.brier_score.toFixed(4)), forecasts: snapshot.forecast_count, workspaceId });
  });
}

export const calibrationWorker = { run };
