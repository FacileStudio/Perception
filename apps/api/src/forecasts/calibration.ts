import { db } from '../db/client';
import { randomUUID } from 'crypto';
import type { CalibrationSnapshot } from './calibration-types';

type ResolvedForecast = {
  forecast_id: string;
  probability: number;
  outcome: number;
  question_type: string;
  provider_type: string | null;
  entity_type: string | null;
};

async function fetchResolvedForecasts(): Promise<ResolvedForecast[]> {
  const result = await db.execute(`
    SELECT
      f.id AS forecast_id,
      fb.probability,
      f.resolution_value AS outcome,
      f.question_type,
      f.provider_type,
      e.entity_type
    FROM forecasts f
    JOIN forecast_beliefs fb ON fb.forecast_id = f.id
    LEFT JOIN entities e ON e.id = f.entity_id
    WHERE f.status = 'resolved'
      AND f.question_type = 'binary'
      AND f.resolution_value IS NOT NULL
      AND fb.step = (
        SELECT MAX(fb2.step) FROM forecast_beliefs fb2 WHERE fb2.forecast_id = f.id
      )
  `);

  return result.rows.map((r) => ({
    forecast_id: r.forecast_id as string,
    probability: Number(r.probability),
    outcome: Number(r.outcome),
    question_type: r.question_type as string,
    provider_type: (r.provider_type as string) ?? null,
    entity_type: (r.entity_type as string) ?? null,
  }));
}

function computeBrier(forecasts: ResolvedForecast[]): number {
  if (forecasts.length === 0) return 0;
  const sum = forecasts.reduce((acc, f) => acc + (f.probability - f.outcome) ** 2, 0);
  return sum / forecasts.length;
}

function computeLogScore(forecasts: ResolvedForecast[]): number {
  if (forecasts.length === 0) return 0;
  const sum = forecasts.reduce((acc, f) => {
    const p = Math.max(0.001, Math.min(0.999, f.probability));
    return acc + (f.outcome * Math.log(p) + (1 - f.outcome) * Math.log(1 - p));
  }, 0);
  return -(sum / forecasts.length);
}

function computeSharpness(forecasts: ResolvedForecast[]): number {
  if (forecasts.length === 0) return 0;
  const mean = forecasts.reduce((acc, f) => acc + f.probability, 0) / forecasts.length;
  const variance = forecasts.reduce((acc, f) => acc + (f.probability - mean) ** 2, 0) / forecasts.length;
  return Math.sqrt(variance);
}

type BinResult = {
  bin_edges: number[];
  bin_counts: number[];
  bin_actuals: number[];
  reliability: number;
  resolution: number;
};

function computeBins(forecasts: ResolvedForecast[]): BinResult {
  const NUM_BINS = 10;
  const bin_edges: number[] = [];
  const bin_counts: number[] = new Array(NUM_BINS).fill(0);
  const bin_sums: number[] = new Array(NUM_BINS).fill(0);
  const bin_outcome_sums: number[] = new Array(NUM_BINS).fill(0);

  for (let i = 0; i <= NUM_BINS; i++) {
    bin_edges.push(i / NUM_BINS);
  }

  for (const f of forecasts) {
    let bin = Math.floor(f.probability * NUM_BINS);
    if (bin >= NUM_BINS) bin = NUM_BINS - 1;
    bin_counts[bin]++;
    bin_sums[bin] += f.probability;
    bin_outcome_sums[bin] += f.outcome;
  }

  const N = forecasts.length;
  const o_bar = N > 0 ? forecasts.reduce((acc, f) => acc + f.outcome, 0) / N : 0;
  const bin_actuals: number[] = [];

  let reliability = 0;
  let resolution = 0;

  for (let k = 0; k < NUM_BINS; k++) {
    const n_k = bin_counts[k];
    if (n_k === 0) {
      bin_actuals.push(0);
      continue;
    }
    const f_k = bin_sums[k] / n_k;
    const o_k = bin_outcome_sums[k] / n_k;
    bin_actuals.push(o_k);
    reliability += n_k * (f_k - o_k) ** 2;
    resolution += n_k * (o_k - o_bar) ** 2;
  }

  if (N > 0) {
    reliability /= N;
    resolution /= N;
  }

  return { bin_edges, bin_counts, bin_actuals, reliability, resolution };
}

function computeDomainScores(forecasts: ResolvedForecast[]): Record<string, { brier: number; count: number }> {
  const groups = new Map<string, ResolvedForecast[]>();

  for (const f of forecasts) {
    const keys = [
      `question_type:${f.question_type}`,
      f.provider_type ? `provider_type:${f.provider_type}` : null,
      f.entity_type ? `entity_type:${f.entity_type}` : null,
    ].filter(Boolean) as string[];

    for (const key of keys) {
      const arr = groups.get(key) ?? [];
      arr.push(f);
      groups.set(key, arr);
    }
  }

  const result: Record<string, { brier: number; count: number }> = {};
  for (const [key, arr] of groups) {
    result[key] = { brier: computeBrier(arr), count: arr.length };
  }
  return result;
}

type PavPoint = { x: number; y: number };

function fitIsotonicRegression(forecasts: ResolvedForecast[]): PavPoint[] {
  if (forecasts.length === 0) return [];

  const sorted = [...forecasts].sort((a, b) => a.probability - b.probability);
  const blocks: { sum_x: number; sum_y: number; count: number }[] = sorted.map((f) => ({
    sum_x: f.probability,
    sum_y: f.outcome,
    count: 1,
  }));

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < blocks.length - 1; i++) {
      const mean_i = blocks[i].sum_y / blocks[i].count;
      const mean_next = blocks[i + 1].sum_y / blocks[i + 1].count;
      if (mean_i > mean_next) {
        blocks[i] = {
          sum_x: blocks[i].sum_x + blocks[i + 1].sum_x,
          sum_y: blocks[i].sum_y + blocks[i + 1].sum_y,
          count: blocks[i].count + blocks[i + 1].count,
        };
        blocks.splice(i + 1, 1);
        merged = true;
      }
    }
  }

  return blocks.map((b) => ({
    x: b.sum_x / b.count,
    y: b.sum_y / b.count,
  }));
}

function applyPav(pavMap: PavPoint[], rawProbability: number): number {
  if (pavMap.length === 0) return rawProbability;
  if (pavMap.length === 1) return pavMap[0].y;
  if (rawProbability <= pavMap[0].x) return pavMap[0].y;
  if (rawProbability >= pavMap[pavMap.length - 1].x) return pavMap[pavMap.length - 1].y;

  for (let i = 0; i < pavMap.length - 1; i++) {
    if (rawProbability >= pavMap[i].x && rawProbability <= pavMap[i + 1].x) {
      const t = (rawProbability - pavMap[i].x) / (pavMap[i + 1].x - pavMap[i].x);
      return pavMap[i].y + t * (pavMap[i + 1].y - pavMap[i].y);
    }
  }

  return rawProbability;
}

export async function computeCalibration(): Promise<CalibrationSnapshot> {
  const forecasts = await fetchResolvedForecasts();
  const brier = computeBrier(forecasts);
  const logScore = computeLogScore(forecasts);
  const sharpness = computeSharpness(forecasts);
  const bins = computeBins(forecasts);
  const domainScores = computeDomainScores(forecasts);
  const pavMap = fitIsotonicRegression(forecasts);

  await db.execute({
    sql: `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('recalibration_map', ?, ?)`,
    args: [JSON.stringify(pavMap), new Date().toISOString()],
  });

  return {
    id: randomUUID(),
    computed_at: new Date().toISOString(),
    bin_edges: bins.bin_edges,
    bin_counts: bins.bin_counts,
    bin_actuals: bins.bin_actuals,
    brier_score: brier,
    log_score: logScore,
    resolution_score: bins.resolution,
    reliability_score: bins.reliability,
    sharpness_score: sharpness,
    domain_scores: domainScores,
    forecast_count: forecasts.length,
  };
}

export async function getRecalibrated(rawProbability: number): Promise<number> {
  const result = await db.execute({
    sql: `SELECT value FROM app_settings WHERE key = 'recalibration_map'`,
    args: [],
  });

  if (result.rows.length === 0) return rawProbability;

  const pavMap: PavPoint[] = JSON.parse(result.rows[0].value as string);
  return applyPav(pavMap, rawProbability);
}
