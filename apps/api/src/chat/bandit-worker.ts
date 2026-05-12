import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { QueryPlan } from './planner';
import type { RetrievalSource } from './lanes/types';

type Intent = QueryPlan['intent'];
type WeightMatrix = Record<Intent, Record<RetrievalSource, number>>;

const ALL_INTENTS: Intent[] = ['lookup', 'trend', 'status_check', 'comparison', 'anomaly', 'narrative', 'counterfactual'];
const ALL_LANES: RetrievalSource[] = ['entity', 'fts', 'concept', 'sql', 'vector', 'stats', 'graph', 'community', 'text_to_sql'];

function sampleBeta(alpha: number, beta: number): number {
  const x = gammaVariate(alpha);
  const y = gammaVariate(beta);
  return x / (x + y);
}

function gammaVariate(shape: number): number {
  if (shape < 1) {
    return gammaVariate(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = normalVariate();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normalVariate(): number {
  let u: number;
  let v: number;
  let s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

async function fitWeights(): Promise<{ weights: WeightMatrix; sampleSize: number; avgReward: number } | null> {
  const rows = await db.execute({
    sql: `SELECT intent, lane_weights, active_lanes, outcome_label
          FROM retrieval_outcomes
          WHERE outcome_label IS NOT NULL
          ORDER BY occurred_at DESC
          LIMIT 5000`,
    args: [],
  });

  if (rows.rows.length < 20) return null;

  const alphas: Record<string, number> = {};
  const betas: Record<string, number> = {};

  for (const intent of ALL_INTENTS) {
    for (const lane of ALL_LANES) {
      const key = `${intent}:${lane}`;
      alphas[key] = 1;
      betas[key] = 1;
    }
  }

  let totalReward = 0;

  for (const row of rows.rows) {
    const intent = row.intent as Intent;
    const activeLanes = JSON.parse(row.active_lanes as string) as RetrievalSource[];
    const label = row.outcome_label as string;
    const isPositive = label === 'up';

    for (const lane of activeLanes) {
      const key = `${intent}:${lane}`;
      if (!(key in alphas)) continue;
      if (isPositive) {
        alphas[key] += 1;
        totalReward += 1;
      } else {
        betas[key] += 1;
      }
    }
  }

  const weights = {} as WeightMatrix;
  for (const intent of ALL_INTENTS) {
    weights[intent] = {} as Record<RetrievalSource, number>;
    for (const lane of ALL_LANES) {
      const key = `${intent}:${lane}`;
      weights[intent][lane] = sampleBeta(alphas[key], betas[key]);
    }
  }

  return {
    weights,
    sampleSize: rows.rows.length,
    avgReward: totalReward / rows.rows.length,
  };
}

async function persistVersion(weights: WeightMatrix, sampleSize: number, avgReward: number): Promise<void> {
  const lastVersion = await db.execute(`SELECT MAX(version) AS v FROM retrieval_weight_versions`);
  const nextVersion = ((lastVersion.rows[0]?.v as number | null) ?? 0) + 1;

  await db.execute({
    sql: `INSERT INTO retrieval_weight_versions (id, version, weights, sample_size, avg_reward, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), nextVersion, JSON.stringify(weights), sampleSize, avgReward, new Date().toISOString()],
  });
}

async function run(): Promise<void> {
  const result = await fitWeights();
  if (!result) return;
  await persistVersion(result.weights, result.sampleSize, result.avgReward);
}

export const banditWorker = { run };
