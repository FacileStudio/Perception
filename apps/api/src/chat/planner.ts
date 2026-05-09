import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getEffectiveSetting } from '../db/settings';

export type QueryPlan = {
  timeWindow: { from: string; to: string } | null;
  providerFilters: string[];
  entityHints: string[];
  queryTerms: string[];
  capabilities: string[];
  requiresSqlFacts: boolean;
  requiresStats: boolean;
  prefersRecency: boolean;
  retrievalMode: 'full' | 'history' | 'light';
  requiresRetrieval: boolean;
  rawMessage: string;
};

const PLANNER_SYSTEM = `You are a query planner for Perception, an operational intelligence assistant for Facile.
Your job: analyze the user message (in ANY language) and output a JSON query plan.

Available data providers: imap, git, dokploy, vikunja, charles, docuseal, uptime-kuma, sablier, website
Available entity types: email, task, contract, deployment, service, client
Available ontology capabilities: organization, commercial_account, document, can_have_contracts, financial_record, money, work_item, service, person

Output a single JSON object — no markdown, no code fences, no explanation:

{
  "retrievalMode": "full" | "history" | "light",
  "providerFilters": string[],
  "entityHints": string[],
  "timeWindow": { "from": "ISO8601", "to": "ISO8601" } | null,
  "requiresSqlFacts": boolean,
  "requiresStats": boolean,
  "prefersRecency": boolean,
  "queryTerms": string[],
  "capabilities": string[]
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
- requiresSqlFacts: true if asking for exact counts, lists, or enumerations.
- requiresStats: true if asking for trends, summaries, cadence, or health metrics.
- prefersRecency: true if asking about recent, latest, or new activity.
- queryTerms: key content search terms extracted from the message. Lowercase. No stop words. No language-specific articles or prepositions. Max 10 terms.
- capabilities: ontology capabilities relevant to the query. Empty if none clearly apply.`;

function fallbackPlan(message: string): QueryPlan {
  return {
    timeWindow: null,
    providerFilters: [],
    entityHints: [],
    queryTerms: [],
    capabilities: [],
    requiresSqlFacts: false,
    requiresStats: false,
    prefersRecency: false,
    retrievalMode: 'full',
    requiresRetrieval: true,
    rawMessage: message,
  };
}

export async function buildQueryPlan(message: string): Promise<QueryPlan> {
  try {
    const apiKey = await getEffectiveSetting('anthropic_api_key');
    const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });
    const now = new Date().toISOString();

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: PLANNER_SYSTEM,
      prompt: `Current datetime: ${now}\n\nUser message: ${message}`,
      maxTokens: 300,
    });

    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const raw = JSON.parse(cleaned);

    const retrievalMode = ['full', 'history', 'light'].includes(raw.retrievalMode)
      ? (raw.retrievalMode as 'full' | 'history' | 'light')
      : 'full';

    return {
      timeWindow: raw.timeWindow && typeof raw.timeWindow === 'object' ? raw.timeWindow : null,
      providerFilters: Array.isArray(raw.providerFilters) ? raw.providerFilters : [],
      entityHints: Array.isArray(raw.entityHints) ? raw.entityHints : [],
      queryTerms: Array.isArray(raw.queryTerms) ? raw.queryTerms : [],
      capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
      requiresSqlFacts: Boolean(raw.requiresSqlFacts),
      requiresStats: Boolean(raw.requiresStats),
      prefersRecency: Boolean(raw.prefersRecency),
      retrievalMode,
      requiresRetrieval: retrievalMode === 'full',
      rawMessage: message,
    };
  } catch {
    return fallbackPlan(message);
  }
}
