export type QueryPlan = {
  timeWindow: { from: string; to: string } | null;
  providerFilters: string[];
  entityHints: string[];
  requiresSqlFacts: boolean;
  requiresStats: boolean;
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

  return {
    timeWindow,
    providerFilters,
    entityHints: Array.from(entitySet),
    requiresSqlFacts,
    requiresStats,
    rawMessage: message,
  };
}
