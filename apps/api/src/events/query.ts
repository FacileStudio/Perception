import type { InValue } from '@libsql/client';
import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { EventRow } from '../events/types';
import { EVENT_LIST_ORDER_BY } from '../events/order';

export type EventFilters = {
  q?: string;
  providerType?: string;
  entityType?: string;
  quality?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

export async function listEvents(
  filters: EventFilters,
): Promise<{ events: Array<EventRow & { concepts: string[] }>; total: number }> {
  const { q, providerType, entityType, quality, from, to, limit, offset } = filters;

  let ftsIds: Set<string> | null = null;

  if (q) {
    try {
      const ftsResult = await db.execute({
        sql: 'SELECT e.id FROM event_fts JOIN events e ON e.rowid = event_fts.rowid WHERE event_fts MATCH ? LIMIT 200',
        args: [q],
      });
      ftsIds = new Set(ftsResult.rows.map((r) => r.id as string));
    } catch {
      ftsIds = new Set();
    }
  }

  const conditions: string[] = ['1=1'];
  const args: InValue[] = [];

  if (ftsIds !== null && ftsIds.size > 0) {
    const placeholders = Array.from(ftsIds).map(() => '?').join(',');
    conditions.push(`id IN (${placeholders})`);
    args.push(...Array.from(ftsIds));
  } else if (ftsIds !== null && ftsIds.size === 0) {
    return { events: [], total: 0 };
  }

  if (providerType) {
    conditions.push('provider_type = ?');
    args.push(providerType);
  }
  if (entityType) {
    conditions.push('entity_type = ?');
    args.push(entityType);
  }
  if (quality) {
    conditions.push('quality = ?');
    args.push(quality);
  }
  if (from) {
    conditions.push('occurred_at >= ?');
    args.push(from);
  }
  if (to) {
    conditions.push('occurred_at <= ?');
    args.push(to);
  }

  const where = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM events WHERE ${where} ORDER BY ${EVENT_LIST_ORDER_BY} LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total FROM events WHERE ${where}`,
      args,
    }),
  ]);

  const events = dataResult.rows.map((r) => rowToEvent(r as unknown as Record<string, unknown>));
  const total = countResult.rows[0].total as number;

  const conceptsByEvent = new Map<string, string[]>();
  if (events.length > 0) {
    const placeholders = events.map(() => '?').join(',');
    try {
      const conceptsResult = await db.execute({
        sql: `SELECT ec.event_id, oc.label FROM event_concepts ec JOIN ontology_concepts oc ON oc.id = ec.concept_id WHERE ec.event_id IN (${placeholders}) AND oc.kind IN ('entity_type','event_category')`,
        args: events.map((e) => e.id),
      });
      for (const row of conceptsResult.rows) {
        const eid = row.event_id as string;
        const label = row.label as string;
        const existing = conceptsByEvent.get(eid) ?? [];
        existing.push(label);
        conceptsByEvent.set(eid, existing);
      }
    } catch {
    }
  }

  return {
    events: events.map((e) => ({ ...e, concepts: conceptsByEvent.get(e.id) ?? [] })),
    total,
  };
}

export async function getEventDetail(
  id: string,
): Promise<{
  event: EventRow;
  facts: Record<string, unknown> | null;
  embedding: { status: string; embedded_at: string | null } | null;
} | null> {
  const [eventResult, factsResult, embeddingResult] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM events WHERE id = ?', args: [id] }),
    db.execute({ sql: 'SELECT facts_json FROM dynamic_facts WHERE event_id = ?', args: [id] }),
    db.execute({ sql: 'SELECT status, embedded_at FROM event_embeddings WHERE event_id = ?', args: [id] }),
  ]);

  if (eventResult.rows.length === 0) {
    return null;
  }

  const event = rowToEvent(eventResult.rows[0] as unknown as Record<string, unknown>);

  const facts = factsResult.rows.length > 0
    ? JSON.parse(factsResult.rows[0].facts_json as string) as Record<string, unknown>
    : null;

  const embedding = embeddingResult.rows.length > 0
    ? {
        status: embeddingResult.rows[0].status as string,
        embedded_at: embeddingResult.rows[0].embedded_at as string | null,
      }
    : null;

  return { event, facts, embedding };
}
