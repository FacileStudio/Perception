import { randomUUID } from 'crypto';
import { db } from '../db/client';

export async function reinferAllSchemas(workspaceId: string = ''): Promise<number> {
  const wsSchemaClause = workspaceId ? ' WHERE ps.workspace_id = ?' : '';
  const wsEventClause = workspaceId ? ' AND e.workspace_id = ?' : '';
  const schemas = await db.execute({
    sql: `SELECT ps.provider_type, ps.event_type_pattern,
                 (SELECT e.id FROM events e WHERE e.provider_type = ps.provider_type${wsEventClause} LIMIT 1) AS sample_event_id
          FROM provider_schemas ps${wsSchemaClause}`,
    args: workspaceId ? [workspaceId, workspaceId] : [],
  });

  let queued = 0;
  for (const row of schemas.rows) {
    const providerType = row.provider_type as string;
    const eventType = (row.event_type_pattern as string | null) ?? providerType;
    const sampleEventId = row.sample_event_id as string | null;
    if (!sampleEventId) continue;

    const wsJobClause = workspaceId ? ' AND workspace_id = ?' : '';
    const existing = await db.execute({
      sql: `SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')${wsJobClause}`,
      args: workspaceId ? [providerType, eventType, workspaceId] : [providerType, eventType],
    });
    if (existing.rows.length > 0) continue;

    await db.execute({
      sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), providerType, eventType, sampleEventId, 'pending', new Date().toISOString(), workspaceId],
    });
    queued++;
  }

  return queued;
}
