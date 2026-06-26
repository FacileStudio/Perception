import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { log } from '../../lib/logger';
import { db } from '../../db/client';
import { getEffectiveSetting } from '../../db/settings';
import type { QueryPlan } from '../planner';

export type SqlQueryResult = {
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

const SCHEMA_DESCRIPTION = `CREATE TABLE events (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  actor_name TEXT,
  status TEXT,
  due_at TEXT,
  completed_at TEXT,
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  quality TEXT NOT NULL -- 'complete', 'partial', 'degraded'
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type_concept_id TEXT NOT NULL REFERENCES ontology_concepts(id),
  canonical_name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  confidence REAL NOT NULL
);

CREATE TABLE entity_aliases (
  entity_id TEXT NOT NULL REFERENCES entities(id),
  alias_type TEXT NOT NULL, -- 'provider_id', 'external_id', 'name', 'url'
  alias_value TEXT NOT NULL,
  provider_type TEXT
);

CREATE TABLE event_entities (
  event_id TEXT NOT NULL REFERENCES events(id),
  entity_id TEXT NOT NULL REFERENCES entities(id)
);

CREATE TABLE entity_relations (
  from_entity_id TEXT NOT NULL REFERENCES entities(id),
  to_entity_id TEXT NOT NULL REFERENCES entities(id),
  relation_concept_id TEXT REFERENCES ontology_concepts(id),
  confidence REAL NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE ontology_concepts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- 'entity_type', 'field_role', 'relation_type', 'event_category'
  label TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE dynamic_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  provider_type TEXT NOT NULL,
  facts_json TEXT NOT NULL -- JSON object with provider-specific key-value facts
);

CREATE TABLE stats_snapshots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  data_json TEXT NOT NULL
);`;

const FEW_SHOT_EXAMPLES = `<example>
<question>How many events came from each provider this month?</question>
<sql>SELECT provider_type, COUNT(*) AS event_count FROM events WHERE occurred_at >= strftime('%Y-%m-01', 'now') GROUP BY provider_type ORDER BY event_count DESC LIMIT 100</sql>
</example>

<example>
<question>Which clients have the most tasks?</question>
<sql>SELECT e.entity_name, COUNT(*) AS task_count FROM events e WHERE e.entity_type = 'task' AND e.entity_name IS NOT NULL GROUP BY e.entity_name ORDER BY task_count DESC LIMIT 20</sql>
</example>

<example>
<question>List all entities related to Acme Corp</question>
<sql>SELECT DISTINCT ent2.canonical_name, oc.label AS relation_type FROM entities ent1 JOIN entity_relations er ON er.from_entity_id = ent1.id JOIN entities ent2 ON ent2.id = er.to_entity_id JOIN ontology_concepts oc ON oc.id = er.relation_concept_id WHERE ent1.canonical_name LIKE '%Acme%' LIMIT 100</sql>
</example>

<example>
<question>What happened with deploys last week?</question>
<sql>SELECT title, summary, occurred_at, provider_name FROM events WHERE event_type LIKE '%deploy%' AND occurred_at >= date('now', '-7 days') ORDER BY occurred_at DESC LIMIT 30</sql>
</example>

<example>
<question>Show me the most active actors this quarter</question>
<sql>SELECT actor_name, COUNT(*) AS event_count, COUNT(DISTINCT provider_type) AS providers FROM events WHERE actor_name IS NOT NULL AND occurred_at >= date('now', '-3 months') GROUP BY actor_name ORDER BY event_count DESC LIMIT 20</sql>
</example>`;

function buildGenerationPrompt(plan: QueryPlan): string {
  const timeContext = plan.timeWindow
    ? `Time window: ${plan.timeWindow.from} to ${plan.timeWindow.to}`
    : 'No specific time window';

  return `<schema>
${SCHEMA_DESCRIPTION}
</schema>

<examples>
${FEW_SHOT_EXAMPLES}
</examples>

<context>
${timeContext}
Provider filters: ${plan.providerFilters.length > 0 ? plan.providerFilters.join(', ') : 'none'}
Entity hints: ${plan.entityHints.length > 0 ? plan.entityHints.join(', ') : 'none'}
</context>

<question>${plan.rawMessage}</question>

Generate a single SQLite SELECT query. Output ONLY the SQL inside <sql> tags.
Think briefly in <thought> tags first.`;
}

const DANGEROUS_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|MERGE)\b/i,
  /\bPRAGMA\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bLOAD_EXTENSION\b/i,
  /\bVACUUM\b/i,
  /\bREINDEX\b/i,
  /;\s*\S/,
];

function validateSql(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim().replace(/;\s*$/, '');

  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    return { valid: false, reason: 'Only SELECT statements allowed' };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }

  return { valid: true };
}

function ensureLimit(sql: string, maxRows = 100): string {
  const trimmed = sql.trim().replace(/;\s*$/, '');
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return `${trimmed} LIMIT ${maxRows}`;
  }

  const limitMatch = trimmed.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    const n = parseInt(limitMatch[1], 10);
    if (n > maxRows) {
      return trimmed.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`);
    }
  }
  return trimmed;
}

export async function textToSqlLane(plan: QueryPlan, workspaceId: string = ''): Promise<SqlQueryResult | null> {
  try {
    const apiKey = await getEffectiveSetting('anthropic_api_key', workspaceId);
    const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: `You are a SQL expert for SQLite/libSQL. Rules:
- Output ONLY a SELECT query inside <sql> tags
- Use strftime() for date extraction, never YEAR/MONTH/DAY functions
- LIKE is case-insensitive for ASCII in SQLite
- Use GROUP_CONCAT, not STRING_AGG
- Booleans are 0/1
- Dates are stored as ISO-8601 TEXT
- Always include LIMIT (default 100)`,
      prompt: buildGenerationPrompt(plan),
      maxTokens: 500,
    });

    const sqlMatch = text.match(/<sql>([\s\S]*?)<\/sql>/i);
    if (!sqlMatch) return null;

    const rawSql = sqlMatch[1].trim();
    const validation = validateSql(rawSql);
    if (!validation.valid) {
      log.warn('rejected', { tag: 'text-to-sql', reason: validation.reason });
      return null;
    }

    let safeSql = ensureLimit(rawSql);

    if (workspaceId) {
      const whereIdx = safeSql.search(/\bWHERE\b/i);
      if (whereIdx !== -1) {
        const insertAt = whereIdx + 'WHERE'.length;
        safeSql = `${safeSql.slice(0, insertAt)} workspace_id = ? AND${safeSql.slice(insertAt)}`;
      } else {
        const fromIdx = safeSql.search(/\bFROM\b/i);
        if (fromIdx !== -1) {
          const afterFrom = safeSql.slice(fromIdx);
          const nextClause = afterFrom.search(/\b(GROUP|ORDER|LIMIT|HAVING|UNION)\b/i);
          if (nextClause > 0) {
            const insertPos = fromIdx + nextClause;
            safeSql = `${safeSql.slice(0, insertPos)} WHERE workspace_id = ? ${safeSql.slice(insertPos)}`;
          } else {
            safeSql = `${safeSql} WHERE workspace_id = ?`;
          }
        }
      }
    }

    const result = await db.execute({
      sql: safeSql,
      args: workspaceId ? [workspaceId] : [],
    });

    if (result.rows.length === 0) return null;

    const columns = result.columns ?? Object.keys(result.rows[0] ?? {});
    return {
      query: safeSql,
      columns,
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rows.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('error', { tag: 'text-to-sql', error: msg });
    return null;
  }
}
