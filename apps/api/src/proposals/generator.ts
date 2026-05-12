import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import type { ActionType } from './types';

type RawProposal = {
  action_type: ActionType;
  target_provider: string;
  target_entity_id: string | null;
  target_entity_name: string | null;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  confidence: number;
};

async function hasOpenProposal(actionType: ActionType, entityId: string | null): Promise<boolean> {
  if (!entityId) return false;
  const result = await db.execute({
    sql: `SELECT id FROM action_proposals
          WHERE action_type = ? AND target_entity_id = ? AND status IN ('proposed', 'approved')
          LIMIT 1`,
    args: [actionType, entityId],
  });
  return result.rows.length > 0;
}

async function detectSilentClients(): Promise<RawProposal[]> {
  const cutoff = new Date(Date.now() - 45 * 86400000).toISOString();
  const rows = await db.execute({
    sql: `SELECT e.id, e.canonical_name, oc.label as type_label
          FROM entities e
          JOIN ontology_concepts oc ON e.type_concept_id = oc.id
          WHERE LOWER(oc.label) LIKE '%client%'
            AND e.id NOT IN (
              SELECT DISTINCT ee.entity_id FROM event_entities ee
              JOIN events ev ON ee.event_id = ev.id
              WHERE ev.occurred_at > ?
            )`,
    args: [cutoff],
  });

  return rows.rows.map(r => ({
    action_type: 'create_task' as ActionType,
    target_provider: 'vikunja',
    target_entity_id: r.id as string,
    target_entity_name: r.canonical_name as string,
    title: `Follow up with ${r.canonical_name}`,
    description: `No activity detected for ${r.canonical_name} in the last 45 days. Consider reaching out.`,
    payload: { entity_id: r.id, entity_name: r.canonical_name },
    confidence: 0.7,
  }));
}

async function detectAtRiskClients(): Promise<RawProposal[]> {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(now - 60 * 86400000).toISOString();

  const rows = await db.execute({
    sql: `SELECT
            e.id, e.canonical_name,
            COUNT(CASE WHEN ev.occurred_at > ? THEN 1 END) as recent_count,
            COUNT(CASE WHEN ev.occurred_at <= ? AND ev.occurred_at > ? THEN 1 END) as previous_count
          FROM entities e
          JOIN ontology_concepts oc ON e.type_concept_id = oc.id
          JOIN event_entities ee ON ee.entity_id = e.id
          JOIN events ev ON ee.event_id = ev.id
          WHERE LOWER(oc.label) LIKE '%client%'
            AND ev.occurred_at > ?
          GROUP BY e.id
          HAVING previous_count > 0`,
    args: [thirtyDaysAgo, thirtyDaysAgo, sixtyDaysAgo, sixtyDaysAgo],
  });

  const proposals: RawProposal[] = [];
  for (const r of rows.rows) {
    const recent = Number(r.recent_count);
    const previous = Number(r.previous_count);
    if (previous > 0 && recent / previous < 0.5) {
      proposals.push({
        action_type: 'tag_client',
        target_provider: 'charles',
        target_entity_id: r.id as string,
        target_entity_name: r.canonical_name as string,
        title: `Tag ${r.canonical_name} as at-risk`,
        description: `Activity dropped ${Math.round((1 - recent / previous) * 100)}% (${previous} → ${recent} events). Consider tagging as at-risk.`,
        payload: { entity_id: r.id, entity_name: r.canonical_name, recent_count: recent, previous_count: previous },
        confidence: 0.65,
      });
    }
  }
  return proposals;
}

async function detectUnsignedContracts(): Promise<RawProposal[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const rows = await db.execute({
    sql: `SELECT e.id, e.event_type, e.entity_id, e.entity_name, e.title, e.occurred_at
          FROM events e
          WHERE e.provider_type = 'docuseal'
            AND LOWER(e.event_type) LIKE '%sent%'
            AND e.occurred_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM events e2
              WHERE e2.provider_type = 'docuseal'
                AND LOWER(e2.event_type) LIKE '%completed%'
                AND e2.entity_id = e.entity_id
                AND e2.occurred_at > e.occurred_at
            )`,
    args: [fourteenDaysAgo],
  });

  return rows.rows.map(r => ({
    action_type: 'annotate_contract' as ActionType,
    target_provider: 'docuseal',
    target_entity_id: r.entity_id as string | null,
    target_entity_name: r.entity_name as string | null,
    title: `Unsigned contract: ${r.title ?? r.entity_name ?? 'unknown'}`,
    description: `Contract sent on ${r.occurred_at} has not been completed after 14 days.`,
    payload: { event_id: r.id, entity_id: r.entity_id, sent_at: r.occurred_at },
    confidence: 0.8,
  }));
}

export async function generateProposals(): Promise<RawProposal[]> {
  const [silent, atRisk, unsigned] = await Promise.all([
    detectSilentClients(),
    detectAtRiskClients(),
    detectUnsignedContracts(),
  ]);

  const all = [...silent, ...atRisk, ...unsigned];
  const deduplicated: RawProposal[] = [];

  for (const proposal of all) {
    if (await hasOpenProposal(proposal.action_type, proposal.target_entity_id)) continue;
    deduplicated.push(proposal);
  }

  return deduplicated;
}

export async function insertProposals(proposals: RawProposal[]): Promise<number> {
  let inserted = 0;
  for (const p of proposals) {
    const id = randomUUID();
    await db.execute({
      sql: `INSERT INTO action_proposals (id, action_type, target_provider, target_entity_id, target_entity_name, title, description, payload, confidence, status, proposed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
      args: [id, p.action_type, p.target_provider, p.target_entity_id, p.target_entity_name, p.title, p.description, JSON.stringify(p.payload), p.confidence, new Date().toISOString()],
    });
    inserted++;
  }
  return inserted;
}
