import { Hono } from 'hono';
import { db } from '../db/client';
import { rowToEvent } from '../db/row';
import type { InValue } from '@libsql/client';
import { requireSession } from '../security/session';

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
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  let ftsIds: Set<string> | null = null;

  if (q) {
    try {
      const ftsResult = await db.execute({
        sql: `SELECT e.id FROM event_fts JOIN events e ON e.rowid = event_fts.rowid WHERE event_fts MATCH ? LIMIT 200`,
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
    conditions.push(`provider_type = ?`);
    args.push(providerType);
  }
  if (entityType) {
    conditions.push(`entity_type = ?`);
    args.push(entityType);
  }
  if (quality) {
    conditions.push(`quality = ?`);
    args.push(quality);
  }
  if (from) {
    conditions.push(`occurred_at >= ?`);
    args.push(from);
  }
  if (to) {
    conditions.push(`occurred_at <= ?`);
    args.push(to);
  }

  const where = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM events WHERE ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total FROM events WHERE ${where}`,
      args,
    }),
  ]);

  const events = dataResult.rows.map((r) => rowToEvent(r as unknown as Record<string, unknown>));
  const total = countResult.rows[0].total as number;

  return c.json({ events, total, limit, offset });
});

eventsRoutes.get('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');

  const [eventResult, factsResult, embeddingResult] = await Promise.all([
    db.execute({ sql: `SELECT * FROM events WHERE id = ?`, args: [id] }),
    db.execute({ sql: `SELECT facts_json FROM dynamic_facts WHERE event_id = ?`, args: [id] }),
    db.execute({ sql: `SELECT status, embedded_at FROM event_embeddings WHERE event_id = ?`, args: [id] }),
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
