import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { config } from '../config';
import type { InferredFieldMapping } from '../types';

const FIELD_MAPPING_TYPE_DEF = `
type InferredFieldMapping = {
  source_key: string;       // key in the normalized payload
  target_key: string;       // snake_case semantic target
  type: "text" | "date_iso" | "number" | "boolean" | "hash_email";
  role: "status" | "id" | "name" | "actor" | "date" | "url" | "count" | "other";
  confidence: number;       // 0.0 to 1.0
};
`.trim();

function isValidMapping(
  m: unknown,
  validKeys: Set<string>,
): m is InferredFieldMapping {
  if (typeof m !== 'object' || m === null) return false;
  const obj = m as Record<string, unknown>;
  if (typeof obj.source_key !== 'string' || !validKeys.has(obj.source_key)) return false;
  if (typeof obj.target_key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(obj.target_key)) return false;
  if (!['text', 'date_iso', 'number', 'boolean', 'hash_email'].includes(obj.type as string)) return false;
  if (!['status', 'id', 'name', 'actor', 'date', 'url', 'count', 'other'].includes(obj.role as string)) return false;
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) return false;
  return true;
}

export async function inferSchema(
  providerType: string,
  eventType: string,
  normalizedSample: Record<string, unknown>,
): Promise<InferredFieldMapping[]> {
  const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });

  const userPrompt = [
    `Provider type: ${providerType}`,
    `Event type: ${eventType}`,
    '',
    'Payload sample:',
    JSON.stringify(normalizedSample, null, 2),
    '',
    'TypeScript type definition:',
    FIELD_MAPPING_TYPE_DEF,
    '',
    'Return a JSON array of InferredFieldMapping objects — no markdown, no explanation.',
  ].join('\n');

  const { text, usage } = await generateText({
    model: anthropic(config.llmModel),
    system:
      'You are a schema inference engine. Map provider event payload fields to a structured field mapping schema. Return valid JSON only.\n' +
      'Role guidance: use "actor" for fields that identify the human or system who triggered/initiated the event (e.g. triggered_by, user, initiator, created_by, actor, sender, author). ' +
      'Use "status" for fields representing state. Use "name" for entity/subject names. Use "id" for identifiers. Use "other" when unsure.',
    prompt: userPrompt,
  });

  if (usage?.promptTokens || usage?.completionTokens) {
    db.execute({
      sql: `INSERT INTO token_usage (id, kind, model, session_id, input_tokens, output_tokens, occurred_at) VALUES (?, 'llm', ?, NULL, ?, ?, ?)`,
      args: [randomUUID(), config.llmModel, usage.promptTokens ?? 0, usage.completionTokens ?? 0, new Date().toISOString()],
    }).catch(() => {});
  }

  let parsed: unknown;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const validKeys = new Set(Object.keys(normalizedSample));
  return parsed.filter((m) => isValidMapping(m, validKeys));
}
