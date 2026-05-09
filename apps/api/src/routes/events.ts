import { Hono } from 'hono';
import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { InValue } from '@libsql/client';
import { requireSession } from '../security/session';
import { EVENT_LIST_ORDER_BY } from '../events/order';
import { labelEvent } from '../ontology/labels';
import { lookupSchema } from '../schema-registry/lookup';
import { resolveEventEntity } from '../entities/resolver';

export const eventsRoutes = new Hono();

eventsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const q = c.req.query('q');
  const providerType = c.req.query('provider_type');
  const entityType = c.req.query('entity_type');
  const quality = c.req.query('quality');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(Number.parseInt(c.req.query('limit') ?? '50', 10), 200);
  const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);

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
    return c.json({ events: [], total: 0, limit, offset });
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

  return c.json({ events: events.map((e) => ({ ...e, concepts: conceptsByEvent.get(e.id) ?? [] })), total, limit, offset });
});

eventsRoutes.get('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');

  const [eventResult, factsResult, embeddingResult] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM events WHERE id = ?', args: [id] }),
    db.execute({ sql: 'SELECT facts_json FROM dynamic_facts WHERE event_id = ?', args: [id] }),
    db.execute({ sql: 'SELECT status, embedded_at FROM event_embeddings WHERE event_id = ?', args: [id] }),
  ]);

  if (eventResult.rows.length === 0) {
    return c.json({ error: 'not_found' }, 404);
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

  return c.json({ event, facts, embedding });
});

async function retroLabel(event: ReturnType<typeof rowToEvent>): Promise<number> {
  const schema = await lookupSchema(event.provider_type, event.event_type);

  const envelope = {
    schemaVersion: 1 as const,
    id: event.id,
    occurredAt: event.occurred_at,
    emittedAt: event.emitted_at ?? event.occurred_at,
    source: event.source as 'webhook' | 'website' | 'imap' | 'system' | 'test',
    provider: { id: event.provider_id, type: event.provider_type, name: event.provider_name, tags: [] },
    event: { type: event.event_type, title: event.title, messageHtml: null, messageText: null, url: event.url },
    actor: event.actor_name ? { id: null, name: event.actor_name, email: null } : null,
    subject: { type: event.entity_type, id: event.entity_id, name: event.entity_name, url: event.url },
    payload: { normalized: {}, raw: null },
    privacy: { containsPii: false, rawPayloadAllowed: false },
  };

  const extracted = {
    event_type: event.event_type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    entity_name: event.entity_name,
    actor_name: event.actor_name,
    actor_email_hash: event.actor_email_hash,
    url: event.url,
    title: event.title,
    summary: event.summary,
    searchable_text: event.searchable_text,
  };

  const labeling = await labelEvent(envelope, extracted, schema);
  const resolvedEntity = await resolveEventEntity(envelope, extracted, labeling.entityConceptId);

  const conceptIds = [
    ...labeling.eventConceptIds,
    ...labeling.fieldConceptIds,
    labeling.entityConceptId,
    labeling.relationConceptId,
  ];

  for (const conceptId of conceptIds) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO event_concepts (event_id, concept_id, confidence, source) VALUES (?, ?, ?, ?)',
      args: [event.id, conceptId, 0.72, 'manual:retro'],
    });
  }

  if (resolvedEntity) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO event_entities (event_id, entity_id, relation_concept_id, confidence, source) VALUES (?, ?, ?, ?, ?)',
      args: [event.id, resolvedEntity.id, labeling.relationConceptId, 0.72, 'manual:retro'],
    });
  }

  return conceptIds.length;
}

eventsRoutes.post('/resolve-entities', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const missing = await db.execute({
    sql: `SELECT e.* FROM events e
      WHERE EXISTS (SELECT 1 FROM event_concepts ec WHERE ec.event_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM event_entities ee WHERE ee.event_id = e.id)
      ORDER BY e.occurred_at DESC LIMIT 500`,
    args: [],
  });

  let resolved = 0;
  for (const row of missing.rows) {
    await retroLabel(rowToEvent(row as unknown as Record<string, unknown>));
    resolved++;
  }

  return c.json({ ok: true, resolved });
});

eventsRoutes.post('/label-unlabeled', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const unlabeled = await db.execute({
    sql: `SELECT e.* FROM events e WHERE NOT EXISTS (SELECT 1 FROM event_concepts ec WHERE ec.event_id = e.id) ORDER BY e.occurred_at DESC LIMIT 500`,
    args: [],
  });

  let labeled = 0;
  for (const row of unlabeled.rows) {
    await retroLabel(rowToEvent(row as unknown as Record<string, unknown>));
    labeled++;
  }

  return c.json({ ok: true, labeled });
});

eventsRoutes.post('/:id/label', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const eventResult = await db.execute({ sql: 'SELECT * FROM events WHERE id = ?', args: [id] });
  if (eventResult.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const event = rowToEvent(eventResult.rows[0] as unknown as Record<string, unknown>);
  const concepts = await retroLabel(event);

  return c.json({ ok: true, concepts });
});
