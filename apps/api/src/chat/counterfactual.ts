import { db } from '../db/client';
import type { CounterfactualScenario } from './planner';

export type AffectedEntity = {
  series: string;
  direction: 'increase' | 'decrease' | 'unchanged';
  magnitude: number;
  probability: number;
  lagDays: number;
  hopDistance: number;
};

export type CausalStep = {
  cause: string;
  effect: string;
  lagDays: number;
  pValue: number;
  coefficient: number;
};

export type CounterfactualResult = {
  scenario: string;
  interventionEntity: string;
  affectedEntities: AffectedEntity[];
  causalChain: CausalStep[];
  confidence: 'high' | 'medium' | 'low';
  sampleSize: number;
  distribution: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
};

type CausalEdge = {
  causeSeries: string;
  effectSeries: string;
  lagDays: number;
  pValue: number;
  direction: string | null;
};

const MAX_HOPS = 3;
const MONTE_CARLO_SAMPLES = 500;

async function loadCausalGraph(workspaceId: string = ''): Promise<CausalEdge[]> {
  const wsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT cause_series, effect_series, lag_days, p_value, direction
     FROM causal_links
     WHERE superseded_at IS NULL AND p_value < 0.05${wsAnd}
     ORDER BY p_value ASC`,
    args: workspaceId ? [workspaceId] : [],
  });

  return result.rows.map((r) => ({
    causeSeries: r.cause_series as string,
    effectSeries: r.effect_series as string,
    lagDays: r.lag_days as number,
    pValue: r.p_value as number,
    direction: r.direction as string | null,
  }));
}

function buildAdjacency(edges: CausalEdge[]): Map<string, CausalEdge[]> {
  const adj = new Map<string, CausalEdge[]>();
  for (const edge of edges) {
    const existing = adj.get(edge.causeSeries) ?? [];
    existing.push(edge);
    adj.set(edge.causeSeries, existing);
  }
  return adj;
}

async function resolveEntitySeries(entityHint: string, workspaceId: string = ''): Promise<string[]> {
  const wsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT DISTINCT series_key FROM event_counts_daily
          WHERE (series_key LIKE ? OR series_key LIKE ?)${wsAnd}
          LIMIT 10`,
    args: workspaceId
      ? [`%${entityHint.toLowerCase()}%`, `%${entityHint}%`, workspaceId]
      : [`%${entityHint.toLowerCase()}%`, `%${entityHint}%`],
  });

  if (result.rows.length > 0) {
    return result.rows.map((r) => r.series_key as string);
  }

  const wsEntAnd = workspaceId ? ' AND e.workspace_id = ?' : '';
  const entityResult = await db.execute({
    sql: `SELECT DISTINCT e.id FROM entities e
          WHERE LOWER(e.canonical_name) LIKE ?${wsEntAnd}
          LIMIT 5`,
    args: workspaceId
      ? [`%${entityHint.toLowerCase()}%`, workspaceId]
      : [`%${entityHint.toLowerCase()}%`],
  });

  if (entityResult.rows.length > 0) {
    const entityIds = entityResult.rows.map((r) => r.id as string);
    const seriesArgs = entityIds.map((id) => `%${id}%`);
    if (workspaceId) seriesArgs.push(workspaceId);
    const seriesResult = await db.execute({
      sql: `SELECT DISTINCT series_key FROM event_counts_daily
            WHERE (${entityIds.map(() => 'series_key LIKE ?').join(' OR ')})${wsAnd}
            LIMIT 10`,
      args: seriesArgs,
    });
    return seriesResult.rows.map((r) => r.series_key as string);
  }

  return [];
}

async function estimateCoefficient(
  causeSeries: string,
  effectSeries: string,
  lagDays: number,
  workspaceId: string = '',
): Promise<{ coefficient: number; variance: number; sampleSize: number }> {
  const wsAnd = workspaceId ? ' AND ec1.workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT ec1.cnt AS cause_cnt, ec2.cnt AS effect_cnt
          FROM event_counts_daily ec1
          JOIN event_counts_daily ec2
            ON ec2.series_key = ? AND ec2.day = date(ec1.day, '+' || ? || ' days')
          WHERE ec1.series_key = ?${wsAnd}
          ORDER BY ec1.day ASC`,
    args: workspaceId
      ? [effectSeries, lagDays, causeSeries, workspaceId]
      : [effectSeries, lagDays, causeSeries],
  });

  if (result.rows.length < 10) {
    return { coefficient: 0, variance: 1, sampleSize: result.rows.length };
  }

  const causeVals = result.rows.map((r) => Number(r.cause_cnt));
  const effectVals = result.rows.map((r) => Number(r.effect_cnt));
  const n = causeVals.length;

  const causeMean = causeVals.reduce((s, v) => s + v, 0) / n;
  const effectMean = effectVals.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let causeVar = 0;
  let residualSS = 0;

  for (let i = 0; i < n; i++) {
    const cd = causeVals[i] - causeMean;
    const ed = effectVals[i] - effectMean;
    cov += cd * ed;
    causeVar += cd * cd;
  }

  const coefficient = causeVar > 0 ? cov / causeVar : 0;

  for (let i = 0; i < n; i++) {
    const predicted = effectMean + coefficient * (causeVals[i] - causeMean);
    const residual = effectVals[i] - predicted;
    residualSS += residual * residual;
  }

  const variance = n > 2 ? residualSS / (n - 2) : 1;

  return { coefficient, variance, sampleSize: n };
}

function propagateStructural(
  startSeries: string[],
  adj: Map<string, CausalEdge[]>,
  coefficients: Map<string, { coefficient: number; variance: number; sampleSize: number }>,
  mutationDirection: number,
): { affected: AffectedEntity[]; chain: CausalStep[] } {
  const affected: AffectedEntity[] = [];
  const chain: CausalStep[] = [];
  const visited = new Set<string>(startSeries);

  type QueueItem = { series: string; magnitude: number; hop: number };
  const queue: QueueItem[] = startSeries.map((s) => ({ series: s, magnitude: mutationDirection, hop: 0 }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.hop >= MAX_HOPS) continue;

    const edges = adj.get(current.series) ?? [];
    for (const edge of edges) {
      if (visited.has(edge.effectSeries)) continue;
      visited.add(edge.effectSeries);

      const key = `${edge.causeSeries}→${edge.effectSeries}`;
      const coef = coefficients.get(key);
      if (!coef || coef.sampleSize < 10) continue;

      const effectMagnitude = current.magnitude * coef.coefficient;
      const direction: AffectedEntity['direction'] =
        effectMagnitude > 0.01 ? 'increase' : effectMagnitude < -0.01 ? 'decrease' : 'unchanged';

      const absMag = Math.abs(effectMagnitude);
      const pFromSample = Math.min(1, Math.max(0, 1 - edge.pValue));

      affected.push({
        series: edge.effectSeries,
        direction,
        magnitude: absMag,
        probability: pFromSample * Math.pow(0.85, current.hop + 1),
        lagDays: edge.lagDays,
        hopDistance: current.hop + 1,
      });

      chain.push({
        cause: edge.causeSeries,
        effect: edge.effectSeries,
        lagDays: edge.lagDays,
        pValue: edge.pValue,
        coefficient: coef.coefficient,
      });

      queue.push({
        series: edge.effectSeries,
        magnitude: effectMagnitude,
        hop: current.hop + 1,
      });
    }
  }

  return { affected, chain };
}

function monteCarloDistribution(
  chain: CausalStep[],
  coefficients: Map<string, { coefficient: number; variance: number; sampleSize: number }>,
  mutationMagnitude: number,
): { p10: number; p25: number; p50: number; p75: number; p90: number } | null {
  if (chain.length === 0) return null;

  const lastStep = chain[chain.length - 1];
  const key = `${lastStep.cause}→${lastStep.effect}`;
  const coef = coefficients.get(key);
  if (!coef) return null;

  const samples: number[] = [];

  for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
    let propagated = mutationMagnitude;
    for (const step of chain) {
      const stepKey = `${step.cause}→${step.effect}`;
      const stepCoef = coefficients.get(stepKey);
      if (!stepCoef) break;
      const noise = normalRandom() * Math.sqrt(stepCoef.variance);
      propagated = propagated * stepCoef.coefficient + noise;
    }
    samples.push(propagated);
  }

  samples.sort((a, b) => a - b);

  const percentile = (p: number) => samples[Math.floor(p * samples.length)] ?? 0;

  return {
    p10: percentile(0.1),
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
  };
}

function normalRandom(): number {
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

function inferMutationDirection(mutation: string): number {
  const lower = mutation.toLowerCase();
  const negativePatterns = ['silent', 'gone', 'stop', 'zero', 'no activity', 'disappear', 'leave', 'cancel', 'churn', 'lost', 'inactive', 'absent', 'removed', 'deleted'];
  const positivePatterns = ['double', 'increase', 'spike', 'surge', 'grow', 'more', 'add', 'new', 'expand', 'boost', 'triple'];

  for (const p of negativePatterns) {
    if (lower.includes(p)) return -1;
  }
  for (const p of positivePatterns) {
    if (lower.includes(p)) return 1;
  }
  return -1;
}

export async function runCounterfactual(scenario: CounterfactualScenario, workspaceId: string = ''): Promise<CounterfactualResult> {
  const [edges, matchedSeries] = await Promise.all([
    loadCausalGraph(workspaceId),
    resolveEntitySeries(scenario.entity, workspaceId),
  ]);

  if (edges.length === 0) {
    return {
      scenario: `${scenario.mutation} for ${scenario.entity}`,
      interventionEntity: scenario.entity,
      affectedEntities: [],
      causalChain: [],
      confidence: 'low',
      sampleSize: 0,
      distribution: null,
    };
  }

  const adj = buildAdjacency(edges);
  const mutationDirection = inferMutationDirection(scenario.mutation);

  const startSeries = matchedSeries.length > 0
    ? matchedSeries
    : edges
        .filter((e) => e.causeSeries.toLowerCase().includes(scenario.entity.toLowerCase()))
        .map((e) => e.causeSeries)
        .filter((v, i, arr) => arr.indexOf(v) === i);

  if (startSeries.length === 0) {
    const allSeries = new Set<string>();
    for (const e of edges) {
      allSeries.add(e.causeSeries);
      allSeries.add(e.effectSeries);
    }
    const fuzzyMatch = [...allSeries].find((s) => s.toLowerCase().includes(scenario.entity.toLowerCase()));
    if (fuzzyMatch) startSeries.push(fuzzyMatch);
  }

  const relevantEdges = new Set<string>();
  const queue = [...startSeries];
  const visited = new Set<string>(startSeries);
  let depth = 0;
  while (queue.length > 0 && depth < MAX_HOPS) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const node = queue.shift()!;
      const downstream = adj.get(node) ?? [];
      for (const edge of downstream) {
        relevantEdges.add(`${edge.causeSeries}→${edge.effectSeries}`);
        if (!visited.has(edge.effectSeries)) {
          visited.add(edge.effectSeries);
          queue.push(edge.effectSeries);
        }
      }
    }
    depth++;
  }

  const coefficients = new Map<string, { coefficient: number; variance: number; sampleSize: number }>();
  const relevantEdgeList = edges.filter((e) => relevantEdges.has(`${e.causeSeries}→${e.effectSeries}`));

  const coeffPromises = relevantEdgeList.map(async (edge) => {
    const coef = await estimateCoefficient(edge.causeSeries, edge.effectSeries, edge.lagDays, workspaceId);
    coefficients.set(`${edge.causeSeries}→${edge.effectSeries}`, coef);
  });
  await Promise.all(coeffPromises);

  const { affected, chain } = propagateStructural(startSeries, adj, coefficients, mutationDirection);

  const distribution = monteCarloDistribution(chain, coefficients, mutationDirection);

  const totalSamples = [...coefficients.values()].reduce((s, c) => s + c.sampleSize, 0);
  const avgPValue = chain.length > 0
    ? chain.reduce((s, c) => s + c.pValue, 0) / chain.length
    : 1;

  const confidence: CounterfactualResult['confidence'] =
    chain.length >= 2 && avgPValue < 0.01 && totalSamples > 100 ? 'high'
    : chain.length >= 1 && avgPValue < 0.05 && totalSamples > 50 ? 'medium'
    : 'low';

  return {
    scenario: `${scenario.mutation} for ${scenario.entity}`,
    interventionEntity: scenario.entity,
    affectedEntities: affected.sort((a, b) => b.probability - a.probability),
    causalChain: chain,
    confidence,
    sampleSize: totalSamples,
    distribution,
  };
}
