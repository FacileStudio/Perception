import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { config } from '../config';
import type { ChatSource } from '../types';
import type { QueryPlan } from './planner';
import type { RetrievalResult } from './retrieve';
import { buildSystemPrompt, buildContextBlock } from './prompt';

const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });

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
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO chat_messages (id, session_id, role, content, sources_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
    args: [randomUUID(), sessionId, content, JSON.stringify(sources), new Date().toISOString()],
  });
  await db.execute({
    sql: `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`,
    args: [new Date().toISOString(), sessionId],
  });
}

export function streamChat(
  sessionId: string,
  message: string,
  _plan: QueryPlan,
  context: RetrievalResult,
): ReadableStream {
  const contextBlock = buildContextBlock(context.events, context.stats);
  const systemPrompt = buildSystemPrompt();

  const sources: ChatSource[] = context.events.slice(0, 10).map((e) => ({
    event_id: e.id,
    provider_name: e.provider_name,
    occurred_at: e.occurred_at,
    title: e.title,
    score: e.score,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const history = await loadHistory(sessionId);

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...history,
          { role: 'user', content: `${contextBlock}\n\nUser question: ${message}` },
        ];

        const result = streamText({
          model: anthropic(config.llmModel),
          system: systemPrompt,
          messages,
        });

        let fullText = '';

        for await (const chunk of result.textStream) {
          fullText += chunk;
          const encoded = new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          controller.enqueue(encoded);
        }

        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true, sources })}\n\n`));
        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
        controller.close();

        await persistAssistantMessage(sessionId, fullText, sources);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return stream;
}
