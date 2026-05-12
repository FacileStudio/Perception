import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { QuestionType } from './types';
import type { ForecastInterval, ConformalState } from './conformal-types';

const CALIBRATION_WINDOW = 200;
const COVERAGE_MONITOR_WINDOW = 100;
const DEFAULT_COVERAGE_TARGET = 0.9;
const ACI_GAMMA = 0.005;
const MIN_CALIBRATION_SIZE = 20;
const COVERAGE_DRIFT_THRESHOLD = 0.05;
const COVERAGE_WIDEN_FACTOR = 1.1;

let alphaT = 1 - DEFAULT_COVERAGE_TARGET;

function getCalibrationScores(rows: Array<Record<string, unknown>>): number[] {
  return rows
    .filter((r) => r.nonconformity_score != null)
    .map((r) => Number(r.nonconformity_score));
}

function computeQuantile(scores: number[], alpha: number): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const level = Math.ceil((n + 1) * (1 - alpha)) / n;
  const idx = Math.min(Math.floor(level * n), n - 1);
  return sorted[idx];
}

function clampInterval(lower: number, upper: number, questionType: QuestionType): [number, number] {
  if (questionType === 'binary') {
    return [Math.max(0, lower), Math.min(1, upper)];
  }
  return [lower, upper];
}

export async function computeInterval(
  forecastId: string,
  beliefStep: number,
  probability: number,
  questionType: QuestionType,
): Promise<ForecastInterval> {
  const calibrationResult = await db.execute({
    sql: `SELECT fi.nonconformity_score FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved' AND fi.nonconformity_score IS NOT NULL
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args: [CALIBRATION_WINDOW],
  });

  const scores = getCalibrationScores(calibrationResult.rows as Array<Record<string, unknown>>);

  let lower: number;
  let upper: number;

  if (scores.length < MIN_CALIBRATION_SIZE) {
    const defaultWidth = questionType === 'binary' ? 0.4 : probability * 0.5;
    lower = probability - defaultWidth;
    upper = probability + defaultWidth;
  } else {
    let quantile = computeQuantile(scores, alphaT);

    const empirical = await computeEmpiricalCoverage();
    if (empirical < DEFAULT_COVERAGE_TARGET - COVERAGE_DRIFT_THRESHOLD) {
      quantile *= COVERAGE_WIDEN_FACTOR;
    }

    lower = probability - quantile;
    upper = probability + quantile;
  }

  const [clampedLower, clampedUpper] = clampInterval(lower, upper, questionType);

  const interval: ForecastInterval = {
    id: randomUUID(),
    forecast_id: forecastId,
    belief_step: beliefStep,
    lower_bound: Math.round(clampedLower * 1e6) / 1e6,
    upper_bound: Math.round(clampedUpper * 1e6) / 1e6,
    coverage_target: DEFAULT_COVERAGE_TARGET,
    nonconformity_score: null,
  };

  await db.execute({
    sql: `INSERT INTO forecast_intervals (id, forecast_id, belief_step, lower_bound, upper_bound, coverage_target, nonconformity_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [interval.id, interval.forecast_id, interval.belief_step, interval.lower_bound, interval.upper_bound, interval.coverage_target, null],
  });

  return interval;
}

export async function updateNonconformityScore(forecastId: string, actualValue: number): Promise<void> {
  const intervals = await db.execute({
    sql: `SELECT fi.id, fi.lower_bound, fi.upper_bound, fb.probability
          FROM forecast_intervals fi
          JOIN forecast_beliefs fb ON fb.forecast_id = fi.forecast_id AND fb.step = fi.belief_step
          WHERE fi.forecast_id = ?
          ORDER BY fi.belief_step DESC`,
    args: [forecastId],
  });

  for (const row of intervals.rows) {
    const predicted = Number((row as Record<string, unknown>).probability);
    const score = Math.abs(actualValue - predicted);
    const intervalId = (row as Record<string, unknown>).id as string;

    await db.execute({
      sql: `UPDATE forecast_intervals SET nonconformity_score = ? WHERE id = ?`,
      args: [score, intervalId],
    });

    const lower = Number((row as Record<string, unknown>).lower_bound);
    const upper = Number((row as Record<string, unknown>).upper_bound);
    const covered = actualValue >= lower && actualValue <= upper;
    const errT = covered ? 0 : 1;
    alphaT = alphaT + ACI_GAMMA * ((1 - DEFAULT_COVERAGE_TARGET) - errT);
    alphaT = Math.max(0.01, Math.min(0.5, alphaT));
  }
}

async function computeEmpiricalCoverage(): Promise<number> {
  const result = await db.execute({
    sql: `SELECT fi.lower_bound, fi.upper_bound, f.resolution_value
          FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved' AND f.resolution_value IS NOT NULL AND fi.nonconformity_score IS NOT NULL
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args: [COVERAGE_MONITOR_WINDOW],
  });

  if (result.rows.length === 0) return DEFAULT_COVERAGE_TARGET;

  let covered = 0;
  for (const row of result.rows) {
    const r = row as Record<string, unknown>;
    const lower = Number(r.lower_bound);
    const upper = Number(r.upper_bound);
    const actual = Number(r.resolution_value);
    if (actual >= lower && actual <= upper) covered++;
  }

  return covered / result.rows.length;
}

export async function getConformalState(): Promise<ConformalState> {
  const calibrationResult = await db.execute({
    sql: `SELECT fi.nonconformity_score FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved' AND fi.nonconformity_score IS NOT NULL
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args: [CALIBRATION_WINDOW],
  });

  const scores = getCalibrationScores(calibrationResult.rows as Array<Record<string, unknown>>);
  const empirical = await computeEmpiricalCoverage();

  return {
    calibration_scores: scores,
    coverage_target: DEFAULT_COVERAGE_TARGET,
    empirical_coverage: Math.round(empirical * 1e4) / 1e4,
    alpha_t: Math.round(alphaT * 1e6) / 1e6,
  };
}

export async function checkForChangePointReset(entityId: string): Promise<void> {
  const recent = await db.execute({
    sql: `SELECT id FROM change_points
          WHERE entity_id = ? AND detected_at > datetime('now', '-12 hours')
          LIMIT 1`,
    args: [entityId],
  });

  if (recent.rows.length > 0) {
    alphaT = 1 - DEFAULT_COVERAGE_TARGET;
    console.log(`[conformal] alpha_t reset due to change point for entity ${entityId}`);
  }
}
