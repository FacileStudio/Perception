import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

type EntityContext = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  eventCount: number;
  recentEvents: Array<{ title: string; summary: string; occurred_at: string; provider: string }>;
  relations: Array<{ name: string; type: string; label: string }>;
  communityTitle: string | null;
};

export async function loadEntityContext(entityId: string): Promise<EntityContext | null> {
  const entityRow = await db.execute({
    sql: `SELECT e.id, e.canonical_name AS name, oc.label AS type, e.description,
            (SELECT COUNT(*) FROM event_entities ee WHERE ee.entity_id = e.id) AS event_count
          FROM entities e
          JOIN ontology_concepts oc ON oc.id = e.type_concept_id
          WHERE e.id = ?`,
    args: [entityId],
  });

  if (entityRow.rows.length === 0) return null;
  const entity = entityRow.rows[0];

  const [eventRows, relationRows, communityRows] = await Promise.all([
    db.execute({
      sql: `SELECT ev.title, ev.summary, ev.occurred_at, ev.provider_name AS provider
            FROM events ev
            JOIN event_entities ee ON ee.event_id = ev.id
            WHERE ee.entity_id = ?
            ORDER BY ev.occurred_at DESC LIMIT 20`,
      args: [entityId],
    }),
    db.execute({
      sql: `SELECT ent.canonical_name AS name, oc_type.label AS type, oc_rel.label AS relation
            FROM entity_relations er
            JOIN entities ent ON ent.id = er.to_entity_id
            JOIN ontology_concepts oc_type ON oc_type.id = ent.type_concept_id
            JOIN ontology_concepts oc_rel ON oc_rel.id = er.relation_concept_id
            WHERE er.from_entity_id = ?
            UNION
            SELECT ent.canonical_name AS name, oc_type.label AS type, oc_rel.label AS relation
            FROM entity_relations er
            JOIN entities ent ON ent.id = er.from_entity_id
            JOIN ontology_concepts oc_type ON oc_type.id = ent.type_concept_id
            JOIN ontology_concepts oc_rel ON oc_rel.id = er.relation_concept_id
            WHERE er.to_entity_id = ?`,
      args: [entityId, entityId],
    }),
    db.execute({
      sql: `SELECT title FROM entity_communities WHERE stale = 0 AND member_entity_ids LIKE '%' || ? || '%' LIMIT 1`,
      args: [entityId],
    }),
  ]);

  return {
    id: entity.id as string,
    name: entity.name as string,
    type: entity.type as string,
    description: entity.description as string | null,
    eventCount: Number(entity.event_count),
    recentEvents: eventRows.rows.map((r) => ({
      title: r.title as string,
      summary: r.summary as string,
      occurred_at: r.occurred_at as string,
      provider: r.provider as string,
    })),
    relations: relationRows.rows.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      label: r.relation as string,
    })),
    communityTitle: communityRows.rows.length > 0 ? communityRows.rows[0].title as string : null,
  };
}

function buildNarrativePrompt(ctx: EntityContext): string {
  const events = ctx.recentEvents
    .map((e) => `- [${e.occurred_at.slice(0, 10)}] ${e.title} (${e.provider}): ${e.summary}`)
    .join('\n');

  const relations = ctx.relations.length > 0
    ? ctx.relations.map((r) => `- ${r.name} (${r.type}) — ${r.label.replace(/_/g, ' ')}`).join('\n')
    : '(none)';

  const community = ctx.communityTitle ? `Part of cluster: "${ctx.communityTitle}"` : '';

  return `Write a concise operational narrative for this business entity.

Entity: ${ctx.name}
Type: ${ctx.type}
${ctx.description ? `Description: ${ctx.description}` : ''}
Total events: ${ctx.eventCount}
${community}

Related entities:
${relations}

Recent activity (newest first):
${events || '(no recent events)'}

Write 3-5 sentences. Cover:
1. What this entity is and its role in operations
2. Key relationships and dependencies
3. Recent activity patterns and current state
4. Any notable trends or concerns

Be specific — name related entities, cite dates, reference providers. Do not speculate beyond the data. Output plain text only, no markdown.`;
}

export async function generateNarrative(entityId: string): Promise<{ text: string; sourceEventCount: number } | null> {
  const ctx = await loadEntityContext(entityId);
  if (!ctx || ctx.eventCount === 0) return null;

  const apiKey = await getEffectiveSetting('anthropic_api_key');
  const anthropic = createAnthropic({ apiKey: apiKey ?? undefined });

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: 'You are a concise business analyst writing operational summaries. Plain text only, no markdown.',
    prompt: buildNarrativePrompt(ctx),
    maxTokens: 500,
  });

  return { text: text.trim(), sourceEventCount: ctx.eventCount };
}
