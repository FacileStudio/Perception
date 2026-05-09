import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { InValue } from '@libsql/client';
import type { EventRow, StatsSnapshot } from '../types';
import type { QueryPlan } from './planner';
import { EVENT_LIST_ORDER_BY } from '../events/order';

export type RetrievalResult = {
  events: Array<EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[] }>;
  stats: StatsSnapshot[];
};

type RetrievalSource = 'vector' | 'fts' | 'sql' | 'stats' | 'entity' | 'concept';

async function vectorLane(queryEmbedding: number[]): Promise<Array<EventRow & { score: number; source: 'vector' }>> {
  try {
    const vecJson = JSON.stringify(queryEmbedding);
    const result = await db.execute({
      sql: `SELECT e.*, v.distance AS score FROM vector_top_k('event_embeddings_vector_idx', vector32(?), 40) v JOIN event_embeddings ee ON ee.rowid = v.id JOIN events e ON e.id = ee.event_id WHERE ee.status = 'ready'`,
      args: [vecJson],
    });
    return result.rows.map((r) => ({
      ...rowToEvent(r as unknown as Record<string, unknown>),
      score: typeof r.score === 'number' ? r.score : 0,
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
      score: typeof r.score === 'number' ? r.score : 0,
      source: 'fts' as const,
    }));
  } catch {
    return [];
  }
}

async function sqlLane(plan: QueryPlan): Promise<Array<EventRow & { score: number; source: 'sql' }>> {
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

  const where = conditions.join(' AND ');
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT 30`,
    args,
  });

  return result.rows.map((r) => ({
    ...rowToEvent(r as unknown as Record<string, unknown>),
    score: 0.5,
    source: 'sql' as const,
  }));
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
    score: 0.4,
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

async function statsLane(): Promise<StatsSnapshot[]> {
  const result = await db.execute({
    sql: `SELECT * FROM stats_snapshots ORDER BY generated_at DESC LIMIT 5`,
    args: [],
  });
  return result.rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
    generated_at: r.generated_at as string,
    source_count: r.source_count as number,
    min_sample_met: Boolean(r.min_sample_met),
    data: JSON.parse(r.data_json as string) as Record<string, unknown>,
  }));
}

function mergeAndRank(
  lanes: Array<Array<EventRow & { score: number; source: RetrievalSource; concepts?: string[]; entity_names?: string[] }>>,
  plan: QueryPlan,
): Array<EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[] }> {
  const best = new Map<string, EventRow & { score: number; source: RetrievalSource; lanes: RetrievalSource[]; concepts?: string[]; entity_names?: string[] }>();

  for (const lane of lanes) {
    for (const event of lane) {
      const existing = best.get(event.id);
      const laneWeight = event.source === 'entity'
        ? 0.55
        : event.source === 'concept'
          ? 0.4
          : event.source === 'sql'
            ? 0.25
            : event.source === 'fts'
              ? 0.2
              : 0.15;
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

export async function retrieveContext(plan: QueryPlan, queryEmbedding: number[]): Promise<RetrievalResult> {
  const shouldRunRecentLane = plan.retrievalMode === 'full' || plan.requiresSqlFacts || plan.requiresStats || plan.prefersRecency || Boolean(plan.timeWindow);

  const [vectorEvents, ftsEvents, sqlEvents, recentEvents, entityEvents, conceptEvents, stats] = await Promise.all([
    vectorLane(queryEmbedding),
    ftsLane(plan.queryTerms),
    plan.requiresSqlFacts ? sqlLane(plan) : Promise.resolve([] as Array<EventRow & { score: number; source: 'sql' }>),
    shouldRunRecentLane ? recentLane(plan) : Promise.resolve([] as Array<EventRow & { score: number; source: 'sql' }>),
    entityLane(plan),
    conceptLane(plan),
    plan.requiresStats ? statsLane() : Promise.resolve([] as StatsSnapshot[]),
  ]);

  let events = mergeAndRank([entityEvents, conceptEvents, vectorEvents, ftsEvents, sqlEvents, recentEvents], plan);
  if (events.length === 0) {
    events = (await recentLane(plan)).map((event) => ({ ...event, lanes: ['sql' as const] }));
  }

  return { events, stats };
}
