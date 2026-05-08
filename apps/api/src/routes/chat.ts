import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import { buildQueryPlan } from '../chat/planner';
import { retrieveContext } from '../chat/retrieve';
import { streamChat } from '../chat/stream';
import { embedQuery } from '../embeddings/voyage';
import type { ChatRequest } from '../types';

export const chatRoutes = new Hono();

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

  const plan = buildQueryPlan(body.message);

  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await embedQuery(body.message);
  } catch {
    queryEmbedding = [];
  }

  const context = await retrieveContext(plan, queryEmbedding);
  const stream = streamChat(sessionId, body.message, plan, context);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
});
