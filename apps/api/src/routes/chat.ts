import { Hono } from 'hono';
import { requireWorkspace } from '../security/workspace';
import { buildQueryPlan } from '../chat/planner';
import { retrieveWithCorrection } from '../chat/retrieve';
import type { RetrievalResult, RetrievalMeta } from '../chat/retrieve';
import { streamChat, streamChatComposite } from '../chat/stream';
import { decomposeAndRetrieve, type DecomposedResult } from '../chat/decompose';
import { getActiveWeights } from '../chat/lanes/merge';
import { runCounterfactual } from '../chat/counterfactual';
import { buildCounterfactualBlock, buildContextBlock } from '../chat/prompt';
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
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const sessions = await loadSessionSummaries(ws.workspaceId, ws.userId);
  return c.json({ sessions });
});

chatRoutes.get('/sessions/:sessionId', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const session = await loadSessionDetail(c.req.param('sessionId'), ws.workspaceId, ws.userId);
  if (!session) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({ session });
});

chatRoutes.delete('/sessions/:sessionId', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const sessionId = c.req.param('sessionId');
  const deleted = await deleteSession(sessionId, ws.workspaceId, ws.userId);
  if (!deleted) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({ ok: true, session_id: sessionId });
});

chatRoutes.patch('/messages/:messageId/feedback', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

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

  const result = await setMessageFeedback(messageId, body.feedback, ws.workspaceId);
  if (result === 'not_found') {
    return c.json({ error: 'not_found' }, 404);
  }
  if (result === 'invalid_role') {
    return c.json({ error: 'feedback_only_on_assistant_messages' }, 400);
  }

  return c.json({ ok: true });
});

chatRoutes.post('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  if (!body.message || typeof body.message !== 'string') {
    return c.json({ error: 'message_required' }, 400);
  }

  const sessionId = await upsertSession(body.session_id, ws.workspaceId, ws.userId);
  detectImplicitNegative(sessionId).catch(() => {});
  await saveUserMessage(sessionId, body.message, ws.workspaceId);

  const [plan, queryEmbedding] = await Promise.all([
    buildQueryPlan(body.message, ws.workspaceId),
    embedQuery(body.message, ws.workspaceId).catch(() => [] as number[]),
  ]);

  let stream: ReadableStream;
  let retrievalMeta: RetrievalMeta | null = null;

  if (plan.intent === 'counterfactual' && plan.counterfactual) {
    const [cfResult, retrievalResult] = await Promise.all([
      runCounterfactual(plan.counterfactual),
      retrieveWithCorrection(plan, queryEmbedding, ws.workspaceId),
    ]);
    const context = retrievalResult;
    retrievalMeta = retrievalResult.meta;

    const cfBlock = buildCounterfactualBlock(cfResult);
    const baseBlock = context.events.length > 0
      ? buildContextBlock(context.events, context.stats, context.comparisons, context.communitySummaries, context.sqlResults, context.narratives, context.memoryEpisodes, context.causalLinks, context.resourceChunks)
      : '';
    const fullBlock = cfBlock + (baseBlock ? '\n\n' + baseBlock : '');

    const cfMeta = {
      scenario: cfResult.scenario,
      confidence: cfResult.confidence,
      affected_count: cfResult.affectedEntities.length,
      causal_chain: cfResult.causalChain.map((s) => ({
        cause: s.cause,
        effect: s.effect,
        lag_days: s.lagDays,
        p_value: s.pValue,
        coefficient: s.coefficient,
      })),
      affected_entities: cfResult.affectedEntities.map((e) => ({
        series: e.series,
        direction: e.direction,
        magnitude: e.magnitude,
        probability: e.probability,
        lag_days: e.lagDays,
      })),
      distribution: cfResult.distribution,
    };

    stream = streamChatComposite(sessionId, body.message, plan, context, fullBlock, ws.workspaceId, (messageId) => {
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
    }, undefined, cfMeta);
  } else {

  let compositeResult: DecomposedResult | null = null;
  let compositeWeights: Record<string, number> = {};

  if (plan.isComposite && plan.subqueries.length > 1) {
    try {
      const { weights } = await getActiveWeights(ws.workspaceId);
      compositeWeights = (weights[plan.intent] ?? {}) as Record<string, number>;
      compositeResult = await decomposeAndRetrieve(plan.subqueries, ws.workspaceId);
    } catch (err) {
      console.warn('[chat] composite decomposition failed, falling back to simple retrieval', err);
    }
  }

  if (compositeResult) {
    stream = streamChatComposite(sessionId, body.message, plan, compositeResult.mergedContext, compositeResult.contextBlock, ws.workspaceId, (messageId) => {
      const topIds = compositeResult!.mergedContext.events.slice(0, 5).map((e) => e.id);
      const activeLanes = [...new Set(compositeResult!.mergedContext.events.flatMap((e) => e.lanes))];
      recordRetrievalOutcome(
        messageId,
        sessionId,
        plan.intent,
        compositeWeights,
        activeLanes as string[],
        topIds,
      ).catch(() => {});
    }, compositeResult.subqueries);
  } else {
    let context: RetrievalResult = { events: [], stats: [], comparisons: [], communitySummaries: [], sqlResults: [], narratives: [], memoryEpisodes: [], causalLinks: [], resourceChunks: [] };
    let corrected = false;
    if (plan.requiresRetrieval) {
      const result = await retrieveWithCorrection(plan, queryEmbedding, ws.workspaceId);
      context = result;
      corrected = result.corrected;
      retrievalMeta = result.meta;
    }
    stream = streamChat(sessionId, body.message, plan, context, corrected, ws.workspaceId, (messageId) => {
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

  } // end counterfactual else

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
});
