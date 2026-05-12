import { randomUUID } from 'crypto';
import { db } from '../db/client';

export async function promoteToFixture(messageId: string, notes?: string, workspaceId: string = ''): Promise<string | null> {
  const wsFilter = workspaceId ? ' AND cm.workspace_id = ?' : '';
  const msgArgs: (string | number | null)[] = [messageId];
  if (workspaceId) msgArgs.push(workspaceId);
  const msg = await db.execute({
    sql: `SELECT cm.id, cm.session_id, cm.sources_json, cm.content,
                 (SELECT content FROM chat_messages WHERE session_id = cm.session_id AND role = 'user' AND created_at < cm.created_at ORDER BY created_at DESC LIMIT 1) AS user_question
          FROM chat_messages cm
          WHERE cm.id = ? AND cm.feedback = 'up'${wsFilter}`,
    args: msgArgs,
  });

  if (msg.rows.length === 0) return null;

  const row = msg.rows[0];
  const question = row.user_question as string;
  if (!question) return null;

  const sources = JSON.parse(row.sources_json as string) as Array<{ event_id: string }>;
  const eventIds = sources.map((s) => s.event_id);

  const fixtureId = randomUUID();
  await db.execute({
    sql: `INSERT INTO eval_fixtures (id, question, expected_event_ids, intent, notes, source_message_id, created_at, workspace_id) VALUES (?, ?, ?, 'narrative', ?, ?, ?, ?)`,
    args: [fixtureId, question, JSON.stringify(eventIds), notes ?? '', messageId, new Date().toISOString(), workspaceId],
  });

  return fixtureId;
}
