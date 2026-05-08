export type QueryPlan = {
  timeWindow: { from: string; to: string } | null;
  providerFilters: string[];
  entityHints: string[];
  requiresSqlFacts: boolean;
  requiresStats: boolean;
  prefersRecency: boolean;
  retrievalMode: 'full' | 'history' | 'light';
  requiresRetrieval: boolean;
  rawMessage: string;
};

const KNOWN_PROVIDERS = [
  'dokploy', 'vikunja', 'charles', 'docuseal',
  'uptime-kuma', 'imap', 'git', 'sablier', 'website',
];

const ENTITY_KEYWORDS: Record<string, string> = {
  task: 'task',
  tasks: 'task',
  contract: 'contract',
  contracts: 'contract',
  deployment: 'deployment',
  deployments: 'deployment',
  service: 'service',
  services: 'service',
  email: 'email',
  emails: 'email',
  client: 'client',
  clients: 'client',
};

const SQL_KEYWORDS = ['count', 'how many', 'list all', 'unsigned', 'overdue'];
const STATS_KEYWORDS = ['trend', 'summary', 'week', 'cadence', 'health'];
const RECENCY_KEYWORDS = ['recent', 'recently', 'latest', 'new', 'happened', 'activity', 'updates'];
const QUESTION_STARTERS = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'is', 'are', 'do', 'does', 'did'];
const COMMAND_STARTERS = ['show', 'list', 'tell', 'explain', 'summarize', 'find', 'check', 'compare', 'drill', 'dig', 'give'];
const COMMAND_PHRASES = ['show me', 'tell me', 'list', 'summarize', 'find', 'check', 'compare', 'drill into', 'dig into', 'give me'];
const LIGHT_REPLY_TOKENS = new Set([
  'ok', 'okay', 'yeah', 'yep', 'yup', 'nice', 'cool', 'wow', 'wild', 'crazy', 'insane',
  'perfect', 'great', 'thanks', 'thank', 'you', 'gotcha', 'gotit', 'lol', 'lmao', 'oof',
  'brutal', 'nuts', 'sick', 'damn', 'whoa', 'woah', 'sheesh', 'clean', 'solid', 'true',
  'fair', 'exactly', 'same', 'indeed', 'thats', 'that', 'this', 'its', 'it', 'is', 'was',
  'really', 'very', 'so', 'super', 'actually', 'honestly', 'pretty', 'kindof', 'kinda', 'hell',
  'ha', 'haha', 'jesus',
]);
const HISTORY_ONLY_PATTERNS = [
  /^why\b/,
  /^how so\b/,
  /^how come\b/,
  /^what do you mean\b/,
  /^which one\b/,
  /^which ones\b/,
  /^what changed\b/,
  /^what specifically\b/,
  /^and then\b/,
  /^and why\b/,
  /^wait what\b/,
  /^really\b/,
];

function normalizeIntentText(message: string): string {
  return message
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeIntent(message: string): string[] {
  const normalized = normalizeIntentText(message);
  return normalized ? normalized.split(' ') : [];
}

function hasQuestionSignal(message: string): boolean {
  const normalized = normalizeIntentText(message);
  const tokens = tokenizeIntent(message);
  const first = tokens[0] ?? '';

  return (
    message.includes('?') ||
    QUESTION_STARTERS.includes(first) ||
    COMMAND_STARTERS.includes(first) ||
    COMMAND_PHRASES.some((phrase) => normalized.includes(phrase))
  );
}

function hasExplicitEvidenceSignal(message: string): boolean {
  const lower = message.toLowerCase();
  const normalized = normalizeIntentText(message);

  return (
    /\d/.test(message) ||
    KNOWN_PROVIDERS.some((provider) => lower.includes(provider)) ||
    Object.keys(ENTITY_KEYWORDS).some((keyword) => lower.includes(keyword)) ||
    SQL_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    STATS_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    RECENCY_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    normalized.includes('main') ||
    normalized.includes('deploy') ||
    normalized.includes('build') ||
    normalized.includes('commit')
  );
}

function isLikelyLightReply(message: string): boolean {
  const tokens = tokenizeIntent(message);
  if (tokens.length === 0 || tokens.length > 6) {
    return false;
  }
  if (hasQuestionSignal(message) || hasExplicitEvidenceSignal(message)) {
    return false;
  }
  return tokens.every((token) => LIGHT_REPLY_TOKENS.has(token));
}

function isLikelyHistoryOnlyFollowup(message: string): boolean {
  const normalized = normalizeIntentText(message);
  const tokens = tokenizeIntent(message);
  if (tokens.length === 0 || tokens.length > 8) {
    return false;
  }
  if (hasExplicitEvidenceSignal(message)) {
    return false;
  }
  return HISTORY_ONLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function detectRetrievalMode(message: string): 'full' | 'history' | 'light' {
  if (isLikelyLightReply(message)) {
    return 'light';
  }
  if (isLikelyHistoryOnlyFollowup(message)) {
    return 'history';
  }
  return 'full';
}

function startOfDay(d: Date): string {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfDay(d: Date): string {
  const copy = new Date(d);
  copy.setUTCHours(23, 59, 59, 999);
  return copy.toISOString();
}

function detectTimeWindow(msg: string): { from: string; to: string } | null {
  const lower = msg.toLowerCase();
  const now = new Date();

  if (lower.includes('today')) {
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  if (lower.includes('this week')) {
    const dayOfWeek = now.getUTCDay();
    const monday = new Date(now.getTime() - dayOfWeek * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    return { from: startOfDay(monday), to: endOfDay(sunday) };
  }

  if (lower.includes('last 7 days')) {
    const from = new Date(now.getTime() - 7 * 86400000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (lower.includes('last 30 days')) {
    const from = new Date(now.getTime() - 30 * 86400000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  if (lower.includes('recent') || lower.includes('recently') || lower.includes('latest')) {
    const from = new Date(now.getTime() - 3 * 86400000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  return null;
}

export function buildQueryPlan(message: string): QueryPlan {
  const lower = message.toLowerCase();

  const timeWindow = detectTimeWindow(message);

  const providerFilters = KNOWN_PROVIDERS.filter((p) => lower.includes(p));

  const entitySet = new Set<string>();
  for (const [keyword, entity] of Object.entries(ENTITY_KEYWORDS)) {
    if (lower.includes(keyword)) entitySet.add(entity);
  }

  const requiresSqlFacts = SQL_KEYWORDS.some((kw) => lower.includes(kw));
  const requiresStats = STATS_KEYWORDS.some((kw) => lower.includes(kw));
  const prefersRecency = RECENCY_KEYWORDS.some((kw) => lower.includes(kw));
  const retrievalMode = detectRetrievalMode(message);

  return {
    timeWindow,
    providerFilters,
    entityHints: Array.from(entitySet),
    requiresSqlFacts,
    requiresStats,
    prefersRecency,
    retrievalMode,
    requiresRetrieval: retrievalMode === 'full',
    rawMessage: message,
  };
}
