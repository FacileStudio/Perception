import { db } from '../db/client';
import { randomUUID } from 'crypto';
import { computeCalibration } from './calibration';

async function run(): Promise<void> {
  const lastSnapshot = await db.execute(
    `SELECT computed_at, brier_score FROM calibration_snapshots ORDER BY computed_at DESC LIMIT 1`
  );

  if (lastSnapshot.rows.length > 0) {
    const lastComputedAt = lastSnapshot.rows[0].computed_at as string;
    const resolvedSince = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM forecasts WHERE status = 'resolved' AND resolved_at > ?`,
      args: [lastComputedAt],
    });
    const count = Number(resolvedSince.rows[0].cnt);
    if (count < 20) return;
  }

  const snapshot = await computeCalibration();

  if (snapshot.forecast_count === 0) return;

  await db.execute({
    sql: `INSERT INTO calibration_snapshots
      (id, computed_at, bin_edges, bin_counts, bin_actuals, brier_score, log_score, resolution_score, reliability_score, uncertainty_score, sharpness_score, domain_scores, forecast_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  });

  if (lastSnapshot.rows.length > 0) {
    const prevBrier = Number(lastSnapshot.rows[0].brier_score);
    const delta = snapshot.brier_score - prevBrier;
    if (delta > 0.05) {
      await db.execute({
        sql: `INSERT INTO notifications (id, type, severity, title, message, entity_id, entity_name, metadata_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ],
      });
    }
  }

  console.log(`[calibration-worker] snapshot=${snapshot.id} brier=${snapshot.brier_score.toFixed(4)} forecasts=${snapshot.forecast_count}`);
}

export const calibrationWorker = { run };
