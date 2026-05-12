import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { QueryPlan } from './planner';

export async function recordRetrievalOutcome(
  messageId: string,
  sessionId: string,
  intent: QueryPlan['intent'],
  laneWeights: Record<string, number>,
  activeLanes: string[],
  topEventIds: string[],
  workspaceId: string = '',
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO retrieval_outcomes (id, workspace_id, message_id, session_id, intent, lane_weights, active_lanes, top_event_ids, occurred_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      workspaceId,
      messageId,
      sessionId,
      intent,
      JSON.stringify(laneWeights),
      JSON.stringify(activeLanes),
      JSON.stringify(topEventIds),
      new Date().toISOString(),
    ],
  });
}

export async function labelOutcome(
  messageId: string,
  label: 'up' | 'down' | 'implicit_negative',
  workspaceId: string = '',
): Promise<void> {
  if (label === 'implicit_negative') {
    await db.execute({
      sql: workspaceId
        ? `UPDATE retrieval_outcomes SET outcome_label = ? WHERE message_id = ? AND outcome_label IS NULL AND workspace_id = ?`
        : `UPDATE retrieval_outcomes SET outcome_label = ? WHERE message_id = ? AND outcome_label IS NULL`,
      args: workspaceId ? [label, messageId, workspaceId] : [label, messageId],
    });
  } else {
    await db.execute({
      sql: workspaceId
        ? `UPDATE retrieval_outcomes SET outcome_label = ? WHERE message_id = ? AND workspace_id = ?`
        : `UPDATE retrieval_outcomes SET outcome_label = ? WHERE message_id = ?`,
      args: workspaceId ? [label, messageId, workspaceId] : [label, messageId],
    });
  }
}

export async function clearOutcomeLabel(messageId: string, workspaceId: string = ''): Promise<void> {
  await db.execute({
    sql: workspaceId
      ? `UPDATE retrieval_outcomes SET outcome_label = NULL WHERE message_id = ? AND workspace_id = ?`
      : `UPDATE retrieval_outcomes SET outcome_label = NULL WHERE message_id = ?`,
    args: workspaceId ? [messageId, workspaceId] : [messageId],
  });
}

export async function detectImplicitNegative(sessionId: string, workspaceId: string = ''): Promise<void> {
  const result = await db.execute({
    sql: workspaceId
      ? `SELECT cm.id, cm.created_at
          FROM chat_messages cm
          WHERE cm.session_id = ? AND cm.role = 'assistant' AND cm.workspace_id = ?
          ORDER BY cm.created_at DESC
          LIMIT 1`
      : `SELECT cm.id, cm.created_at
          FROM chat_messages cm
          WHERE cm.session_id = ? AND cm.role = 'assistant'
          ORDER BY cm.created_at DESC
          LIMIT 1`,
    args: workspaceId ? [sessionId, workspaceId] : [sessionId],
  });

  if (result.rows.length === 0) return;

  const row = result.rows[0];
  const assistantTime = new Date(row.created_at as string).getTime();
  const now = Date.now();

  if (now - assistantTime < 30_000) {
    await labelOutcome(row.id as string, 'implicit_negative', workspaceId);
  }
}
