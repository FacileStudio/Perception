import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { ForecastStrategy, StrategyScore, StrategyType } from './ensemble-types';

const COLD_START_THRESHOLD = 30;
const RETIRE_BRIER_THRESHOLD = 0.35;
const RETIRE_MIN_FORECASTS = 50;
const EXPLORATION_RATE = 0.1;
const SHRINKAGE_VARIANCE_THRESHOLD = 2.0;
const EPSILON = 0.01;

const BUILT_IN_STRATEGIES: Array<{ name: string; description: string; strategy_type: StrategyType }> = [
  { name: 'base_rate', description: 'Pure reference class frequency from historical data', strategy_type: 'base_rate' },
  { name: 'causal', description: 'Extrapolation from Granger causal links and BOCPD signals', strategy_type: 'causal' },
  { name: 'pattern', description: 'Entity narrative and community context pattern matching', strategy_type: 'pattern' },
  { name: 'llm_belief', description: 'Full Bayesian belief loop via LLM superforecaster', strategy_type: 'llm_belief' },
];

function logit(p: number): number {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function rowToStrategy(r: Record<string, unknown>): ForecastStrategy {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    strategy_type: r.strategy_type as StrategyType,
    is_active: r.is_active === 1 || r.is_active === true,
    brier_score: r.brier_score != null ? Number(r.brier_score) : null,
    brier_count: Number(r.brier_count ?? 0),
    log_weight: Number(r.log_weight ?? 0),
    created_at: r.created_at as string,
  };
}

export async function ensureStrategiesSeeded(): Promise<void> {
  const existing = await db.execute(`SELECT name FROM forecast_strategies`);
  const names = new Set(existing.rows.map((r) => r.name as string));

  for (const s of BUILT_IN_STRATEGIES) {
    if (names.has(s.name)) continue;
    await db.execute({
      sql: `INSERT INTO forecast_strategies (id, name, description, strategy_type, is_active, brier_score, brier_count, log_weight, created_at)
            VALUES (?, ?, ?, ?, 1, NULL, 0, 0, ?)`,
      args: [randomUUID(), s.name, s.description, s.strategy_type, new Date().toISOString()],
    });
  }
}

async function getActiveStrategies(): Promise<ForecastStrategy[]> {
  const result = await db.execute(`SELECT * FROM forecast_strategies WHERE is_active = 1`);
  return result.rows.map((r) => rowToStrategy(r as Record<string, unknown>));
}

async function baseRatePredict(forecastId: string): Promise<number | null> {
  const result = await db.execute({
    sql: `SELECT base_rate FROM forecasts WHERE id = ?`,
    args: [forecastId],
  });
  if (result.rows.length === 0) return null;
  const rate = result.rows[0].base_rate;
  return rate != null ? Number(rate) : null;
}

async function causalPredict(forecastId: string): Promise<number | null> {
  const forecast = await db.execute({
    sql: `SELECT entity_id, base_rate FROM forecasts WHERE id = ?`,
    args: [forecastId],
  });
  if (forecast.rows.length === 0) return null;
  const entityId = forecast.rows[0].entity_id as string | null;
  const baseRate = forecast.rows[0].base_rate != null ? Number(forecast.rows[0].base_rate) : 0.5;
  if (!entityId) return baseRate;

  let adjustment = 0;

  const changePoints = await db.execute({
    sql: `SELECT post_mean, pre_mean FROM change_points
          WHERE entity_id = ?
          ORDER BY detected_at DESC LIMIT 1`,
    args: [entityId],
  });
  if (changePoints.rows.length > 0) {
    const post = Number(changePoints.rows[0].post_mean);
    const pre = Number(changePoints.rows[0].pre_mean);
    if (pre > 0) {
      adjustment += Math.min(0.15, Math.max(-0.15, (post - pre) / pre * 0.1));
    }
  }

  const causalLinks = await db.execute({
    sql: `SELECT direction, p_value FROM causal_links
          WHERE (cause_series LIKE ? OR effect_series LIKE ?)
          AND superseded_at IS NULL AND p_value < 0.05
          ORDER BY detected_at DESC LIMIT 3`,
    args: [`%${entityId}%`, `%${entityId}%`],
  });
  if (causalLinks.rows.length > 0) {
    adjustment += 0.05 * causalLinks.rows.length / 3;
  }

  return Math.max(0.01, Math.min(0.99, baseRate + adjustment));
}

async function patternPredict(forecastId: string): Promise<number | null> {
  const forecast = await db.execute({
    sql: `SELECT entity_id, base_rate FROM forecasts WHERE id = ?`,
    args: [forecastId],
  });
  if (forecast.rows.length === 0) return null;
  const entityId = forecast.rows[0].entity_id as string | null;
  const baseRate = forecast.rows[0].base_rate != null ? Number(forecast.rows[0].base_rate) : 0.5;
  if (!entityId) return baseRate;

  let adjustment = 0;

  const narrative = await db.execute({
    sql: `SELECT narrative_text FROM entity_narratives WHERE entity_id = ?`,
    args: [entityId],
  });
  if (narrative.rows.length > 0) {
    const text = (narrative.rows[0].narrative_text as string).toLowerCase();
    const positiveSignals = ['active', 'growing', 'increasing', 'healthy', 'consistent'];
    const negativeSignals = ['inactive', 'declining', 'silent', 'stale', 'risk'];
    const posHits = positiveSignals.filter((s) => text.includes(s)).length;
    const negHits = negativeSignals.filter((s) => text.includes(s)).length;
    adjustment += (posHits - negHits) * 0.03;
  }

  const community = await db.execute({
    sql: `SELECT summary FROM entity_communities
          WHERE member_entity_ids LIKE ? AND stale = 0
          ORDER BY generated_at DESC LIMIT 1`,
    args: [`%${entityId}%`],
  });
  if (community.rows.length > 0) {
    adjustment += 0.02;
  }

  return Math.max(0.01, Math.min(0.99, baseRate + adjustment));
}

async function llmBeliefPredict(forecastId: string): Promise<number | null> {
  const result = await db.execute({
    sql: `SELECT probability FROM forecast_beliefs
          WHERE forecast_id = ?
          ORDER BY step DESC LIMIT 1`,
    args: [forecastId],
  });
  if (result.rows.length === 0) return null;
  return Number(result.rows[0].probability);
}

const strategyRunners: Record<StrategyType, (forecastId: string) => Promise<number | null>> = {
  base_rate: baseRatePredict,
  causal: causalPredict,
  pattern: patternPredict,
  llm_belief: llmBeliefPredict,
  human: async () => null,
};

export async function generateStrategyForecasts(forecastId: string): Promise<void> {
  const strategies = await getActiveStrategies();
  const now = new Date().toISOString();

  for (const strategy of strategies) {
    const existing = await db.execute({
      sql: `SELECT id FROM strategy_forecasts WHERE forecast_id = ? AND strategy_id = ?`,
      args: [forecastId, strategy.id],
    });
    if (existing.rows.length > 0) continue;

    const runner = strategyRunners[strategy.strategy_type];
    if (!runner) continue;

    const probability = await runner(forecastId);
    if (probability == null) continue;

    await db.execute({
      sql: `INSERT INTO strategy_forecasts (id, forecast_id, strategy_id, probability, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [randomUUID(), forecastId, strategy.id, probability, now],
    });
  }
}

export async function aggregateEnsemble(forecastId: string): Promise<{
  ensemble_probability: number;
  strategy_predictions: Array<{ strategy_name: string; strategy_type: string; probability: number; weight: number }>;
} | null> {
  const predictions = await db.execute({
    sql: `SELECT sf.probability, fs.name, fs.strategy_type, fs.brier_score, fs.brier_count, fs.log_weight
          FROM strategy_forecasts sf
          JOIN forecast_strategies fs ON fs.id = sf.strategy_id
          WHERE sf.forecast_id = ? AND fs.is_active = 1`,
    args: [forecastId],
  });

  if (predictions.rows.length === 0) return null;

  const isExploration = Math.random() < EXPLORATION_RATE;

  const items = predictions.rows.map((r) => {
    const row = r as Record<string, unknown>;
    const brierCount = Number(row.brier_count ?? 0);
    const brierScore = row.brier_score != null ? Number(row.brier_score) : null;

    let weight: number;
    if (isExploration || brierCount < COLD_START_THRESHOLD || brierScore == null) {
      weight = 1 / predictions.rows.length;
    } else {
      weight = 1 / (brierScore + EPSILON);
    }

    return {
      name: row.name as string,
      strategy_type: row.strategy_type as string,
      probability: Number(row.probability),
      rawWeight: weight,
    };
  });

  const totalWeight = items.reduce((acc, i) => acc + i.rawWeight, 0);
  const normalizedItems = items.map((i) => ({
    ...i,
    weight: totalWeight > 0 ? i.rawWeight / totalWeight : 1 / items.length,
  }));

  let ensembleLogit = normalizedItems.reduce(
    (acc, i) => acc + i.weight * logit(i.probability),
    0,
  );

  const logitValues = normalizedItems.map((i) => logit(i.probability));
  const logitMean = logitValues.reduce((a, b) => a + b, 0) / logitValues.length;
  const logitVariance = logitValues.reduce((acc, v) => acc + (v - logitMean) ** 2, 0) / logitValues.length;

  if (logitVariance > SHRINKAGE_VARIANCE_THRESHOLD) {
    const forecast = await db.execute({
      sql: `SELECT base_rate FROM forecasts WHERE id = ?`,
      args: [forecastId],
    });
    const baseRate = forecast.rows.length > 0 && forecast.rows[0].base_rate != null
      ? Number(forecast.rows[0].base_rate)
      : 0.5;
    const baseLogit = logit(baseRate);
    const lambda = Math.min(1, SHRINKAGE_VARIANCE_THRESHOLD / logitVariance);
    ensembleLogit = lambda * ensembleLogit + (1 - lambda) * baseLogit;
  }

  const ensembleProbability = Math.round(sigmoid(ensembleLogit) * 1000) / 1000;

  return {
    ensemble_probability: ensembleProbability,
    strategy_predictions: normalizedItems.map((i) => ({
      strategy_name: i.name,
      strategy_type: i.strategy_type,
      probability: i.probability,
      weight: Math.round(i.weight * 1000) / 1000,
    })),
  };
}

export async function updateStrategyScores(forecastId: string, actualOutcome: number): Promise<void> {
  const predictions = await db.execute({
    sql: `SELECT sf.strategy_id, sf.probability FROM strategy_forecasts sf
          JOIN forecast_strategies fs ON fs.id = sf.strategy_id
          WHERE sf.forecast_id = ?`,
    args: [forecastId],
  });

  for (const row of predictions.rows) {
    const r = row as Record<string, unknown>;
    const strategyId = r.strategy_id as string;
    const p = Number(r.probability);
    const brierContrib = (p - actualOutcome) ** 2;

    const clampedP = Math.max(0.001, Math.min(0.999, p));
    const logLikelihood = actualOutcome * Math.log(clampedP) + (1 - actualOutcome) * Math.log(1 - clampedP);

    const current = await db.execute({
      sql: `SELECT brier_score, brier_count, log_weight FROM forecast_strategies WHERE id = ?`,
      args: [strategyId],
    });
    if (current.rows.length === 0) continue;

    const prevBrier = current.rows[0].brier_score != null ? Number(current.rows[0].brier_score) : 0;
    const prevCount = Number(current.rows[0].brier_count ?? 0);
    const prevLogWeight = Number(current.rows[0].log_weight ?? 0);

    const newCount = prevCount + 1;
    const newBrier = (prevBrier * prevCount + brierContrib) / newCount;
    const newLogWeight = prevLogWeight + logLikelihood;

    await db.execute({
      sql: `UPDATE forecast_strategies SET brier_score = ?, brier_count = ?, log_weight = ? WHERE id = ?`,
      args: [newBrier, newCount, newLogWeight, strategyId],
    });
  }
}

export async function retireUnderperformers(): Promise<number> {
  const result = await db.execute({
    sql: `UPDATE forecast_strategies SET is_active = 0
          WHERE is_active = 1 AND brier_score > ? AND brier_count >= ?`,
    args: [RETIRE_BRIER_THRESHOLD, RETIRE_MIN_FORECASTS],
  });
  return result.rowsAffected;
}

export async function getStrategyLeaderboard(): Promise<StrategyScore[]> {
  const result = await db.execute(
    `SELECT id, name, strategy_type, brier_score, brier_count, log_weight, is_active
     FROM forecast_strategies
     ORDER BY CASE WHEN brier_score IS NULL THEN 1 ELSE 0 END, brier_score ASC`,
  );

  const strategies = result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    const brierScore = row.brier_score != null ? Number(row.brier_score) : null;
    const brierCount = Number(row.brier_count ?? 0);
    const isActive = row.is_active === 1 || row.is_active === true;

    let weight = 0;
    if (isActive && brierScore != null && brierCount >= COLD_START_THRESHOLD) {
      weight = 1 / (brierScore + EPSILON);
    } else if (isActive) {
      weight = 1;
    }

    return {
      strategy_id: row.id as string,
      strategy_name: row.name as string,
      strategy_type: row.strategy_type as StrategyType,
      brier_score: brierScore,
      forecast_count: brierCount,
      weight,
      is_active: isActive,
    };
  });

  const totalWeight = strategies.filter((s) => s.is_active).reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight > 0) {
    for (const s of strategies) {
      if (s.is_active) s.weight = Math.round((s.weight / totalWeight) * 1000) / 1000;
    }
  }

  return strategies;
}
