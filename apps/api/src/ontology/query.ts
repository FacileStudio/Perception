const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'by', 'can', 'for', 'from', 'how', 'in', 'is', 'it',
  'last', 'latest', 'list', 'me', 'new', 'of', 'on', 'or', 'recent', 'recently', 'show',
  'the', 'this', 'to', 'what', 'when', 'where', 'which', 'who', 'with',
]);

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function extractQueryTerms(message: string): string[] {
  const normalized = message
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized
    .split(' ')
    .map((token) => normalizeLabel(token))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  return uniq(tokens).slice(0, 12);
}

export function inferQueryCapabilities(message: string): string[] {
  const terms = normalizeLabel(message);
  const capabilities: string[] = [];

  if (includesAny(terms, ['client', 'customer', 'account', 'company', 'organization'])) {
    capabilities.push('organization', 'commercial_account');
  }
  if (includesAny(terms, ['contract', 'document', 'signature', 'form'])) {
    capabilities.push('document', 'can_have_contracts');
  }
  if (includesAny(terms, ['invoice', 'payment', 'charge', 'billing', 'amount', 'paid'])) {
    capabilities.push('financial_record', 'money');
  }
  if (includesAny(terms, ['task', 'ticket', 'issue', 'todo'])) {
    capabilities.push('work_item');
  }
  if (includesAny(terms, ['service', 'website', 'monitor', 'deploy', 'deployment'])) {
    capabilities.push('service');
  }
  if (includesAny(terms, ['person', 'contact', 'signer', 'assignee'])) {
    capabilities.push('person');
  }

  return uniq(capabilities);
}
