import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { buildQueryPlan } from '../chat/planner';
import { retrieveWithCorrection } from '../chat/retrieve';
import type { RetrievalResult, RetrievalMeta } from '../chat/retrieve';
import { streamChat, streamChatComposite } from '../chat/stream';
import { decomposeAndRetrieve } from '../chat/decompose';
import { embedQuery } from '../embeddings/voyage';
import {
  loadSessionSummaries,
  loadSessionDetail,
  deleteSession,
  setMessageFeedback,
  upsertSession,
  saveUserMessage,
} from '../chat/session';
import { recordRetrievalOutcome, detectImplicitNegative } from '../chat/outcomes';
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
  detectImplicitNegative(sessionId).catch(() => {});
  await saveUserMessage(sessionId, body.message);

  const [plan, queryEmbedding] = await Promise.all([
    buildQueryPlan(body.message),
    embedQuery(body.message).catch(() => [] as number[]),
  ]);

  let stream: ReadableStream;
  let retrievalMeta: RetrievalMeta | null = null;

  if (plan.isComposite && plan.subqueries.length > 1) {
    const decomposed = await decomposeAndRetrieve(plan.subqueries);
    stream = streamChatComposite(sessionId, body.message, plan, decomposed.mergedContext, decomposed.contextBlock);
  } else {
    let context: RetrievalResult = { events: [], stats: [], comparisons: [], communitySummaries: [], sqlResults: [], narratives: [], memoryEpisodes: [], causalLinks: [], resourceChunks: [] };
    let corrected = false;
    if (plan.requiresRetrieval) {
      const result = await retrieveWithCorrection(plan, queryEmbedding);
      context = result;
      corrected = result.corrected;
      retrievalMeta = result.meta;
    }
    stream = streamChat(sessionId, body.message, plan, context, corrected, (messageId) => {
      if (retrievalMeta) {
        const topIds = context.events.slice(0, 5).map((e) => e.id);
        recordRetrievalOutcome(
          messageId,
          sessionId,
          plan.intent,
          retrievalMeta.laneWeights as Record<string, number>,
          retrievalMeta.activeLanes as string[],
          topIds,
        ).catch(() => {});
      }
    });
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
});
