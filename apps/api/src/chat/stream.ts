import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';
import type { ChatSource } from '../types';
import type { QueryPlan } from './planner';
import type { RetrievalResult } from './retrieve';
import { buildSystemPrompt, buildContextBlock } from './prompt';
import { fetchSystemSummary } from './retrieve';

interface ChatMessageRow {
  role: 'user' | 'assistant';
  content: string;
}

async function loadHistory(sessionId: string): Promise<ChatMessageRow[]> {
  const result = await db.execute({
    sql: `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 40`,
    args: [sessionId],
  });
  return result.rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
  })).reverse();
}

async function persistAssistantMessage(
  sessionId: string,
  content: string,
  sources: ChatSource[],
): Promise<string> {
  const messageId = randomUUID();
  await db.execute({
    sql: `INSERT INTO chat_messages (id, session_id, role, content, sources_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
    args: [messageId, sessionId, content, JSON.stringify(sources), new Date().toISOString()],
  });
  await db.execute({
    sql: `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`,
    args: [new Date().toISOString(), sessionId],
  });
  return messageId;
}

function trimLatestUserEcho(history: ChatMessageRow[], message: string): ChatMessageRow[] {
  const last = history.at(-1);
  if (last?.role === 'user' && last.content === message) {
    return history.slice(0, -1);
  }
  return history;
}

export function streamChat(
  sessionId: string,
  message: string,
  plan: QueryPlan,
  context: RetrievalResult,
  corrected = false,
): ReadableStream {
  let contextBlock = buildContextBlock(context.events, context.stats, context.comparisons, context.communitySummaries, context.sqlResults, context.narratives, context.memoryEpisodes, context.causalLinks);
  if (corrected) {
    contextBlock = '[CONTEXT_NOTE] Context was sparse — search was widened to find more relevant evidence. Some results may be from a broader scope than requested. [/CONTEXT_NOTE]\n\n' + contextBlock;
  }
  const systemPrompt = buildSystemPrompt(plan.retrievalMode);

  const signalEvents = context.events.filter((e) => e.lanes.some((l) => l !== 'sql'));
  const sourcePool = signalEvents.length > 0 ? signalEvents : context.events;
  const sources: ChatSource[] = plan.requiresRetrieval ? sourcePool.slice(0, 5).map((e) => ({
    event_id: e.id,
    provider_name: e.provider_name,
    occurred_at: e.occurred_at,
    title: e.title,
    score: e.score,
  })) : [];

  const sqlQueryMeta = context.sqlResults.length > 0
    ? { query: context.sqlResults[0].query, row_count: context.sqlResults[0].rowCount, columns: context.sqlResults[0].columns }
    : null;

  const communitySummariesMeta = context.communitySummaries.length > 0
    ? context.communitySummaries.map((cs) => ({ title: cs.title, summary: cs.summary, member_count: cs.memberCount, matched_entities: cs.matchedEntityNames }))
    : null;

  const narrativesMeta = context.narratives.length > 0
    ? context.narratives.map((n) => ({ entity_name: n.entityName, narrative: n.narrativeText, event_count: n.sourceEventCount }))
    : null;

  const memoryMeta = context.memoryEpisodes.length > 0
    ? context.memoryEpisodes.map((ep) => ({ summary: ep.summary, entities: ep.entityRefs, occurred: ep.occurredAt }))
    : null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`));
        const [history, systemSummary] = await Promise.all([
          loadHistory(sessionId).then((h) => trimLatestUserEcho(h, message)),
          plan.requiresRetrieval ? fetchSystemSummary() : Promise.resolve(''),
        ]);
        const promptMessage = plan.requiresRetrieval
          ? `${systemSummary}\n\n${contextBlock}\n\nUser question: ${message}`
          : message;

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...history,
          { role: 'user', content: promptMessage },
        ];

        const [apiKey, llmModel] = await Promise.all([
          getEffectiveSetting('anthropic_api_key'),
          getEffectiveSetting('llm_model'),
        ]);

        const anthropic = createAnthropic({ apiKey });
        const result = streamText({
          model: anthropic(llmModel),
          system: systemPrompt,
          messages,
        });

        let fullText = '';

        for await (const chunk of result.textStream) {
          fullText += chunk;
          const encoded = new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          controller.enqueue(encoded);
        }

        const messageId = await persistAssistantMessage(sessionId, fullText, sources);
        const donePayload: Record<string, unknown> = { done: true, sources, message_id: messageId };
        if (sqlQueryMeta) donePayload.sql_query = sqlQueryMeta;
        if (communitySummariesMeta) donePayload.community_summaries = communitySummariesMeta;
        if (narrativesMeta) donePayload.narratives = narrativesMeta;
        if (memoryMeta) donePayload.memory_episodes = memoryMeta;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(donePayload)}\n\n`));
        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
        controller.close();

        try {
          const usage = await result.usage;
          await db.execute({
            sql: `INSERT INTO token_usage (id, kind, model, session_id, input_tokens, output_tokens, occurred_at) VALUES (?, 'llm', ?, ?, ?, ?, ?)`,
            args: [randomUUID(), llmModel, sessionId, usage.promptTokens, usage.completionTokens, new Date().toISOString()],
          });
        } catch {
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return stream;
}
