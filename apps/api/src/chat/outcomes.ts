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
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO retrieval_outcomes (id, message_id, session_id, intent, lane_weights, active_lanes, top_event_ids, occurred_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
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
): Promise<void> {
  await db.execute({
    sql: `UPDATE retrieval_outcomes SET outcome_label = ? WHERE message_id = ? AND outcome_label IS NULL`,
    args: [label, messageId],
  });
}

export async function detectImplicitNegative(sessionId: string): Promise<void> {
  const result = await db.execute({
    sql: `SELECT cm.id, cm.created_at
          FROM chat_messages cm
          WHERE cm.session_id = ? AND cm.role = 'assistant'
          ORDER BY cm.created_at DESC
          LIMIT 1`,
    args: [sessionId],
  });

  if (result.rows.length === 0) return;

  const row = result.rows[0];
  const assistantTime = new Date(row.created_at as string).getTime();
  const now = Date.now();

  if (now - assistantTime < 30_000) {
    await labelOutcome(row.id as string, 'implicit_negative');
  }
}
