import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { InValue } from '@libsql/client';
import { requireWorkspace } from '../security/workspace';
import { db } from '../db/client';
import { executeProposal } from '../proposals/executor';
import type { ActionProposal } from '../proposals/types';

export const proposalRoutes = new Hono();

const VALID_ACTION_TYPES = ['create_task', 'tag_client', 'annotate_contract'];

function safeParseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function rowToProposal(r: Record<string, unknown>): ActionProposal {
  return {
    id: r.id as string,
    action_type: r.action_type as ActionProposal['action_type'],
    target_provider: r.target_provider as string,
    target_entity_id: r.target_entity_id as string | null,
    target_entity_name: r.target_entity_name as string | null,
    title: r.title as string,
    description: r.description as string,
    payload: safeParseJson(r.payload as string),
    confidence: r.confidence as number,
    status: r.status as ActionProposal['status'],
    proposed_at: r.proposed_at as string,
    resolved_at: r.resolved_at as string | null,
    executed_result: r.executed_result as string | null,
  };
}

proposalRoutes.get('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const status = c.req.query('status');
  const args: InValue[] = [ws.workspaceId];
  let where = 'WHERE workspace_id = ?';

  if (status) {
    where += ' AND status = ?';
    args.push(status);
  }

  args.push(100);

  const result = await db.execute({
    sql: `SELECT * FROM action_proposals ${where} ORDER BY proposed_at DESC LIMIT ?`,
    args,
  });

  const proposals = result.rows.map(r => rowToProposal(r as Record<string, unknown>));
  return c.json({ proposals });
});

proposalRoutes.patch('/:id/approve', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const updateResult = await db.execute({
    sql: `UPDATE action_proposals SET status = 'approved' WHERE id = ? AND workspace_id = ? AND status = 'proposed'`,
    args: [id, ws.workspaceId],
  });

  if (updateResult.rowsAffected === 0) {
    return c.json({ error: 'proposal_not_found_or_not_proposed' }, 404);
  }

  const result = await db.execute({ sql: `SELECT * FROM action_proposals WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });
  const proposal = rowToProposal(result.rows[0] as Record<string, unknown>);

  await executeProposal(proposal);

  const updated = await db.execute({ sql: `SELECT * FROM action_proposals WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });
  const final = rowToProposal(updated.rows[0] as Record<string, unknown>);

  return c.json({ proposal: final });
});

proposalRoutes.patch('/:id/dismiss', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `UPDATE action_proposals SET status = 'dismissed', resolved_at = ? WHERE id = ? AND workspace_id = ? AND status = 'proposed'`,
    args: [now, id, ws.workspaceId],
  });

  if (result.rowsAffected === 0) {
    return c.json({ error: 'proposal_not_found_or_not_proposed' }, 404);
  }

  return c.json({ ok: true });
});

proposalRoutes.post('/', async (c) => {
  const ws = await requireWorkspace(c);
  if (!ws) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{
    action_type: string;
    target_provider: string;
    target_entity_id?: string;
    target_entity_name?: string;
    title: string;
    description: string;
    payload?: Record<string, unknown>;
    confidence?: number;
  }>();

  if (!body.action_type || !body.target_provider || !body.title || !body.description) {
    return c.json({ error: 'missing_required_fields' }, 400);
  }

  if (!VALID_ACTION_TYPES.includes(body.action_type)) {
    return c.json({ error: 'invalid_action_type' }, 400);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO action_proposals (id, workspace_id, action_type, target_provider, target_entity_id, target_entity_name, title, description, payload, confidence, status, proposed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
    args: [
      id,
      ws.workspaceId,
      body.action_type,
      body.target_provider,
      body.target_entity_id ?? null,
      body.target_entity_name ?? null,
      body.title,
      body.description,
      JSON.stringify(body.payload ?? {}),
      body.confidence ?? 0.5,
      now,
    ],
  });

  const result = await db.execute({ sql: `SELECT * FROM action_proposals WHERE id = ? AND workspace_id = ?`, args: [id, ws.workspaceId] });
  const proposal = rowToProposal(result.rows[0] as Record<string, unknown>);

  return c.json({ proposal }, 201);
});
