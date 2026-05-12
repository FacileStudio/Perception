import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

type CommunityInput = {
  entities: Array<{ id: string; name: string; type: string; description: string | null }>;
  relations: Array<{ from: string; to: string; label: string }>;
  recentEventTitles: string[];
};

async function loadCommunityInput(memberEntityIds: string[], workspaceId: string = ''): Promise<CommunityInput> {
  const placeholders = memberEntityIds.map(() => '?').join(',');
  const wsEntFilter = workspaceId ? ' AND e.workspace_id = ?' : '';
  const wsRelFilter = workspaceId ? ' AND er.workspace_id = ?' : '';
  const wsEvFilter = workspaceId ? ' AND e.workspace_id = ?' : '';

  const entArgs: (string | number | null)[] = [...memberEntityIds];
  if (workspaceId) entArgs.push(workspaceId);
  const relArgs: (string | number | null)[] = [...memberEntityIds, ...memberEntityIds];
  if (workspaceId) relArgs.push(workspaceId);
  const evArgs: (string | number | null)[] = [...memberEntityIds];
  if (workspaceId) evArgs.push(workspaceId);

  const [entityRows, relationRows, eventRows] = await Promise.all([
    db.execute({
      sql: `SELECT e.id, e.canonical_name AS name, oc.label AS type, e.description
            FROM entities e
            JOIN ontology_concepts oc ON oc.id = e.type_concept_id
            WHERE e.id IN (${placeholders})${wsEntFilter}`,
      args: entArgs,
    }),
    db.execute({
      sql: `SELECT ef.canonical_name AS from_name, et.canonical_name AS to_name, oc.label AS relation
            FROM entity_relations er
            JOIN entities ef ON ef.id = er.from_entity_id
            JOIN entities et ON et.id = er.to_entity_id
            JOIN ontology_concepts oc ON oc.id = er.relation_concept_id
            WHERE er.from_entity_id IN (${placeholders}) AND er.to_entity_id IN (${placeholders})${wsRelFilter}`,
      args: relArgs,
    }),
    db.execute({
      sql: `SELECT DISTINCT e.title
            FROM events e
            JOIN event_entities ee ON ee.event_id = e.id
            WHERE ee.entity_id IN (${placeholders})${wsEvFilter}
            ORDER BY e.occurred_at DESC LIMIT 15`,
      args: evArgs,
    }),
  ]);

  return {
    entities: entityRows.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      type: r.type as string,
      description: r.description as string | null,
    })),
    relations: relationRows.rows.map((r) => ({
      from: r.from_name as string,
      to: r.to_name as string,
      label: r.relation as string,
    })),
    recentEventTitles: eventRows.rows.map((r) => r.title as string),
  };
}

function buildSummaryPrompt(input: CommunityInput): string {
  const entityList = input.entities
    .map((e) => `- ${e.name} (${e.type})${e.description ? `: ${e.description}` : ''}`)
    .join('\n');

  const relationList = input.relations
    .map((r) => `- ${r.from} --[${r.label}]--> ${r.to}`)
    .join('\n');

  const eventList = input.recentEventTitles.map((t) => `- ${t}`).join('\n');

  return `Analyze this cluster of related business entities and write a concise operational summary.

Entities:
${entityList}

Relationships:
${relationList || '(none detected)'}

Recent activity:
${eventList || '(no recent events)'}

Output a JSON object with these fields only:
{
  "title": "Short name for this cluster (max 8 words)",
  "summary": "2-4 sentence operational overview: who are the key actors, what connects them, what is the current state of their activity",
  "importance": 0.0-1.0
}

Rules:
- Focus on operational significance, not graph structure
- Name specific entities in the summary
- importance reflects business impact and activity level
- Output raw JSON, no markdown fences`;
}

const MAX_MEMBERS = 50;
const MAX_EVENT_TITLE_LEN = 120;
const MAX_DESCRIPTION_LEN = 200;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function trimInput(input: CommunityInput): CommunityInput {
  return {
    entities: input.entities.slice(0, MAX_MEMBERS).map((e) => ({
      ...e,
      description: e.description ? truncate(e.description, MAX_DESCRIPTION_LEN) : null,
    })),
    relations: input.relations.slice(0, MAX_MEMBERS * 2),
    recentEventTitles: input.recentEventTitles.map((t) => truncate(t, MAX_EVENT_TITLE_LEN)),
  };
}

export async function generateCommunitySummary(
  memberEntityIds: string[],
  workspaceId: string = '',
): Promise<{ title: string; summary: string; importance: number }> {
  const cappedIds = memberEntityIds.slice(0, MAX_MEMBERS);
  const raw = await loadCommunityInput(cappedIds, workspaceId);
  const input = trimInput(raw);

  if (input.entities.length === 0) {
    return { title: 'Empty cluster', summary: 'No entity data available.', importance: 0 };
  }

  const apiKey = await getEffectiveSetting('anthropic_api_key');
  const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: 'You are a concise business analyst. Output only valid JSON.',
    prompt: buildSummaryPrompt(input),
    maxTokens: 400,
  });

  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      title: typeof parsed.title === 'string' ? parsed.title : 'Unnamed cluster',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      importance: typeof parsed.importance === 'number' ? Math.min(1, Math.max(0, parsed.importance)) : 0.5,
    };
  } catch {
    return { title: 'Unnamed cluster', summary: text.slice(0, 500), importance: 0.5 };
  }
}
