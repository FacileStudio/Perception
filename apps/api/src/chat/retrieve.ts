import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { InValue } from '@libsql/client';
import type { EventRow, StatsSnapshot } from '../types';
import type { QueryPlan } from './planner';
import { EVENT_LIST_ORDER_BY } from '../events/order';

export type TemporalComparison = {
  dimension: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

export type RetrievalResult = {
  events: Array<EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[]; period?: TemporalPeriod }>;
  stats: Array<StatsSnapshot & { period?: TemporalPeriod }>;
  comparisons: TemporalComparison[];
};

export type RetrievalSource = 'vector' | 'fts' | 'sql' | 'stats' | 'entity' | 'concept' | 'graph';

async function vectorLane(queryEmbedding: number[]): Promise<Array<EventRow & { score: number; source: 'vector' }>> {
  try {
    const vecJson = JSON.stringify(queryEmbedding);
    const result = await db.execute({
      sql: `SELECT e.*, v.distance AS score FROM vector_top_k('event_embeddings_vector_idx', vector32(?), 40) v JOIN event_embeddings ee ON ee.rowid = v.id JOIN events e ON e.id = ee.event_id WHERE ee.status = 'ready'`,
      args: [vecJson],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? Math.max(0, 1 - r.score) : 0,
      source: 'vector' as const,
    }));
  } catch {
    return [];
  }
}

async function ftsLane(queryTerms: string[]): Promise<Array<EventRow & { score: number; source: 'fts' }>> {
  if (queryTerms.length === 0) return [];
  try {
    const ftsQuery = queryTerms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const result = await db.execute({
      sql: `SELECT e.*, rank AS score FROM event_fts JOIN events e ON e.rowid = event_fts.rowid WHERE event_fts MATCH ? LIMIT 20`,
      args: [ftsQuery],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? Math.min(2, Math.abs(r.score)) : 0,
      source: 'fts' as const,
    }));
  } catch {
    return [];
  }
}

export type TemporalPeriod = 'current' | 'previous';

function buildSqlConditions(plan: QueryPlan, window: { from: string; to: string } | null): { where: string; args: InValue[] } {
  const conditions: string[] = ['1=1'];
  const args: InValue[] = [];

  if (plan.providerFilters.length > 0) {
    const placeholders = plan.providerFilters.map(() => '?').join(',');
    conditions.push(`provider_type IN (${placeholders})`);
    args.push(...plan.providerFilters);
  }

  if (plan.entityHints.length > 0) {
    const placeholders = plan.entityHints.map(() => '?').join(',');
    conditions.push(`entity_type IN (${placeholders})`);
    args.push(...plan.entityHints);
  }

  if (window) {
    conditions.push(`occurred_at >= ? AND occurred_at <= ?`);
    args.push(window.from, window.to);
  }

  return { where: conditions.join(' AND '), args };
}

async function sqlLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'sql'; period?: TemporalPeriod }>> {
  const { where, args } = buildSqlConditions(plan, plan.timeWindow);
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args,
  });

  const currentEvents = result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.5,
    source: 'sql' as const,
    ...(plan.compareWindow ? { period: 'current' as TemporalPeriod } : {}),
  }));

  if (!plan.compareWindow) return currentEvents;

  const prev = buildSqlConditions(plan, plan.compareWindow);
  const prevResult = await db.execute({
    sql: `SELECT * FROM events WHERE ${prev.where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args: prev.args,
  });

  const previousEvents = prevResult.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.35,
    source: 'sql' as const,
    period: 'previous' as TemporalPeriod,
  }));

  return [...currentEvents, ...previousEvents];
}

async function recentLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'sql' }>> {
  const conditions: string[] = ['1=1'];
  const args: InValue[] = [];

  if (plan.providerFilters.length > 0) {
    const placeholders = plan.providerFilters.map(() => '?').join(',');
    conditions.push(`provider_type IN (${placeholders})`);
    args.push(...plan.providerFilters);
  }

  if (plan.entityHints.length > 0) {
    const placeholders = plan.entityHints.map(() => '?').join(',');
    conditions.push(`entity_type IN (${placeholders})`);
    args.push(...plan.entityHints);
  }

  if (plan.timeWindow) {
    conditions.push(`occurred_at >= ? AND occurred_at <= ?`);
    args.push(plan.timeWindow.from, plan.timeWindow.to);
  }

  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args,
  });

  return result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.1,
    source: 'sql' as const,
  }));
}

async function entityLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'entity'; entity_names: string[] }>> {
  if (plan.queryTerms.length === 0) return [];

  const aliasClauses = plan.queryTerms.map(() => 'ea.alias_value LIKE ?').join(' OR ');
  const nameClauses = plan.queryTerms.map(() => 'lower(ent.canonical_name) LIKE ?').join(' OR ');
  const args = [
    ...plan.queryTerms.map((term) => `%${term.replace(/_/g, ' ')}%`),
    ...plan.queryTerms.map((term) => `%${term.replace(/_/g, ' ')}%`),
  ];

  try {
    const result = await db.execute({
      sql: `SELECT e.*, ent.canonical_name AS matched_entity_name, max(coalesce(ea.confidence, 0), ee.confidence) AS match_score
        FROM entities ent
        JOIN event_entities ee ON ee.entity_id = ent.id
        JOIN events e ON e.id = ee.event_id
        LEFT JOIN entity_aliases ea ON ea.entity_id = ent.id
        WHERE (${aliasClauses}) OR (${nameClauses})
        GROUP BY e.id
        ORDER BY match_score DESC, ${EVENT_LIST_ORDER_BY}
        LIMIT 30`,
      args,
    });

    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.match_score === 'number' ? r.match_score : 0.75,
      source: 'entity' as const,
      entity_names: typeof r.matched_entity_name === 'string' ? [r.matched_entity_name] : [],
    }));
  } catch {
    return [];
  }
}

async function graphLane(
  seedEntityIds: string[],
): Promise<Array<EventRow & { score: number; source: 'graph'; entity_names: string[] }>> {
  if (seedEntityIds.length === 0) return [];

  try {
    const placeholders = seedEntityIds.map(() => '?').join(',');
    const result = await db.execute({
      sql: `SELECT e.*, ent.canonical_name AS matched_entity_name,
              max(er.confidence) AS relation_confidence
            FROM entity_relations er
            JOIN event_entities ee ON ee.entity_id = er.to_entity_id
            JOIN events e ON e.id = ee.event_id
            JOIN entities ent ON ent.id = er.to_entity_id
            WHERE er.from_entity_id IN (${placeholders})
              AND er.to_entity_id NOT IN (${placeholders})
            GROUP BY e.id
            ORDER BY relation_confidence DESC, ${EVENT_LIST_ORDER_BY}
            LIMIT 20`,
      args: [...seedEntityIds, ...seedEntityIds],
    });

    return result.rows.map((r) => {
      const relConf = typeof r.relation_confidence === 'number' ? r.relation_confidence : 0.5;
      return {
        ...rowToEvent(r as unknown as Record<string, unknown>),
        score: relConf,
        source: 'graph' as const,
        entity_names: typeof r.matched_entity_name === 'string' ? [r.matched_entity_name] : [],
      };
    });
  } catch {
    return [];
  }
}

async function conceptLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'concept'; concepts: string[] }>> {
  const conditions: string[] = [];
  const args: InValue[] = [];

  if (plan.capabilities.length > 0) {
    for (const capability of plan.capabilities) {
      conditions.push('oc.capabilities_json LIKE ?');
      args.push(`%"${capability}"%`);
    }
  }

  if (plan.queryTerms.length > 0) {
    for (const term of plan.queryTerms) {
      conditions.push('(oc.label LIKE ? OR oca.alias LIKE ?)');
      args.push(`%${term}%`, `%${term}%`);
    }
  }

  if (conditions.length === 0) return [];

  try {
    const result = await db.execute({
      sql: `SELECT e.*, group_concat(DISTINCT oc.label) AS matched_concepts, max(ec.confidence + oc.confidence) AS match_score
        FROM event_concepts ec
        JOIN ontology_concepts oc ON oc.id = ec.concept_id
        LEFT JOIN ontology_concept_aliases oca ON oca.concept_id = oc.id
        JOIN events e ON e.id = ec.event_id
        WHERE (${conditions.join(' OR ')}) AND oc.state != 'rejected'
        GROUP BY e.id
        ORDER BY match_score DESC, ${EVENT_LIST_ORDER_BY}
        LIMIT 30`,
      args,
    });

    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.match_score === 'number' ? r.match_score / 2 : 0.7,
      source: 'concept' as const,
      concepts: typeof r.matched_concepts === 'string' ? r.matched_concepts.split(',') : [],
    }));
  } catch {
    return [];
  }
}

export type AnnotatedStatsSnapshot = StatsSnapshot & { period?: TemporalPeriod };

async function statsLane(plan: QueryPlan): Promise<AnnotatedStatsSnapshot[]> {
  const mapRow = (r: Record<string, unknown>): StatsSnapshot => ({
    id: r.id as string,
    kind: r.kind as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    generated_at: r.generated_at as string,
    source_count: r.source_count as number,
    min_sample_met: Boolean(r.min_sample_met),
    data: JSON.parse(r.data_json as string) as Record<string, unknown>,
  });

  if (plan.compareWindow && plan.timeWindow) {
    const [currentResult, previousResult] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM stats_snapshots WHERE window_end >= ? AND window_start <= ? ORDER BY generated_at DESC LIMIT 5`,
        args: [plan.timeWindow.from, plan.timeWindow.to],
      }),
      db.execute({
        sql: `SELECT * FROM stats_snapshots WHERE window_end >= ? AND window_start <= ? ORDER BY generated_at DESC LIMIT 5`,
        args: [plan.compareWindow.from, plan.compareWindow.to],
      }),
    ]);

    return [
      ...currentResult.rows.map((r) => ({ ...mapRow(r as unknown as Record<string, unknown>), period: 'current' as TemporalPeriod })),
      ...previousResult.rows.map((r) => ({ ...mapRow(r as unknown as Record<string, unknown>), period: 'previous' as TemporalPeriod })),
    ];
  }

  const result = await db.execute({
    sql: `SELECT * FROM stats_snapshots ORDER BY generated_at DESC LIMIT 5`,
    args: [],
  });
  return result.rows.map((r) => mapRow(r as unknown as Record<string, unknown>));
}

const INTENT_WEIGHTS: Record<QueryPlan['intent'], Record<RetrievalSource, number>> = {
  lookup:       { entity: 0.7, fts: 0.5, concept: 0.4, sql: 0.25, vector: 0.1, stats: 0, graph: 0.35 },
  trend:        { entity: 0.2, fts: 0.15, concept: 0.2, sql: 0.5, vector: 0.1, stats: 0, graph: 0.1 },
  status_check: { entity: 0.6, fts: 0.3, concept: 0.2, sql: 0.4, vector: 0.15, stats: 0, graph: 0.2 },
  comparison:   { entity: 0.3, fts: 0.2, concept: 0.2, sql: 0.6, vector: 0.1, stats: 0, graph: 0.15 },
  anomaly:      { entity: 0.5, fts: 0.2, concept: 0.3, sql: 0.5, vector: 0.15, stats: 0, graph: 0.25 },
  narrative:    { entity: 0.55, fts: 0.4, concept: 0.4, sql: 0.25, vector: 0.3, stats: 0, graph: 0.5 },
};

function mergeAndRank(
  lanes: Array<Array<EventRow & { score: number; source: RetrievalSource; concepts?: string[]; entity_names?: string[] }>>,
  plan: QueryPlan,
): Array<EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[] }> {
  const best = new Map<string, EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[] }>();

  for (const lane of lanes) {
    for (const event of lane) {
      const existing = best.get(event.id);
      const laneWeight = INTENT_WEIGHTS[plan.intent][event.source];
      const scored = {
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

export type ContextConfidence = {
  score: number;
  verdict: 'correct' | 'ambiguous' | 'incorrect';
  details: {
    qualityScore: number;
    scoreSpread: number;
    laneDiversity: number;
    entityCoverage: number;
    eventCount: number;
  };
};

const CONFIDENCE_CORRECT = 0.6;
const CONFIDENCE_AMBIGUOUS = 0.35;

export function scoreContextQuality(result: RetrievalResult, plan: QueryPlan): ContextConfidence {
  const events = result.events;
  const eventCount = events.length;

  if (eventCount === 0) {
    return {
      score: 0,
      verdict: 'incorrect',
      details: { qualityScore: 0, scoreSpread: 0, laneDiversity: 0, entityCoverage: 0, eventCount: 0 },
    };
  }

  const qualityMap = { complete: 1, partial: 0.6, degraded: 0.2 };
  const qualityScore = events.reduce((sum, e) => sum + (qualityMap[e.quality] ?? 0.2), 0) / eventCount;

  const scores = events.map((e) => e.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreSpread = maxScore > 0 ? 1 - (maxScore - minScore) / maxScore : 0;

  const allLanes = new Set<string>();
  for (const e of events) {
    if ('lanes' in e && Array.isArray(e.lanes)) {
      for (const l of e.lanes) allLanes.add(l);
    }
  }
  const activeLaneCount = allLanes.size;
  const expectedLanes = plan.intent === 'trend' ? 2 : plan.intent === 'lookup' ? 3 : 4;
  const laneDiversity = Math.min(1, activeLaneCount / expectedLanes);

  const hintCount = plan.entityHints.length + plan.providerFilters.length;
  let entityCoverage = 1;
  if (hintCount > 0) {
    const matchedHints = new Set<string>();
    for (const e of events) {
      if (plan.providerFilters.includes(e.provider_type)) matchedHints.add(e.provider_type);
      if (plan.entityHints.includes(e.entity_type)) matchedHints.add(e.entity_type);
    }
    entityCoverage = matchedHints.size / hintCount;
  }

  const countBonus = Math.min(1, eventCount / 5);

  const score =
    qualityScore * 0.25 +
    scoreSpread * 0.1 +
    laneDiversity * 0.25 +
    entityCoverage * 0.25 +
    countBonus * 0.15;

  const verdict: ContextConfidence['verdict'] =
    score >= CONFIDENCE_CORRECT ? 'correct'
    : score >= CONFIDENCE_AMBIGUOUS ? 'ambiguous'
    : 'incorrect';

  return {
    score,
    verdict,
    details: { qualityScore, scoreSpread, laneDiversity, entityCoverage, eventCount },
  };
}

function relaxPlan(plan: QueryPlan): QueryPlan {
  const relaxed = { ...plan };

  relaxed.providerFilters = [];

  if (relaxed.timeWindow) {
    const from = new Date(relaxed.timeWindow.from);
    const to = new Date(relaxed.timeWindow.to);
    const span = to.getTime() - from.getTime();
    relaxed.timeWindow = {
      from: new Date(from.getTime() - span).toISOString(),
      to: relaxed.timeWindow.to,
    };
  }

  relaxed.requiresSqlFacts = true;

  return relaxed;
}

export async function retrieveWithCorrection(
  plan: QueryPlan,
  queryEmbedding: number[],
): Promise<RetrievalResult & { corrected: boolean; confidence: ContextConfidence }> {
  const initial = await retrieveContext(plan, queryEmbedding);
  const confidence = scoreContextQuality(initial, plan);

  if (confidence.verdict === 'correct') {
    return { ...initial, corrected: false, confidence };
  }

  const relaxed = relaxPlan(plan);
  const retry = await retrieveContext(relaxed, queryEmbedding);
  const retryConfidence = scoreContextQuality(retry, relaxed);

  if (retryConfidence.score > confidence.score) {
    return { ...retry, corrected: true, confidence: retryConfidence };
  }

  return { ...initial, corrected: false, confidence };
}

export async function fetchSystemSummary(): Promise<string> {
  const [eventsRow, entitiesRow, providers, entityTypes, eventCats] = await Promise.all([
    db.execute(`SELECT COUNT(*) AS total, MIN(occurred_at) AS oldest, MAX(occurred_at) AS newest FROM events`),
    db.execute(`SELECT COUNT(*) AS total FROM entities`),
    db.execute(`SELECT provider_name, COUNT(*) AS cnt FROM events GROUP BY provider_name ORDER BY cnt DESC LIMIT 10`),
    db.execute(`SELECT oc.label, COUNT(DISTINCT ec.event_id) AS cnt FROM ontology_concepts oc JOIN event_concepts ec ON ec.concept_id = oc.id WHERE oc.kind = 'entity_type' GROUP BY oc.label ORDER BY cnt DESC LIMIT 8`),
    db.execute(`SELECT oc.label, COUNT(DISTINCT ec.event_id) AS cnt FROM ontology_concepts oc JOIN event_concepts ec ON ec.concept_id = oc.id WHERE oc.kind = 'event_category' GROUP BY oc.label ORDER BY cnt DESC LIMIT 8`),
  ]);

  const total = eventsRow.rows[0]?.total ?? 0;
  const oldest = (eventsRow.rows[0]?.oldest as string | null)?.slice(0, 10) ?? '';
  const newest = (eventsRow.rows[0]?.newest as string | null)?.slice(0, 10) ?? '';
  const entityCount = entitiesRow.rows[0]?.total ?? 0;

  const providerList = providers.rows.map((r) => `${r.provider_name} (${r.cnt})`).join(', ') || 'none';
  const entityTypeList = entityTypes.rows.map((r) => `${r.label} (${r.cnt})`).join(', ') || 'none';
  const eventCatList = eventCats.rows.map((r) => `${r.label} (${r.cnt})`).join(', ') || 'none';

  return [
    `[KNOWLEDGE_BASE generated_at=${new Date().toISOString()} total_events=${total} total_entities=${entityCount} date_range=${oldest}/${newest}]`,
    `Providers: ${providerList}`,
    `Entity types: ${entityTypeList}`,
    `Event categories: ${eventCatList}`,
    `[/KNOWLEDGE_BASE]`,
  ].join('\n');
}

async function buildTemporalComparisons(plan: QueryPlan): Promise<TemporalComparison[]> {
  if (!plan.timeWindow || !plan.compareWindow) return [];

  const { where: curWhere, args: curArgs } = buildSqlConditions(plan, plan.timeWindow);
  const { where: prevWhere, args: prevArgs } = buildSqlConditions(plan, plan.compareWindow);

  const [curTotal, prevTotal, curByDim, prevByDim] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS cnt FROM events WHERE ${curWhere}`, args: curArgs }),
    db.execute({ sql: `SELECT COUNT(*) AS cnt FROM events WHERE ${prevWhere}`, args: prevArgs }),
    db.execute({
      sql: `SELECT provider_type, entity_type, event_type, COUNT(*) AS cnt FROM events WHERE ${curWhere} GROUP BY provider_type, entity_type, event_type`,
      args: curArgs,
    }),
    db.execute({
      sql: `SELECT provider_type, entity_type, event_type, COUNT(*) AS cnt FROM events WHERE ${prevWhere} GROUP BY provider_type, entity_type, event_type`,
      args: prevArgs,
    }),
  ]);

  const curCount = (curTotal.rows[0]?.cnt as number) ?? 0;
  const prevCount = (prevTotal.rows[0]?.cnt as number) ?? 0;

  const comparisons: TemporalComparison[] = [{
    dimension: 'total_events',
    current: curCount,
    previous: prevCount,
    delta: curCount - prevCount,
    deltaPercent: prevCount > 0 ? Math.round(((curCount - prevCount) / prevCount) * 100) : null,
  }];

  type DimKey = string;
  const curMap = new Map<DimKey, number>();
  const prevMap = new Map<DimKey, number>();

  for (const r of curByDim.rows) {
    const cnt = r.cnt as number;
    curMap.set(`provider:${r.provider_type}`, (curMap.get(`provider:${r.provider_type}`) ?? 0) + cnt);
    curMap.set(`entity:${r.entity_type}`, (curMap.get(`entity:${r.entity_type}`) ?? 0) + cnt);
    curMap.set(`event:${r.event_type}`, (curMap.get(`event:${r.event_type}`) ?? 0) + cnt);
  }
  for (const r of prevByDim.rows) {
    const cnt = r.cnt as number;
    prevMap.set(`provider:${r.provider_type}`, (prevMap.get(`provider:${r.provider_type}`) ?? 0) + cnt);
    prevMap.set(`entity:${r.entity_type}`, (prevMap.get(`entity:${r.entity_type}`) ?? 0) + cnt);
    prevMap.set(`event:${r.event_type}`, (prevMap.get(`event:${r.event_type}`) ?? 0) + cnt);
  }

  const allDims = new Set([...curMap.keys(), ...prevMap.keys()]);
  for (const dim of allDims) {
    const cur = curMap.get(dim) ?? 0;
    const prev = prevMap.get(dim) ?? 0;
    if (cur === 0 && prev === 0) continue;
    comparisons.push({
      dimension: dim,
      current: cur,
      previous: prev,
      delta: cur - prev,
      deltaPercent: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null,
    });
  }

  return comparisons;
}

export async function retrieveContext(plan: QueryPlan, queryEmbedding: number[]): Promise<RetrievalResult> {
  const intent = plan.intent;
  const prefersRecency = plan.prefersRecency || intent === 'status_check';
  const shouldRunRecentLane =
    (plan.retrievalMode === 'full' || plan.requiresSqlFacts || plan.requiresStats || prefersRecency || Boolean(plan.timeWindow))
    && !(intent === 'lookup' && !plan.timeWindow);

  const skipVector = intent === 'trend';
  const skipConcept = intent === 'status_check';
  const alwaysEntity = intent === 'lookup';
  const alwaysSql = intent === 'lookup';
  const isComparison = intent === 'comparison' && Boolean(plan.compareWindow);
  const forceStats = intent === 'trend' || intent === 'status_check' || intent === 'anomaly' || isComparison;
  const shouldGraph = intent === 'narrative' || intent === 'lookup' || intent === 'anomaly';

  const emptyVector = [] as Array<EventRow & { score: number; source: 'vector' }>;
  const emptySql = [] as Array<EventRow & { score: number; source: 'sql' }>;
  const emptyConcept = [] as Array<EventRow & { score: number; source: 'concept'; concepts: string[] }>;
  const emptyGraph = [] as Array<EventRow & { score: number; source: 'graph'; entity_names: string[] }>;

  const [vectorEvents, ftsEvents, sqlEvents, recentEvents, entityEvents, conceptEvents, stats] = await Promise.all([
    skipVector ? Promise.resolve(emptyVector) : vectorLane(queryEmbedding),
    ftsLane(plan.queryTerms),
    (plan.requiresSqlFacts || alwaysSql || isComparison) ? sqlLane(plan) : Promise.resolve(emptySql),
    shouldRunRecentLane ? recentLane(plan) : Promise.resolve(emptySql),
    (alwaysEntity || plan.queryTerms.length > 0) ? entityLane(plan) : Promise.resolve([] as Array<EventRow & { score: number; source: 'entity'; entity_names: string[] }>),
    skipConcept ? Promise.resolve(emptyConcept) : conceptLane(plan),
    (plan.requiresStats || forceStats) ? statsLane(plan) : Promise.resolve([] as StatsSnapshot[]),
  ]);

  const seedEntityIds = await extractSeedEntityIds(entityEvents);
  const graphEvents = shouldGraph && seedEntityIds.length > 0
    ? await graphLane(seedEntityIds)
    : emptyGraph;

  let events = mergeAndRank([entityEvents, conceptEvents, vectorEvents, ftsEvents, sqlEvents, recentEvents, graphEvents], plan);
  if (events.length === 0) {
    events = (await recentLane(plan)).map((event) => ({ ...event, lanes: ['sql' as const] }));
  }

  const comparisons = isComparison
    ? await buildTemporalComparisons(plan)
    : [];

  return { events, stats, comparisons };
}

async function extractSeedEntityIds(
  entityEvents: Array<EventRow & { score: number; source: 'entity'; entity_names: string[] }>,
): Promise<string[]> {
  if (entityEvents.length === 0) return [];

  const names = new Set<string>();
  for (const e of entityEvents) {
    for (const name of e.entity_names) names.add(name);
  }
  if (names.size === 0) return [];

  const nameClauses = Array.from(names).map(() => 'canonical_name = ?').join(' OR ');
  const result = await db.execute({
    sql: `SELECT id FROM entities WHERE ${nameClauses} LIMIT 10`,
    args: Array.from(names),
  });
  return result.rows.map((r) => r.id as string);
}
