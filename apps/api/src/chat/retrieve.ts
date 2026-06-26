import { db } from "../db/client";
import { fetchMemoryEpisodes } from "../memory/retrieve";
import { fetchNarratives } from "../narratives/retrieve";
import { fetchResourceChunks } from "../resources/retrieve";
import type { StatsSnapshot } from "../stats/types";
import { communityLane } from "./lanes/community";
import { conceptLane } from "./lanes/concept";
import { entityLane, extractSeedEntityIds } from "./lanes/entity";
import { ftsLane } from "./lanes/fts";
import { graphLane } from "./lanes/graph";
import { getActiveWeights, mergeAndRank } from "./lanes/merge";
import { buildSqlConditions, recentLane, sqlLane } from "./lanes/sql";
import { statsLane } from "./lanes/stats";
import { textToSqlLane } from "./lanes/text-to-sql";
import type {
	CausalLink,
	ContextConfidence,
	RankedEvent,
	RetrievalResult,
	RetrievalSource,
	TemporalComparison,
	TemporalPeriod,
} from "./lanes/types";
import { vectorLane } from "./lanes/vector";
import type { QueryPlan } from "./planner";

export type {
	RetrievalResult,
	RetrievalSource,
	ContextConfidence,
	TemporalComparison,
	TemporalPeriod,
	RankedEvent,
};

const CONFIDENCE_CORRECT = 0.6;
const CONFIDENCE_AMBIGUOUS = 0.35;

export function scoreContextQuality(
	result: RetrievalResult,
	plan: QueryPlan,
): ContextConfidence {
	const events = result.events;
	const eventCount = events.length;

	if (eventCount === 0) {
		return {
			score: 0,
			verdict: "incorrect",
			details: {
				qualityScore: 0,
				scoreSpread: 0,
				laneDiversity: 0,
				entityCoverage: 0,
				eventCount: 0,
			},
		};
	}

	const qualityMap = { complete: 1, partial: 0.6, degraded: 0.2 };
	const qualityScore =
		events.reduce((sum, e) => sum + (qualityMap[e.quality] ?? 0.2), 0) /
		eventCount;

	const scores = events.map((e) => e.score);
	const maxScore = Math.max(...scores);
	const minScore = Math.min(...scores);
	const scoreSpread = maxScore > 0 ? 1 - (maxScore - minScore) / maxScore : 0;

	const allLanes = new Set<string>();
	for (const e of events) {
		if ("lanes" in e && Array.isArray(e.lanes)) {
			for (const l of e.lanes) allLanes.add(l);
		}
	}
	const activeLaneCount = allLanes.size;
	const expectedLanes =
		plan.intent === "trend" ? 2 : plan.intent === "lookup" ? 3 : 4;
	const laneDiversity = Math.min(1, activeLaneCount / expectedLanes);

	const hintCount = plan.entityHints.length + plan.providerFilters.length;
	let entityCoverage = 1;
	if (hintCount > 0) {
		const matchedHints = new Set<string>();
		for (const e of events) {
			if (plan.providerFilters.includes(e.provider_type))
				matchedHints.add(e.provider_type);
			if (plan.entityHints.includes(e.entity_type))
				matchedHints.add(e.entity_type);
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

	const verdict: ContextConfidence["verdict"] =
		score >= CONFIDENCE_CORRECT
			? "correct"
			: score >= CONFIDENCE_AMBIGUOUS
				? "ambiguous"
				: "incorrect";

	return {
		score,
		verdict,
		details: {
			qualityScore,
			scoreSpread,
			laneDiversity,
			entityCoverage,
			eventCount,
		},
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

export type FailureAnalysis = {
	rounds: number;
	initialScore: number;
	finalScore: number;
	bottleneck: "no_events" | "low_quality" | "poor_coverage" | "narrow_lanes";
};

export type RetrievalMeta = {
	laneWeights: Record<string, number>;
	activeLanes: string[];
	exploring: boolean;
};

function deepRelaxPlan(plan: QueryPlan): QueryPlan {
	const relaxed = { ...plan };
	relaxed.providerFilters = [];
	relaxed.entityHints = [];
	relaxed.requiresSqlFacts = true;
	relaxed.requiresStats = true;
	if (relaxed.timeWindow) {
		const from = new Date(relaxed.timeWindow.from);
		const to = new Date(relaxed.timeWindow.to);
		const span = to.getTime() - from.getTime();
		relaxed.timeWindow = {
			from: new Date(from.getTime() - span * 3).toISOString(),
			to: relaxed.timeWindow.to,
		};
	}
	return relaxed;
}

function diagnoseBottleneck(
	details: ContextConfidence["details"],
): FailureAnalysis["bottleneck"] {
	if (details.eventCount === 0) return "no_events";
	if (details.qualityScore < 0.3) return "low_quality";
	if (details.entityCoverage < 0.3) return "poor_coverage";
	if (details.laneDiversity < 0.3) return "narrow_lanes";
	return "poor_coverage";
}

export async function retrieveWithCorrection(
	plan: QueryPlan,
	queryEmbedding: number[],
	workspaceId = "",
): Promise<
	RetrievalResult & {
		corrected: boolean;
		confidence: ContextConfidence;
		meta: RetrievalMeta;
		failureAnalysis?: FailureAnalysis;
	}
> {
	const { weights, exploring } = await getActiveWeights(workspaceId);
	const initial = await retrieveContext(
		plan,
		queryEmbedding,
		weights,
		workspaceId,
	);
	const confidence = scoreContextQuality(initial, plan);

	const activeLanes = [...new Set(initial.events.flatMap((e) => e.lanes))];
	const meta: RetrievalMeta = {
		laneWeights: weights[plan.intent],
		activeLanes,
		exploring,
	};

	if (confidence.verdict === "correct") {
		return { ...initial, corrected: false, confidence, meta };
	}

	let bestResult = initial;
	let bestConfidence = confidence;
	let bestLanes = activeLanes;
	let rounds = 1;

	const relaxed = relaxPlan(plan);
	const round1 = await retrieveContext(
		relaxed,
		queryEmbedding,
		weights,
		workspaceId,
	);
	const round1Confidence = scoreContextQuality(round1, relaxed);

	if (round1Confidence.score > bestConfidence.score) {
		bestResult = round1;
		bestConfidence = round1Confidence;
		bestLanes = [...new Set(round1.events.flatMap((e) => e.lanes))];
	}

	if (bestConfidence.verdict !== "correct") {
		rounds = 2;
		const deep = deepRelaxPlan(plan);
		const round2 = await retrieveContext(
			deep,
			queryEmbedding,
			weights,
			workspaceId,
		);
		const round2Confidence = scoreContextQuality(round2, deep);

		if (round2Confidence.score > bestConfidence.score) {
			bestResult = round2;
			bestConfidence = round2Confidence;
			bestLanes = [...new Set(round2.events.flatMap((e) => e.lanes))];
		}
	}

	const corrected = bestResult !== initial;
	const failureAnalysis: FailureAnalysis = {
		rounds,
		initialScore: confidence.score,
		finalScore: bestConfidence.score,
		bottleneck: diagnoseBottleneck(bestConfidence.details),
	};

	return {
		...bestResult,
		corrected,
		confidence: bestConfidence,
		meta: { ...meta, activeLanes: bestLanes },
		failureAnalysis,
	};
}

export async function fetchSystemSummary(workspaceId = ""): Promise<string> {
	const wsEventsWhere = workspaceId ? " WHERE workspace_id = ?" : "";
	const wsEventsAnd = workspaceId ? " AND e.workspace_id = ?" : "";
	const wsEntitiesWhere = workspaceId ? " WHERE workspace_id = ?" : "";
	const wsArgs = workspaceId ? [workspaceId] : [];

	const [eventsRow, entitiesRow, providers, entityTypes, eventCats] =
		await Promise.all([
			db.execute({
				sql: `SELECT COUNT(*) AS total, MIN(occurred_at) AS oldest, MAX(occurred_at) AS newest FROM events${wsEventsWhere}`,
				args: wsArgs,
			}),
			db.execute({
				sql: `SELECT COUNT(*) AS total FROM entities${wsEntitiesWhere}`,
				args: wsArgs,
			}),
			db.execute({
				sql: `SELECT provider_name, COUNT(*) AS cnt FROM events${wsEventsWhere} GROUP BY provider_name ORDER BY cnt DESC LIMIT 10`,
				args: wsArgs,
			}),
			db.execute({
				sql: `SELECT oc.label, COUNT(DISTINCT ec.event_id) AS cnt FROM ontology_concepts oc JOIN event_concepts ec ON ec.concept_id = oc.id JOIN events e ON e.id = ec.event_id WHERE oc.kind = 'entity_type'${wsEventsAnd} GROUP BY oc.label ORDER BY cnt DESC LIMIT 8`,
				args: wsArgs,
			}),
			db.execute({
				sql: `SELECT oc.label, COUNT(DISTINCT ec.event_id) AS cnt FROM ontology_concepts oc JOIN event_concepts ec ON ec.concept_id = oc.id JOIN events e ON e.id = ec.event_id WHERE oc.kind = 'event_category'${wsEventsAnd} GROUP BY oc.label ORDER BY cnt DESC LIMIT 8`,
				args: wsArgs,
			}),
		]);

	const total = eventsRow.rows[0]?.total ?? 0;
	const oldest =
		(eventsRow.rows[0]?.oldest as string | null)?.slice(0, 10) ?? "";
	const newest =
		(eventsRow.rows[0]?.newest as string | null)?.slice(0, 10) ?? "";
	const entityCount = entitiesRow.rows[0]?.total ?? 0;

	const providerList =
		providers.rows.map((r) => `${r.provider_name} (${r.cnt})`).join(", ") ||
		"none";
	const entityTypeList =
		entityTypes.rows.map((r) => `${r.label} (${r.cnt})`).join(", ") || "none";
	const eventCatList =
		eventCats.rows.map((r) => `${r.label} (${r.cnt})`).join(", ") || "none";

	return [
		`[KNOWLEDGE_BASE generated_at=${new Date().toISOString()} total_events=${total} total_entities=${entityCount} date_range=${oldest}/${newest}]`,
		`Providers: ${providerList}`,
		`Entity types: ${entityTypeList}`,
		`Event categories: ${eventCatList}`,
		`[/KNOWLEDGE_BASE]`,
	].join("\n");
}

async function buildTemporalComparisons(
	plan: QueryPlan,
	workspaceId = "",
): Promise<TemporalComparison[]> {
	if (!plan.timeWindow || !plan.compareWindow) return [];

	const { where: curWhere, args: curArgs } = buildSqlConditions(
		plan,
		plan.timeWindow,
		workspaceId,
	);
	const { where: prevWhere, args: prevArgs } = buildSqlConditions(
		plan,
		plan.compareWindow,
		workspaceId,
	);

	const [curTotal, prevTotal, curByDim, prevByDim] = await Promise.all([
		db.execute({
			sql: `SELECT COUNT(*) AS cnt FROM events WHERE ${curWhere}`,
			args: curArgs,
		}),
		db.execute({
			sql: `SELECT COUNT(*) AS cnt FROM events WHERE ${prevWhere}`,
			args: prevArgs,
		}),
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

	const comparisons: TemporalComparison[] = [
		{
			dimension: "total_events",
			current: curCount,
			previous: prevCount,
			delta: curCount - prevCount,
			deltaPercent:
				prevCount > 0
					? Math.round(((curCount - prevCount) / prevCount) * 100)
					: null,
		},
	];

	type DimKey = string;
	const curMap = new Map<DimKey, number>();
	const prevMap = new Map<DimKey, number>();

	for (const r of curByDim.rows) {
		const cnt = r.cnt as number;
		curMap.set(
			`provider:${r.provider_type}`,
			(curMap.get(`provider:${r.provider_type}`) ?? 0) + cnt,
		);
		curMap.set(
			`entity:${r.entity_type}`,
			(curMap.get(`entity:${r.entity_type}`) ?? 0) + cnt,
		);
		curMap.set(
			`event:${r.event_type}`,
			(curMap.get(`event:${r.event_type}`) ?? 0) + cnt,
		);
	}
	for (const r of prevByDim.rows) {
		const cnt = r.cnt as number;
		prevMap.set(
			`provider:${r.provider_type}`,
			(prevMap.get(`provider:${r.provider_type}`) ?? 0) + cnt,
		);
		prevMap.set(
			`entity:${r.entity_type}`,
			(prevMap.get(`entity:${r.entity_type}`) ?? 0) + cnt,
		);
		prevMap.set(
			`event:${r.event_type}`,
			(prevMap.get(`event:${r.event_type}`) ?? 0) + cnt,
		);
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

export async function retrieveContext(
	plan: QueryPlan,
	queryEmbedding: number[],
	intentWeights?: Record<QueryPlan["intent"], Record<RetrievalSource, number>>,
	workspaceId = "",
): Promise<RetrievalResult> {
	const intent = plan.intent;
	const prefersRecency = plan.prefersRecency || intent === "status_check";
	const shouldRunRecentLane =
		(plan.retrievalMode === "full" ||
			plan.requiresSqlFacts ||
			plan.requiresStats ||
			prefersRecency ||
			Boolean(plan.timeWindow)) &&
		!(intent === "lookup" && !plan.timeWindow);

	const skipVector = intent === "trend";
	const skipConcept = intent === "status_check";
	const alwaysEntity = intent === "lookup";
	const alwaysSql = intent === "lookup";
	const isComparison = intent === "comparison" && Boolean(plan.compareWindow);
	const forceStats =
		intent === "trend" ||
		intent === "status_check" ||
		intent === "anomaly" ||
		isComparison;
	const shouldGraph =
		intent === "narrative" ||
		intent === "lookup" ||
		intent === "anomaly" ||
		intent === "counterfactual";

	const [
		vectorEvents,
		ftsEvents,
		sqlEvents,
		recentEvents,
		entityEvents,
		conceptEvents,
		stats,
	] = await Promise.all([
		skipVector ? Promise.resolve([]) : vectorLane(queryEmbedding, workspaceId),
		ftsLane(plan.queryTerms, workspaceId),
		plan.requiresSqlFacts || alwaysSql || isComparison
			? sqlLane(plan, workspaceId)
			: Promise.resolve([]),
		shouldRunRecentLane ? recentLane(plan, workspaceId) : Promise.resolve([]),
		alwaysEntity || plan.queryTerms.length > 0
			? entityLane(plan, workspaceId)
			: Promise.resolve([]),
		skipConcept ? Promise.resolve([]) : conceptLane(plan, workspaceId),
		plan.requiresStats || forceStats
			? statsLane(plan, workspaceId)
			: Promise.resolve([] as StatsSnapshot[]),
	]);

	const seedEntityIds = await extractSeedEntityIds(entityEvents, workspaceId);
	const shouldCommunity = intent === "narrative" || intent === "lookup";
	const shouldNarrative = intent === "narrative" || intent === "lookup";
	const shouldTextToSql =
		plan.requiresSqlFacts &&
		(intent === "lookup" || intent === "comparison" || intent === "trend");

	const shouldMemory = plan.retrievalMode === "full";
	const shouldCausal = intent === "anomaly" || intent === "counterfactual";
	const shouldResources = plan.retrievalMode === "full";

	const [
		graphEvents,
		communitySummaries,
		narratives,
		sqlResult,
		memoryEpisodes,
		causalLinks,
		resourceChunks,
	] = await Promise.all([
		shouldGraph && seedEntityIds.length > 0
			? graphLane(seedEntityIds, workspaceId)
			: Promise.resolve([]),
		shouldCommunity && seedEntityIds.length > 0
			? communityLane(seedEntityIds, workspaceId)
			: Promise.resolve([]),
		shouldNarrative && seedEntityIds.length > 0
			? fetchNarratives(seedEntityIds, workspaceId)
			: Promise.resolve([]),
		shouldTextToSql ? textToSqlLane(plan, workspaceId) : Promise.resolve(null),
		shouldMemory
			? fetchMemoryEpisodes(queryEmbedding, workspaceId)
			: Promise.resolve([]),
		shouldCausal
			? fetchCausalLinks(workspaceId)
			: Promise.resolve([] as CausalLink[]),
		shouldResources
			? fetchResourceChunks(queryEmbedding, workspaceId)
			: Promise.resolve([]),
	]);

	let events = mergeAndRank(
		[
			entityEvents,
			conceptEvents,
			vectorEvents,
			ftsEvents,
			sqlEvents,
			recentEvents,
			graphEvents,
		],
		plan,
		intentWeights,
	);
	if (events.length === 0) {
		events = (await recentLane(plan, workspaceId)).map((event) => ({
			...event,
			lanes: ["sql" as const],
		}));
	}

	const comparisons = isComparison
		? await buildTemporalComparisons(plan, workspaceId)
		: [];

	return {
		events,
		stats,
		comparisons,
		communitySummaries,
		sqlResults: sqlResult ? [sqlResult] : [],
		narratives,
		memoryEpisodes,
		causalLinks,
		resourceChunks,
	};
}

async function fetchCausalLinks(workspaceId = ""): Promise<CausalLink[]> {
	const wsAnd = workspaceId ? " AND workspace_id = ?" : "";
	const result = await db.execute({
		sql: `SELECT cause_series, effect_series, lag_days, p_value
     FROM causal_links
     WHERE superseded_at IS NULL AND p_value < 0.01${wsAnd}
     ORDER BY p_value ASC
     LIMIT 5`,
		args: workspaceId ? [workspaceId] : [],
	});

	return result.rows.map((r) => ({
		causeSeries: r.cause_series as string,
		effectSeries: r.effect_series as string,
		lagDays: r.lag_days as number,
		pValue: r.p_value as number,
	}));
}
