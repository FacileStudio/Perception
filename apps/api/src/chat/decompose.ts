import { buildQueryPlan } from './planner';
import type { QueryPlan } from './planner';
import { retrieveContext } from './retrieve';
import { embedQuery } from '../embeddings/voyage';
import type { RetrievalResult, RankedEvent } from './lanes/types';
import { buildContextBlock } from './prompt';
import type { ResourceChunk } from '../resources/retrieve';

const MAX_SUBQUERIES = 6;
const MAX_MERGED_EVENTS = 25;
const MAX_CONTEXT_CHARS = 60_000;

export type SubqueryResult = {
  subquery: string;
  plan: QueryPlan;
  context: RetrievalResult;
};

export type DecomposedResult = {
  subResults: SubqueryResult[];
  mergedContext: RetrievalResult;
  contextBlock: string;
};

async function runSubquery(subquery: string): Promise<SubqueryResult> {
  const [plan, embedding] = await Promise.all([
    buildQueryPlan(subquery),
    embedQuery(subquery).catch(() => [] as number[]),
  ]);
  plan.requiresRetrieval = true;
  plan.retrievalMode = 'full';
  plan.isComposite = false;
  plan.subqueries = [];

  const context = await retrieveContext(plan, embedding);
  return { subquery, plan, context };
}

function deduplicateResourceChunks(subResults: SubqueryResult[]): ResourceChunk[] {
  const seen = new Set<string>();
  const chunks: ResourceChunk[] = [];
  for (const sr of subResults) {
    for (const rc of sr.context.resourceChunks) {
      const key = `${rc.resourceId}-${rc.chunkIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        chunks.push(rc);
      }
    }
  }
  return chunks.sort((a, b) => b.score - a.score).slice(0, 5);
}

function mergeRetrievalResults(subResults: SubqueryResult[]): RetrievalResult {
  const eventMap = new Map<string, RankedEvent>();
  for (const sr of subResults) {
    for (const event of sr.context.events) {
      const existing = eventMap.get(event.id);
      if (!existing || event.score > existing.score) {
        eventMap.set(event.id, {
          ...event,
          lanes: existing ? Array.from(new Set([...existing.lanes, ...event.lanes])) : event.lanes,
        });
      } else {
        existing.lanes = Array.from(new Set([...existing.lanes, ...event.lanes]));
      }
    }
  }

  const mergedEvents = Array.from(eventMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MERGED_EVENTS);

  const statsMap = new Map<string, (typeof subResults)[0]['context']['stats'][number]>();
  const narrativeMap = new Map<string, (typeof subResults)[0]['context']['narratives'][number]>();
  const communityMap = new Map<string, (typeof subResults)[0]['context']['communitySummaries'][number]>();

  for (const sr of subResults) {
    for (const s of sr.context.stats) statsMap.set(`${s.kind}-${s.window_start}-${s.window_end}`, s);
    for (const n of sr.context.narratives) narrativeMap.set(n.entityName, n);
    for (const cs of sr.context.communitySummaries) communityMap.set(cs.title, cs);
  }

  return {
    events: mergedEvents,
    stats: Array.from(statsMap.values()),
    comparisons: subResults.flatMap((sr) => sr.context.comparisons),
    communitySummaries: Array.from(communityMap.values()).slice(0, 5),
    sqlResults: subResults.flatMap((sr) => sr.context.sqlResults).slice(0, 3),
    narratives: Array.from(narrativeMap.values()).slice(0, 5),
    memoryEpisodes: subResults[0]?.context.memoryEpisodes ?? [],
    causalLinks: subResults[0]?.context.causalLinks ?? [],
    resourceChunks: deduplicateResourceChunks(subResults),
  };
}

function buildLabeledContextBlock(subResults: SubqueryResult[], merged: RetrievalResult): string {
  const header = [
    '[COMPOSITE_QUERY]',
    `This answer synthesizes evidence from ${subResults.length} sub-queries:`,
    ...subResults.map((sr, i) => `  ${i + 1}. ${sr.subquery}`),
    '[/COMPOSITE_QUERY]',
    '',
  ].join('\n');

  const block = buildContextBlock(
    merged.events,
    merged.stats,
    merged.comparisons,
    merged.communitySummaries,
    merged.sqlResults,
    merged.narratives,
    merged.memoryEpisodes,
    merged.causalLinks,
    merged.resourceChunks,
  );

  let fullBlock = header + block;

  if (fullBlock.length > MAX_CONTEXT_CHARS) {
    fullBlock = fullBlock.slice(0, MAX_CONTEXT_CHARS) + '\n[CONTEXT_TRUNCATED]';
  }

  return fullBlock;
}

export async function decomposeAndRetrieve(
  subqueries: string[],
): Promise<DecomposedResult> {
  const capped = subqueries.slice(0, MAX_SUBQUERIES);
  const subResults = await Promise.all(capped.map(runSubquery));
  const mergedContext = mergeRetrievalResults(subResults);
  const contextBlock = buildLabeledContextBlock(subResults, mergedContext);

  return { subResults, mergedContext, contextBlock };
}
