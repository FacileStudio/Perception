import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { buildQueryPlan } from '../chat/planner';
import { embedQuery } from '../embeddings/voyage';
import { retrieveWithCorrection } from '../chat/retrieve';

type EvalFixture = {
  id: string;
  question: string;
  expectedEventIds: string[];
  expectedLanes: string[];
  intent: string;
};

type FixtureResult = {
  fixtureId: string;
  retrievedEventIds: string[];
  retrievedLanes: string[];
  precision: number;
  recall: number;
  reciprocalRank: number;
  score: number;
};

type RunResult = {
  id: string;
  ranAt: string;
  fixtureCount: number;
  precisionAt5: number;
  recallAt5: number;
  mrr: number;
  laneHitRates: Record<string, number>;
  durationMs: number;
  regressionDetected: boolean;
  results: FixtureResult[];
};

function computePrecision(retrieved: string[], expected: Set<string>, k: number): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((id) => expected.has(id)).length;
  return hits / topK.length;
}

function computeRecall(retrieved: string[], expected: Set<string>, k: number): number {
  if (expected.size === 0) return 1;
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => expected.has(id)).length;
  return hits / expected.size;
}

function computeReciprocalRank(retrieved: string[], expected: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

async function loadFixtures(workspaceId: string = ''): Promise<EvalFixture[]> {
  const wsFilter = workspaceId ? ' WHERE workspace_id = ?' : '';
  const args: (string | number | null)[] = [];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT id, question, expected_event_ids, expected_lanes, intent FROM eval_fixtures${wsFilter} ORDER BY created_at`,
    args,
  });
  return result.rows.map((r) => ({
    id: r.id as string,
    question: r.question as string,
    expectedEventIds: JSON.parse(r.expected_event_ids as string) as string[],
    expectedLanes: JSON.parse(r.expected_lanes as string) as string[],
    intent: r.intent as string,
  }));
}

async function evaluateFixture(fixture: EvalFixture): Promise<FixtureResult> {
  const plan = await buildQueryPlan(fixture.question);
  const queryEmbedding = await embedQuery(fixture.question);
  const result = await retrieveWithCorrection(plan, queryEmbedding);

  const retrievedIds = result.events.map((e) => e.id);
  const retrievedLanes = Array.from(new Set(result.events.flatMap((e) => e.lanes)));
  const expected = new Set(fixture.expectedEventIds);

  const precision = computePrecision(retrievedIds, expected, 5);
  const recall = computeRecall(retrievedIds, expected, 5);
  const reciprocalRank = computeReciprocalRank(retrievedIds, expected);
  const score = (precision + recall + reciprocalRank) / 3;

  return {
    fixtureId: fixture.id,
    retrievedEventIds: retrievedIds.slice(0, 25),
    retrievedLanes,
    precision,
    recall,
    reciprocalRank,
    score,
  };
}

async function checkRegression(currentScore: number, workspaceId: string = ''): Promise<boolean> {
  const wsFilter = workspaceId ? ' WHERE workspace_id = ?' : '';
  const args: (string | number | null)[] = [];
  if (workspaceId) args.push(workspaceId);
  const prev = await db.execute({
    sql: `SELECT precision_at_5, recall_at_5, mrr FROM eval_runs${wsFilter} ORDER BY ran_at DESC LIMIT 1`,
    args,
  });
  if (prev.rows.length === 0) return false;

  const lastPrecision = prev.rows[0].precision_at_5 as number;
  const lastRecall = prev.rows[0].recall_at_5 as number;
  const lastMrr = prev.rows[0].mrr as number;
  const lastAvg = (lastPrecision + lastRecall + lastMrr) / 3;

  return currentScore < lastAvg - 0.05;
}

export async function runEvaluation(workspaceId: string = ''): Promise<RunResult> {
  const fixtures = await loadFixtures(workspaceId);
  if (fixtures.length === 0) {
    throw new Error('No eval fixtures found');
  }

  const startTime = Date.now();
  const results: FixtureResult[] = [];

  for (const fixture of fixtures) {
    try {
      const result = await evaluateFixture(fixture);
      results.push(result);
    } catch {
      results.push({
        fixtureId: fixture.id,
        retrievedEventIds: [],
        retrievedLanes: [],
        precision: 0,
        recall: 0,
        reciprocalRank: 0,
        score: 0,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  const precisionAt5 = results.reduce((sum, r) => sum + r.precision, 0) / results.length;
  const recallAt5 = results.reduce((sum, r) => sum + r.recall, 0) / results.length;
  const mrr = results.reduce((sum, r) => sum + r.reciprocalRank, 0) / results.length;

  const laneHitCounts: Record<string, number> = {};
  const laneTotalCounts: Record<string, number> = {};
  for (const result of results) {
    const fixture = fixtures.find((f) => f.id === result.fixtureId)!;
    for (const lane of fixture.expectedLanes) {
      laneTotalCounts[lane] = (laneTotalCounts[lane] ?? 0) + 1;
      if (result.retrievedLanes.includes(lane)) {
        laneHitCounts[lane] = (laneHitCounts[lane] ?? 0) + 1;
      }
    }
  }

  const laneHitRates: Record<string, number> = {};
  for (const [lane, total] of Object.entries(laneTotalCounts)) {
    laneHitRates[lane] = (laneHitCounts[lane] ?? 0) / total;
  }

  const avgScore = (precisionAt5 + recallAt5 + mrr) / 3;
  const regressionDetected = await checkRegression(avgScore, workspaceId);

  const runId = randomUUID();
  const ranAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO eval_runs (id, ran_at, fixture_count, precision_at_5, recall_at_5, mrr, lane_hit_rates, duration_ms, regression_detected, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [runId, ranAt, fixtures.length, precisionAt5, recallAt5, mrr, JSON.stringify(laneHitRates), durationMs, regressionDetected ? 1 : 0, workspaceId],
  });

  const resultStatements = results.map((r) => ({
    sql: `INSERT INTO eval_results (id, run_id, fixture_id, retrieved_event_ids, retrieved_lanes, precision_val, recall_val, reciprocal_rank, score, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), runId, r.fixtureId, JSON.stringify(r.retrievedEventIds), JSON.stringify(r.retrievedLanes), r.precision, r.recall, r.reciprocalRank, r.score, workspaceId],
  }));

  await db.batch(resultStatements);

  if (regressionDetected) {
    await db.execute({
      sql: `INSERT INTO notifications (id, type, severity, title, message, created_at, workspace_id) VALUES (?, 'eval_regression', 'warning', ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        'Retrieval quality regression detected',
        `Eval run scored P@5=${precisionAt5.toFixed(3)} R@5=${recallAt5.toFixed(3)} MRR=${mrr.toFixed(3)}, which is >5% below the previous run.`,
        ranAt,
        workspaceId,
      ],
    });
  }

  return {
    id: runId,
    ranAt,
    fixtureCount: fixtures.length,
    precisionAt5,
    recallAt5,
    mrr,
    laneHitRates,
    durationMs,
    regressionDetected,
    results,
  };
}
