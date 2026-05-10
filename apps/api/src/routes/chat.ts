import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import { buildQueryPlan } from '../chat/planner';
import { retrieveWithCorrection } from '../chat/retrieve';
import type { RetrievalResult } from '../chat/retrieve';
import { streamChat } from '../chat/stream';
import { embedQuery } from '../embeddings/voyage';
import type { ChatMessageRecord, ChatRequest, ChatSessionDetail, ChatSessionSummary, ChatSource } from '../types';

export const chatRoutes = new Hono();

function normalizeChatText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, ' ')
    .replace(/`{1,3}/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`;
}

function buildSessionTitle(value: string): string {
  const normalized = normalizeChatText(value);
  return truncateText(normalized || 'New chat', 72);
}

function buildSessionPreview(value: string | null): string {
  if (!value) {
    return '';
  }
  return truncateText(normalizeChatText(value), 110);
}

async function upsertSession(sessionId: string | undefined): Promise<string> {
  if (sessionId) {
    const result = await db.execute({
      sql: `SELECT id FROM chat_sessions WHERE id = ?`,
      args: [sessionId],
    });
    if (result.rows.length > 0) return sessionId;
  }

  const id = sessionId ?? randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, NULL, ?, ?)`,
    args: [id, now, now],
  });
  return id;
}

function parseSources(value: unknown): ChatSource[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as ChatSource[] : [];
  } catch {
    return [];
  }
}

async function loadSessionSummaries(): Promise<ChatSessionSummary[]> {
  const result = await db.execute(`
    SELECT
      cs.id,
      cs.title,
      cs.created_at,
      cs.updated_at,
      (
        SELECT content
        FROM chat_messages
        WHERE session_id = cs.id AND role = 'user'
        ORDER BY created_at ASC
        LIMIT 1
      ) AS first_user_content,
      (
        SELECT content
        FROM chat_messages
        WHERE session_id = cs.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS last_message_content,
      (
        SELECT COUNT(*)
        FROM chat_messages
        WHERE session_id = cs.id
      ) AS message_count
    FROM chat_sessions cs
    WHERE EXISTS (
      SELECT 1
      FROM chat_messages
      WHERE session_id = cs.id
    )
    ORDER BY cs.updated_at DESC
    LIMIT 100
  `);

  return result.rows.map((row) => ({
    id: row.id as string,
    title: buildSessionTitle((row.title as string | null) ?? (row.first_user_content as string | null) ?? 'New chat'),
    preview: buildSessionPreview(row.last_message_content as string | null),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    message_count: Number(row.message_count ?? 0),
  }));
}

async function loadSessionDetail(sessionId: string): Promise<ChatSessionDetail | null> {
  const sessionResult = await db.execute({
    sql: `
      SELECT
        id,
        title,
        created_at,
        updated_at
      FROM chat_sessions
      WHERE id = ?
    `,
    args: [sessionId],
  });

  const sessionRow = sessionResult.rows[0];
  if (!sessionRow) {
    return null;
  }

  const messagesResult = await db.execute({
    sql: `
      SELECT
        id,
        role,
        content,
        sources_json,
        feedback,
        created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `,
    args: [sessionId],
  });

  const messages: ChatMessageRecord[] = messagesResult.rows.map((row) => ({
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
    sources: parseSources(row.sources_json),
    feedback: (row.feedback as 'up' | 'down' | null) ?? null,
    created_at: row.created_at as string,
  }));

  const firstUserMessage = messages.find((message) => message.role === 'user')?.content ?? 'New chat';

  return {
    id: sessionRow.id as string,
    title: buildSessionTitle((sessionRow.title as string | null) ?? firstUserMessage),
    created_at: sessionRow.created_at as string,
    updated_at: sessionRow.updated_at as string,
    messages,
  };
}

chatRoutes.get('/sessions', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const sessions = await loadSessionSummaries();
  return c.json({ sessions });
});

chatRoutes.get('/sessions/:sessionId', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const session = await loadSessionDetail(c.req.param('sessionId'));
  if (!session) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({ session });
});

chatRoutes.delete('/sessions/:sessionId', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const sessionId = c.req.param('sessionId');
  const existing = await db.execute({
    sql: `SELECT id FROM chat_sessions WHERE id = ?`,
    args: [sessionId],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: 'not_found' }, 404);
  }

  await db.execute({
    sql: `DELETE FROM chat_messages WHERE session_id = ?`,
    args: [sessionId],
  });
  await db.execute({
    sql: `DELETE FROM chat_sessions WHERE id = ?`,
    args: [sessionId],
  });

  return c.json({ ok: true, session_id: sessionId });
});

chatRoutes.patch('/messages/:messageId/feedback', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const messageId = c.req.param('messageId');
  let body: { feedback: 'up' | 'down' | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (body.feedback !== null && body.feedback !== 'up' && body.feedback !== 'down') {
    return c.json({ error: 'invalid_feedback' }, 400);
  }

  const existing = await db.execute({
    sql: `SELECT id, role FROM chat_messages WHERE id = ?`,
    args: [messageId],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: 'not_found' }, 404);
  }

  if (existing.rows[0].role !== 'assistant') {
    return c.json({ error: 'feedback_only_on_assistant_messages' }, 400);
  }

  await db.execute({
    sql: `UPDATE chat_messages SET feedback = ? WHERE id = ?`,
    args: [body.feedback, messageId],
  });

  return c.json({ ok: true });
});

chatRoutes.post('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body.message || typeof body.message !== 'string') {
    return c.json({ error: 'message_required' }, 400);
  }

  const sessionId = await upsertSession(body.session_id);

  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO chat_messages (id, session_id, role, content, sources_json, created_at) VALUES (?, ?, 'user', ?, '[]', ?)`,
    args: [randomUUID(), sessionId, body.message, now],
  });
  await db.execute({
    sql: `UPDATE chat_sessions SET title = COALESCE(NULLIF(title, ''), ?), updated_at = ? WHERE id = ?`,
    args: [buildSessionTitle(body.message), now, sessionId],
  });

  const [plan, queryEmbedding] = await Promise.all([
    buildQueryPlan(body.message),
    embedQuery(body.message).catch(() => [] as number[]),
  ]);

  let context: RetrievalResult = { events: [], stats: [] };
  let corrected = false;
  if (plan.requiresRetrieval) {
    const result = await retrieveWithCorrection(plan, queryEmbedding);
    context = result;
    corrected = result.corrected;
  }
  const stream = streamChat(sessionId, body.message, plan, context, corrected);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
});
