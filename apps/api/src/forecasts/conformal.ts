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

async function loadAlphaT(): Promise<number> {
  const result = await db.execute({
    sql: `SELECT value FROM app_settings WHERE key = 'conformal_alpha_t'`,
    args: [],
  });
  if (result.rows.length > 0) {
    const val = Number(result.rows[0].value);
    if (!isNaN(val) && val >= 0.01 && val <= 0.5) return val;
  }
  return 1 - DEFAULT_COVERAGE_TARGET;
}

async function saveAlphaT(alphaT: number): Promise<void> {
  await db.execute({
    sql: `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('conformal_alpha_t', ?, ?)`,
    args: [String(alphaT), new Date().toISOString()],
  });
}

function getCalibrationScores(rows: Array<Record<string, unknown>>): number[] {
  return rows
    .filter((r) => r.nonconformity_score != null)
    .map((r) => Number(r.nonconformity_score));
}

function computeQuantile(scores: number[], alpha: number): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = Math.min(Math.ceil((n + 1) * (1 - alpha)) - 1, n - 1);
  return sorted[Math.max(0, idx)];
}

function clampInterval(lower: number, upper: number, questionType: QuestionType): [number, number] {
  if (questionType === 'binary') {
    return [Math.max(0, lower), Math.min(1, upper)];
  }
  return [Math.max(0, lower), upper];
}

export async function computeInterval(
  forecastId: string,
  beliefStep: number,
  probability: number,
  questionType: QuestionType,
  workspaceId: string = '',
): Promise<ForecastInterval> {
  const alphaT = await loadAlphaT();

  const wsFilter = workspaceId ? ' AND f.workspace_id = ?' : '';
  const calibrationArgs: (string | number | null)[] = [questionType];
  if (workspaceId) calibrationArgs.push(workspaceId);
  calibrationArgs.push(CALIBRATION_WINDOW);

  const calibrationResult = await db.execute({
    sql: `SELECT fi.nonconformity_score FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved'
            AND f.question_type = ?
            AND fi.nonconformity_score IS NOT NULL${wsFilter}
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args: calibrationArgs,
  });

  const scores = getCalibrationScores(calibrationResult.rows as Array<Record<string, unknown>>);

  let lower: number;
  let upper: number;

  if (scores.length < MIN_CALIBRATION_SIZE) {
    const defaultWidth = questionType === 'binary' ? 0.4 : Math.max(0.1, probability * 0.5);
    lower = probability - defaultWidth;
    upper = probability + defaultWidth;
  } else {
    let quantile = computeQuantile(scores, alphaT);

    const empirical = await computeEmpiricalCoverage(questionType, workspaceId);
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
    sql: `INSERT INTO forecast_intervals (id, forecast_id, belief_step, lower_bound, upper_bound, coverage_target, nonconformity_score, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [interval.id, interval.forecast_id, interval.belief_step, interval.lower_bound, interval.upper_bound, interval.coverage_target, null, workspaceId],
  });

  return interval;
}

export async function updateNonconformityScore(forecastId: string, actualValue: number, _workspaceId: string = ''): Promise<void> {
  const latest = await db.execute({
    sql: `SELECT fi.id, fb.probability, fi.lower_bound, fi.upper_bound
          FROM forecast_intervals fi
          JOIN forecast_beliefs fb ON fb.forecast_id = fi.forecast_id AND fb.step = fi.belief_step
          WHERE fi.forecast_id = ?
          ORDER BY fi.belief_step DESC LIMIT 1`,
    args: [forecastId],
  });

  if (latest.rows.length === 0) return;

  const row = latest.rows[0] as Record<string, unknown>;
  const predicted = Number(row.probability);
  const score = Math.abs(actualValue - predicted);

  await db.execute({
    sql: `UPDATE forecast_intervals SET nonconformity_score = ? WHERE forecast_id = ?`,
    args: [score, forecastId],
  });

  const lower = Number(row.lower_bound);
  const upper = Number(row.upper_bound);
  const covered = actualValue >= lower && actualValue <= upper;
  const errT = covered ? 0 : 1;

  let alphaT = await loadAlphaT();
  alphaT = alphaT + ACI_GAMMA * ((1 - DEFAULT_COVERAGE_TARGET) - errT);
  alphaT = Math.max(0.01, Math.min(0.5, alphaT));
  await saveAlphaT(alphaT);
}

async function computeEmpiricalCoverage(questionType?: string, workspaceId: string = ''): Promise<number> {
  const whereExtra = questionType ? ' AND f.question_type = ?' : '';
  const wsFilter = workspaceId ? ' AND f.workspace_id = ?' : '';
  const args: (string | number)[] = [];
  if (questionType) args.push(questionType);
  if (workspaceId) args.push(workspaceId);
  args.push(COVERAGE_MONITOR_WINDOW);

  const result = await db.execute({
    sql: `SELECT fi.lower_bound, fi.upper_bound, f.resolution_value
          FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved' AND f.resolution_value IS NOT NULL AND fi.nonconformity_score IS NOT NULL
          ${whereExtra}${wsFilter}
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args,
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

export async function getConformalState(workspaceId: string = ''): Promise<ConformalState> {
  const wsFilter = workspaceId ? ' AND f.workspace_id = ?' : '';
  const confArgs: (string | number | null)[] = [];
  if (workspaceId) confArgs.push(workspaceId);
  confArgs.push(CALIBRATION_WINDOW);

  const calibrationResult = await db.execute({
    sql: `SELECT fi.nonconformity_score FROM forecast_intervals fi
          JOIN forecasts f ON f.id = fi.forecast_id
          WHERE f.status = 'resolved' AND fi.nonconformity_score IS NOT NULL${wsFilter}
          ORDER BY f.resolved_at DESC LIMIT ?`,
    args: confArgs,
  });

  const scores = getCalibrationScores(calibrationResult.rows as Array<Record<string, unknown>>);
  const empirical = await computeEmpiricalCoverage(undefined, workspaceId);
  const alphaT = await loadAlphaT();

  return {
    calibration_scores: scores,
    coverage_target: DEFAULT_COVERAGE_TARGET,
    empirical_coverage: Math.round(empirical * 1e4) / 1e4,
    alpha_t: Math.round(alphaT * 1e6) / 1e6,
  };
}

export async function checkForChangePointReset(entityId: string, workspaceId: string = ''): Promise<void> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const cpArgs: (string | number | null)[] = [entityId];
  if (workspaceId) cpArgs.push(workspaceId);

  const recent = await db.execute({
    sql: `SELECT id FROM change_points
          WHERE entity_id = ? AND detected_at > datetime('now', '-12 hours')${wsFilter}
          LIMIT 1`,
    args: cpArgs,
  });

  if (recent.rows.length > 0) {
    await saveAlphaT(1 - DEFAULT_COVERAGE_TARGET);
    console.log(`[conformal] alpha_t reset due to change point for entity ${entityId}`);
  }
}
