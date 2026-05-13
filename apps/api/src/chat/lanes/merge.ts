import { db } from '../../db/client';
import type { QueryPlan } from '../planner';
import type { RetrievalSource, ScoredEvent, RankedEvent } from './types';

const BASE_WEIGHTS: Record<QueryPlan['intent'], Record<RetrievalSource, number>> = {
  lookup:       { entity: 0.7, fts: 0.5, concept: 0.4, sql: 0.25, vector: 0.1, stats: 0, graph: 0.35, community: 0.3, text_to_sql: 0.4 },
  trend:        { entity: 0.2, fts: 0.15, concept: 0.2, sql: 0.5, vector: 0.1, stats: 0, graph: 0.1, community: 0.1, text_to_sql: 0.45 },
  status_check: { entity: 0.6, fts: 0.3, concept: 0.2, sql: 0.4, vector: 0.15, stats: 0, graph: 0.2, community: 0.2, text_to_sql: 0.35 },
  comparison:   { entity: 0.3, fts: 0.2, concept: 0.2, sql: 0.6, vector: 0.1, stats: 0, graph: 0.15, community: 0.1, text_to_sql: 0.5 },
  anomaly:      { entity: 0.5, fts: 0.2, concept: 0.3, sql: 0.5, vector: 0.15, stats: 0, graph: 0.25, community: 0.2, text_to_sql: 0.4 },
  narrative:       { entity: 0.55, fts: 0.4, concept: 0.4, sql: 0.25, vector: 0.3, stats: 0, graph: 0.5, community: 0.5, text_to_sql: 0.2 },
  counterfactual:  { entity: 0.6, fts: 0.3, concept: 0.3, sql: 0.5, vector: 0.15, stats: 0, graph: 0.4, community: 0.3, text_to_sql: 0.35 },
};

const WEIGHT_CACHE_TTL = 5 * 60 * 1000;
const EXPLORATION_RATE = 0.1;

let weightCache: {
  weights: Record<QueryPlan['intent'], Record<RetrievalSource, number>>;
  fetchedAt: number;
} | null = null;

async function loadBanditWeights(workspaceId: string = ''): Promise<Record<QueryPlan['intent'], Record<RetrievalSource, number>> | null> {
  if (weightCache && Date.now() - weightCache.fetchedAt < WEIGHT_CACHE_TTL) {
    return weightCache.weights;
  }

  try {
    const wsAnd = workspaceId ? ' WHERE workspace_id = ?' : '';
    const result = await db.execute({
      sql: `SELECT weights FROM retrieval_weight_versions${wsAnd} ORDER BY version DESC LIMIT 1`,
      args: workspaceId ? [workspaceId] : [],
    });
    if (result.rows.length === 0) return null;

    const weights = JSON.parse(result.rows[0].weights as string);
    weightCache = { weights, fetchedAt: Date.now() };
    return weights;
  } catch {
    return null;
  }
}

export async function getActiveWeights(workspaceId: string = ''): Promise<{
  weights: Record<QueryPlan['intent'], Record<RetrievalSource, number>>;
  exploring: boolean;
}> {
  if (Math.random() < EXPLORATION_RATE) {
    return { weights: BASE_WEIGHTS, exploring: true };
  }

  const bandit = await loadBanditWeights(workspaceId);
  if (bandit) {
    return { weights: bandit, exploring: false };
  }

  return { weights: BASE_WEIGHTS, exploring: false };
}

export function mergeAndRank(
  lanes: Array<Array<ScoredEvent & { concepts?: string[]; entity_names?: string[] }>>,
  plan: QueryPlan,
  intentWeights?: Record<QueryPlan['intent'], Record<RetrievalSource, number>>,
): RankedEvent[] {
  const weights = intentWeights ?? BASE_WEIGHTS;
  const best = new Map<string, RankedEvent>();

  for (const lane of lanes) {
    for (const event of lane) {
      const existing = best.get(event.id);
      const laneWeight = weights[plan.intent][event.source];
      const scored: RankedEvent = {
        ...event,
        score: event.score + laneWeight,
        lanes: existing ? Array.from(new Set([...existing.lanes, event.source])) : [event.source],
        concepts: Array.from(new Set([...(existing?.concepts ?? []), ...(event.concepts ?? [])])),
        entity_names: Array.from(new Set([...(existing?.entity_names ?? []), ...(event.entity_names ?? [])])),
      };
      if (!existing || scored.score > existing.score) {
        best.set(event.id, scored);
      } else {
        existing.lanes = scored.lanes;
        existing.concepts = scored.concepts;
        existing.entity_names = scored.entity_names;
      }
    }
  }

  const ranked = Array.from(best.values()).map((event) => {
    let bonus = 0;
    if (plan.providerFilters.some((p) => event.provider_type === p)) bonus += 0.3;
    if (plan.entityHints.some((e) => event.entity_type === e)) bonus += 0.3;
    if (event.lanes.includes('entity')) bonus += 0.45;
    if (event.lanes.includes('concept')) bonus += 0.3;
    if (event.lanes.includes('graph')) bonus += 0.35;
    if (event.quality === 'complete') bonus += 0.25;
    if (event.quality === 'partial') bonus += 0.1;
    if (plan.timeWindow) {
      const eventTime = new Date(event.occurred_at).getTime();
      const windowEnd = new Date(plan.timeWindow.to).getTime();
      if (eventTime >= windowEnd - 86400000) bonus += 0.2;
    }
    return { ...event, score: event.score + bonus };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, 25);
}
