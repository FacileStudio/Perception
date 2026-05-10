import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { db } from '../db/client';
import { getAllEffectiveSettings, setSetting, deleteSetting, getSettingSource } from '../db/settings';

export const settingsRoutes = new Hono();

const ALLOWED_KEYS = [
  'anthropic_api_key',
  'voyage_api_key',
  'llm_model',
  'embedding_model',
  'embedding_dimensions',
  'retention_days',
  'store_raw_payloads',
  'email_body_indexing',
  'workers_paused',
];

const SENSITIVE_KEYS = new Set(['anthropic_api_key', 'voyage_api_key']);

function maskValue(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key) || value.length <= 8) return value;
  return '••••••••' + value.slice(-4);
}

settingsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const all = await getAllEffectiveSettings();
  const settings: Record<string, string> = {};
  const sources: Record<string, string> = {};

  for (const key of ALLOWED_KEYS) {
    const value = all[key] ?? '';
    settings[key] = maskValue(key, value);
    sources[key] = await getSettingSource(key);
  }

  return c.json({ settings, sources });
});

settingsRoutes.put('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  let body: Record<string, string | null>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (value === null || value === '') {
      await deleteSetting(key);
    } else {
      await setSetting(key, value);
    }
  }

  return c.json({ ok: true });
});

const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4-5-20251001': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
};

const EMBEDDING_PRICING: Record<string, number> = {
  'voyage-4': 0.06,
  'voyage-4-lite': 0.02,
  'voyage-finance-2': 0.12,
  'voyage-law-2': 0.12,
  'voyage-code-3': 0.18,
};

settingsRoutes.get('/usage', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute(`
    SELECT kind, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls
    FROM token_usage
    GROUP BY kind, model
    ORDER BY kind, model
  `);

  const rows = result.rows.map((r) => {
    const kind = r.kind as string;
    const model = r.model as string;
    const inputTokens = Number(r.input_tokens ?? 0);
    const outputTokens = Number(r.output_tokens ?? 0);
    const calls = Number(r.calls ?? 0);

    let costUsd = 0;
    if (kind === 'llm') {
      const pricing = LLM_PRICING[model];
      if (pricing) {
        costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
      }
    } else {
      const pricing = EMBEDDING_PRICING[model];
      if (pricing) {
        costUsd = ((inputTokens + outputTokens) / 1_000_000) * pricing;
      }
    }

    return { kind, model, input_tokens: inputTokens, output_tokens: outputTokens, calls, cost_usd: costUsd };
  });

  const totalCostUsd = rows.reduce((sum, r) => sum + r.cost_usd, 0);

  return c.json({ usage: rows, total_cost_usd: totalCostUsd });
});
