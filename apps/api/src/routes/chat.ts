import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { buildQueryPlan } from '../chat/planner';
import { retrieveWithCorrection } from '../chat/retrieve';
import type { RetrievalResult } from '../chat/retrieve';
import { streamChat } from '../chat/stream';
import { embedQuery } from '../embeddings/voyage';
import {
  loadSessionSummaries,
  loadSessionDetail,
  deleteSession,
  setMessageFeedback,
  upsertSession,
  saveUserMessage,
} from '../chat/session';
import type { ChatRequest } from '../types';

export const chatRoutes = new Hono();

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
  const deleted = await deleteSession(sessionId);
  if (!deleted) {
    return c.json({ error: 'not_found' }, 404);
  }

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

  const result = await setMessageFeedback(messageId, body.feedback);
  if (result === 'not_found') {
    return c.json({ error: 'not_found' }, 404);
  }
  if (result === 'invalid_role') {
    return c.json({ error: 'feedback_only_on_assistant_messages' }, 400);
  }

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
  await saveUserMessage(sessionId, body.message);

  const [plan, queryEmbedding] = await Promise.all([
    buildQueryPlan(body.message),
    embedQuery(body.message).catch(() => [] as number[]),
  ]);

  let context: RetrievalResult = { events: [], stats: [], comparisons: [], communitySummaries: [], sqlResults: [], narratives: [] };
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
