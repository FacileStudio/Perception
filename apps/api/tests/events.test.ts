import { describe, expect, test } from 'bun:test';
import { createClient } from '@libsql/client';
import { EVENT_LIST_ORDER_BY } from '../src/events/order';

describe('event list ordering', () => {
  test('sorts by actual timestamp recency across ISO offset formats', async () => {
    const db = createClient({ url: ':memory:' });

    await db.execute(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      )
    `);

    await db.batch([
      {
        sql: 'INSERT INTO events (id, occurred_at, ingested_at) VALUES (?, ?, ?)',
        args: ['older-by-offset', '2026-05-08T23:30:00+02:00', '2026-05-08T21:30:01Z'],
      },
      {
        sql: 'INSERT INTO events (id, occurred_at, ingested_at) VALUES (?, ?, ?)',
        args: ['newer-utc', '2026-05-08T22:00:00Z', '2026-05-08T22:00:01Z'],
      },
      {
        sql: 'INSERT INTO events (id, occurred_at, ingested_at) VALUES (?, ?, ?)',
        args: ['oldest', '2026-05-08T20:00:00Z', '2026-05-08T20:00:01Z'],
      },
    ]);

    const result = await db.execute(`SELECT id FROM events ORDER BY ${EVENT_LIST_ORDER_BY}`);

    expect(result.rows.map((row) => row.id)).toEqual(['newer-utc', 'older-by-offset', 'oldest']);
  });
});
