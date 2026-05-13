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

async function loadHistory(sessionId: string, workspaceId: string = ''): Promise<ChatMessageRow[]> {
  const wsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  const result = await db.execute({
    sql: `SELECT role, content FROM chat_messages WHERE session_id = ?${wsAnd} ORDER BY created_at DESC LIMIT 40`,
    args: workspaceId ? [sessionId, workspaceId] : [sessionId],
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
  workspaceId: string = '',
): Promise<string> {
  const messageId = randomUUID();
  await db.execute({
    sql: `INSERT INTO chat_messages (id, session_id, workspace_id, role, content, sources_json, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?)`,
    args: [messageId, sessionId, workspaceId, content, JSON.stringify(sources), new Date().toISOString()],
  });
  const wsAnd = workspaceId ? ' AND workspace_id = ?' : '';
  await db.execute({
    sql: `UPDATE chat_sessions SET updated_at = ? WHERE id = ?${wsAnd}`,
    args: workspaceId ? [new Date().toISOString(), sessionId, workspaceId] : [new Date().toISOString(), sessionId],
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

export type CounterfactualMeta = {
  scenario: string;
  confidence: string;
  affected_count: number;
  causal_chain: Array<{ cause: string; effect: string; lag_days: number; p_value: number; coefficient: number }>;
  affected_entities: Array<{ series: string; direction: string; magnitude: number; probability: number; lag_days: number }>;
  distribution: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
};

export function streamChatComposite(
  sessionId: string,
  message: string,
  plan: QueryPlan,
  context: RetrievalResult,
  prebuiltContextBlock: string,
  workspaceId: string = '',
  onMessagePersisted?: (messageId: string) => void,
  subQueries?: string[],
  counterfactual?: CounterfactualMeta,
): ReadableStream {
  return buildStream(sessionId, message, plan, context, prebuiltContextBlock, workspaceId, onMessagePersisted, subQueries, counterfactual);
}

export function streamChat(
  sessionId: string,
  message: string,
  plan: QueryPlan,
  context: RetrievalResult,
  corrected = false,
  workspaceId: string = '',
  onMessagePersisted?: (messageId: string) => void,
): ReadableStream {
  let contextBlock = buildContextBlock(context.events, context.stats, context.comparisons, context.communitySummaries, context.sqlResults, context.narratives, context.memoryEpisodes, context.causalLinks, context.resourceChunks);
  if (corrected) {
    contextBlock = '[CONTEXT_NOTE] Context was sparse — search was widened to find more relevant evidence. Some results may be from a broader scope than requested. [/CONTEXT_NOTE]\n\n' + contextBlock;
  }
  return buildStream(sessionId, message, plan, context, contextBlock, workspaceId, onMessagePersisted);
}

function buildStream(
  sessionId: string,
  message: string,
  plan: QueryPlan,
  context: RetrievalResult,
  contextBlock: string,
  workspaceId: string = '',
  onMessagePersisted?: (messageId: string) => void,
  subQueries?: string[],
  counterfactual?: CounterfactualMeta,
): ReadableStream {
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

  const resourcesMeta = context.resourceChunks.length > 0
    ? context.resourceChunks.map((rc) => ({ title: rc.resourceTitle, chunk_index: rc.chunkIndex, content: rc.content.slice(0, 200) }))
    : null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`));
        const [history, systemSummary] = await Promise.all([
          loadHistory(sessionId, workspaceId).then((h) => trimLatestUserEcho(h, message)),
          plan.requiresRetrieval ? fetchSystemSummary(workspaceId) : Promise.resolve(''),
        ]);
        const promptMessage = plan.requiresRetrieval
          ? `${systemSummary}\n\n${contextBlock}\n\nUser question: ${message}`
          : message;

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...history,
          { role: 'user', content: promptMessage },
        ];

        const [apiKey, llmModel] = await Promise.all([
          getEffectiveSetting('anthropic_api_key', workspaceId),
          getEffectiveSetting('llm_model', workspaceId),
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

        const messageId = await persistAssistantMessage(sessionId, fullText, sources, workspaceId);
        if (onMessagePersisted) onMessagePersisted(messageId);
        const donePayload: Record<string, unknown> = { done: true, sources, message_id: messageId };
        if (sqlQueryMeta) donePayload.sql_query = sqlQueryMeta;
        if (communitySummariesMeta) donePayload.community_summaries = communitySummariesMeta;
        if (narrativesMeta) donePayload.narratives = narrativesMeta;
        if (memoryMeta) donePayload.memory_episodes = memoryMeta;
        if (resourcesMeta) donePayload.resources = resourcesMeta;
        if (subQueries?.length) donePayload.sub_queries = subQueries;
        if (counterfactual) donePayload.counterfactual = counterfactual;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(donePayload)}\n\n`));
        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
        controller.close();

        try {
          const usage = await result.usage;
          await db.execute({
            sql: `INSERT INTO token_usage (id, workspace_id, kind, model, session_id, input_tokens, output_tokens, occurred_at) VALUES (?, ?, 'llm', ?, ?, ?, ?, ?)`,
            args: [randomUUID(), workspaceId, llmModel, sessionId, usage.promptTokens, usage.completionTokens, new Date().toISOString()],
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
