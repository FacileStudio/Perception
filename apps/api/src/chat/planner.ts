import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

const CATALOG_TTL = 5 * 60 * 1000;
let catalogCache: { providers: string[]; entityTypes: string[]; capabilities: string[]; fetchedAt: number } | null = null;

async function getCatalog(workspaceId: string = ''): Promise<{ providers: string[]; entityTypes: string[]; capabilities: string[] }> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL) return catalogCache;

  const wsEventsWhere = workspaceId ? ' WHERE workspace_id = ?' : '';
  const wsConceptsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];

  const [provRows, entityRows, capRows] = await Promise.all([
    db.execute({ sql: `SELECT DISTINCT provider_type FROM events${wsEventsWhere} ORDER BY provider_type`, args: wsArgs }),
    db.execute({ sql: `SELECT DISTINCT label FROM ontology_concepts WHERE kind = 'entity_type' AND state != 'rejected'${wsConceptsAnd} ORDER BY label`, args: wsArgs }),
    db.execute({ sql: `SELECT DISTINCT json_each.value AS cap FROM ontology_concepts, json_each(capabilities_json) WHERE kind = 'entity_type' AND state != 'rejected'${wsConceptsAnd} ORDER BY cap`, args: wsArgs }),
  ]);

  catalogCache = {
    providers: provRows.rows.map((r) => r.provider_type as string),
    entityTypes: entityRows.rows.map((r) => r.label as string),
    capabilities: capRows.rows.map((r) => r.cap as string),
    fetchedAt: Date.now(),
  };
  return catalogCache;
}

export type CounterfactualScenario = {
  entity: string;
  mutation: string;
  timeScope: string | null;
};

export type QueryPlan = {
  intent: 'lookup' | 'trend' | 'status_check' | 'comparison' | 'anomaly' | 'narrative' | 'counterfactual';
  timeWindow: { from: string; to: string } | null;
  compareWindow: { from: string; to: string } | null;
  providerFilters: string[];
  entityHints: string[];
  queryTerms: string[];
  capabilities: string[];
  requiresSqlFacts: boolean;
  requiresStats: boolean;
  prefersRecency: boolean;
  retrievalMode: 'full' | 'history' | 'light';
  requiresRetrieval: boolean;
  isComposite: boolean;
  subqueries: string[];
  rawMessage: string;
  counterfactual: CounterfactualScenario | null;
};

function buildPlannerSystem(providers: string[], entityTypes: string[], capabilities: string[]): string {
  return `You are a query planner for Perception, an operational intelligence assistant for Facile.
Your job: analyze the user message (in ANY language) and output a JSON query plan.

Available data providers: ${providers.join(', ') || 'none'}
Available entity types: ${entityTypes.join(', ') || 'none'}
Available ontology capabilities: ${capabilities.join(', ') || 'none'}

Output a single JSON object — no markdown, no code fences, no explanation:

{
  "intent": "lookup" | "trend" | "status_check" | "comparison" | "anomaly" | "narrative" | "counterfactual",
  "retrievalMode": "full" | "history" | "light",
  "providerFilters": string[],
  "entityHints": string[],
  "timeWindow": { "from": "ISO8601", "to": "ISO8601" } | null,
  "compareWindow": { "from": "ISO8601", "to": "ISO8601" } | null,
  "requiresSqlFacts": boolean,
  "requiresStats": boolean,
  "prefersRecency": boolean,
  "queryTerms": string[],
  "capabilities": string[],
  "isComposite": boolean,
  "subqueries": string[],
  "counterfactual": { "entity": string, "mutation": string, "timeScope": string | null } | null
}

Field rules:
- retrievalMode:
    "light"   → pure reaction or acknowledgment, zero new data needed (ok, cool, thanks, lol, nice)
    "history" → follow-up answerable from conversation context (why?, which one?, and then?)
    "full"    → needs fresh data from the database (default when in doubt)
- providerFilters: providers relevant to the query. Empty array = no filter = search all providers.
  Use ["imap"] when the question is about personal facts, shared secrets, game results, passwords, codes, or anything
  typically communicated between people (e.g. "what is the secret animal?", "what did Yann say?", "what's the code word?",
  "did I get a reply?"). When in doubt about where the info lives and it could plausibly be in an email, include "imap".
- entityHints: entity types relevant to the query. Empty array = no filter.
  Use ["email"] alongside providerFilters: ["imap"] for personal communication queries.
- timeWindow: only set if the message explicitly references a time period. Use the current datetime to compute ISO 8601 from/to values (e.g. "today", "this week", "last 7 days"). Null otherwise.
- compareWindow: only set when intent is "comparison" and the user references a previous period to compare against.
  timeWindow = the current/recent period, compareWindow = the earlier/baseline period.
  Example: "how did deploys change this week vs last week?" → timeWindow = this week, compareWindow = last week.
  Example: "compare March to April" → timeWindow = April, compareWindow = March.
  Null when there is no explicit second time reference.
- requiresSqlFacts: true if asking for exact counts, lists, or enumerations.
- requiresStats: true if asking for trends, summaries, cadence, or health metrics.
- prefersRecency: true if asking about recent, latest, or new activity.
- queryTerms: key content search terms extracted from the message. Lowercase. No stop words. No language-specific articles or prepositions. Max 10 terms.
- capabilities: ontology capabilities relevant to the query. Empty if none clearly apply.
- isComposite: true when the question requires multiple independent data lookups that span different entities, providers, or time periods. False for simple questions.
- subqueries: when isComposite is true, decompose into 2-6 focused sub-questions. Each sub-query must be independently retrievable with no references to other sub-queries. Empty array when isComposite is false.
- intent: classify the user's information need.
    "lookup"          → finding specific entities, facts, or events
    "trend"           → patterns over time, growth, decline, cadence
    "status_check"    → current state, health, latest activity
    "comparison"      → comparing two periods or entities
    "anomaly"         → unusual patterns, spikes, drops, alerts
    "narrative"       → broad context, "tell me about", "what happened with"
    "counterfactual"  → hypothetical scenarios: "what if", "if X had", "suppose", "had we", "imagine", "what would happen if"
- counterfactual: when intent is "counterfactual", extract the scenario details:
    { "entity": "the entity being modified", "mutation": "what hypothetical change to apply", "timeScope": "ISO8601 or null" }
    Example: "what if client Acme had gone silent 3 months ago?" → { "entity": "Acme", "mutation": "zero activity", "timeScope": "3 months ago" }
    Null when intent is not counterfactual.`;
}

function fallbackPlan(message: string): QueryPlan {
  return {
    intent: 'narrative',
    timeWindow: null,
    compareWindow: null,
    providerFilters: [],
    entityHints: [],
    queryTerms: [],
    capabilities: [],
    requiresSqlFacts: false,
    requiresStats: false,
    prefersRecency: false,
    retrievalMode: 'full',
    requiresRetrieval: true,
    isComposite: false,
    subqueries: [],
    rawMessage: message,
    counterfactual: null,
  };
}

export async function buildQueryPlan(message: string, workspaceId: string = ''): Promise<QueryPlan> {
  try {
    const [apiKey, catalog] = await Promise.all([
      getEffectiveSetting('anthropic_api_key'),
      getCatalog(workspaceId),
    ]);
    const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });
    const now = new Date().toISOString();
    const systemPrompt = buildPlannerSystem(catalog.providers, catalog.entityTypes, catalog.capabilities);

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: systemPrompt,
      prompt: `Current datetime: ${now}\n\nUser message: ${message}`,
      maxTokens: 600,
    });

    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const raw = JSON.parse(cleaned);

    const retrievalMode = ['full', 'history', 'light'].includes(raw.retrievalMode)
      ? (raw.retrievalMode as 'full' | 'history' | 'light')
      : 'full';

    const validIntents = ['lookup', 'trend', 'status_check', 'comparison', 'anomaly', 'narrative', 'counterfactual'] as const;
    const intent = validIntents.includes(raw.intent) ? raw.intent : 'narrative';

    const compareWindow = intent === 'comparison'
      && raw.compareWindow && typeof raw.compareWindow === 'object'
      && typeof raw.compareWindow.from === 'string' && typeof raw.compareWindow.to === 'string'
      ? { from: raw.compareWindow.from, to: raw.compareWindow.to }
      : null;

    return {
      intent,
      timeWindow: raw.timeWindow && typeof raw.timeWindow === 'object' ? raw.timeWindow : null,
      compareWindow,
      providerFilters: Array.isArray(raw.providerFilters) ? raw.providerFilters : [],
      entityHints: Array.isArray(raw.entityHints) ? raw.entityHints : [],
      queryTerms: Array.isArray(raw.queryTerms) ? raw.queryTerms : [],
      capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
      requiresSqlFacts: Boolean(raw.requiresSqlFacts),
      requiresStats: Boolean(raw.requiresStats),
      prefersRecency: Boolean(raw.prefersRecency),
      retrievalMode,
      requiresRetrieval: retrievalMode === 'full',
      isComposite: Boolean(raw.isComposite) && Array.isArray(raw.subqueries) && raw.subqueries.length > 1,
      subqueries: Array.isArray(raw.subqueries) ? raw.subqueries.filter((s: unknown) => typeof s === 'string').slice(0, 6) : [],
      rawMessage: message,
      counterfactual: intent === 'counterfactual' && raw.counterfactual && typeof raw.counterfactual === 'object' && typeof raw.counterfactual.entity === 'string'
        ? { entity: raw.counterfactual.entity, mutation: raw.counterfactual.mutation ?? '', timeScope: raw.counterfactual.timeScope ?? null }
        : null,
    };
  } catch {
    return fallbackPlan(message);
  }
}
