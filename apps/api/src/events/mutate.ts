import { db } from '../db/client';

export async function deleteEvent(id: string, workspaceId?: string): Promise<boolean> {
  const wsCondition = workspaceId ? ' AND workspace_id = ?' : '';
  const wsArgs = workspaceId ? [workspaceId] : [];
  const eventRow = await db.execute({
    sql: `SELECT rowid, title, summary, searchable_text FROM events WHERE id = ?${wsCondition}`,
    args: [id, ...wsArgs],
  });
  if (eventRow.rows.length === 0) return false;

  const { rowid, title, summary, searchable_text } = eventRow.rows[0];

  const linkedEntities = await db.execute({
    sql: 'SELECT DISTINCT entity_id FROM event_entities WHERE event_id = ?',
    args: [id],
  });
  const entityIds = linkedEntities.rows.map((r) => r.entity_id as string);

  await db.execute({
    sql: 'INSERT INTO event_fts(event_fts, rowid, title, summary, searchable_text) VALUES(?, ?, ?, ?, ?)',
    args: ['delete', rowid, title, summary, searchable_text],
  });

  await db.execute({ sql: 'DELETE FROM events WHERE id = ?', args: [id] });

  for (const entityId of entityIds) {
    const remaining = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM event_entities WHERE entity_id = ?',
      args: [entityId],
    });
    if ((remaining.rows[0].cnt as number) === 0) {
      await db.execute({ sql: 'DELETE FROM entities WHERE id = ?', args: [entityId] });
    }
  }

  return true;
}
