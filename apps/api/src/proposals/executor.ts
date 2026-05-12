import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { getAdapter } from './adapters';
import type { ActionProposal } from './types';

export async function executeProposal(proposal: ActionProposal): Promise<void> {
  const adapter = getAdapter(proposal.action_type);
  const now = new Date().toISOString();

  if (!adapter) {
    await db.execute({
      sql: `UPDATE action_proposals SET status = 'failed', resolved_at = ?, executed_result = ? WHERE id = ?`,
      args: [now, `No adapter found for action_type: ${proposal.action_type}`, proposal.id],
    });
    return;
  }

  try {
    const result = await adapter.execute(proposal);

    await db.execute({
      sql: `UPDATE action_proposals SET status = 'executed', resolved_at = ?, executed_result = ? WHERE id = ?`,
      args: [now, result, proposal.id],
    });

    await db.execute({
      sql: `INSERT INTO events (
              id, schema_version, source, provider_id, provider_type, provider_name,
              event_type, entity_type, entity_id, entity_name, actor_name, actor_email_hash,
              status, due_at, completed_at,
              occurred_at, emitted_at, ingested_at, url, title, summary, searchable_text,
              payload_redacted_json, payload_hash, quality
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        'system',
        'perception-actions',
        'perception-actions',
        'Perception Actions',
        `proposal_${proposal.action_type}`,
        null,
        proposal.target_entity_id,
        proposal.target_entity_name,
        null,
        null,
        'executed',
        null,
        null,
        now,
        now,
        now,
        null,
        `Executed: ${proposal.title}`,
        `Action proposal executed. Result: ${result}`,
        `${proposal.title} ${proposal.description} ${result}`,
        JSON.stringify({ proposal_id: proposal.id, action_type: proposal.action_type, target_provider: proposal.target_provider, result }),
        null,
        1.0,
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.execute({
      sql: `UPDATE action_proposals SET status = 'failed', resolved_at = ?, executed_result = ? WHERE id = ?`,
      args: [now, `Error: ${message}`, proposal.id],
    });
  }
}
