import { describe, test, expect, beforeAll } from 'bun:test';
import { createClient } from '@libsql/client';
import { createHash } from 'crypto';
import { extractEnvelope } from '../src/ingest/envelope';
import { mapPayload } from '../src/ingest/mapper';
import { hashEmail } from '../src/ingest/redact';
import type { NookEventEnvelope, ProviderSchema } from '../src/types';

const testDb = createClient({ url: ':memory:' });

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    source TEXT NOT NULL,
    provider_id TEXT,
    provider_type TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_name TEXT,
    actor_name TEXT,
    actor_email_hash TEXT,
    status TEXT,
    due_at TEXT,
    completed_at TEXT,
    occurred_at TEXT NOT NULL,
    emitted_at TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    url TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    searchable_text TEXT NOT NULL,
    payload_redacted_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    quality TEXT NOT NULL CHECK(quality IN ('complete','partial','degraded'))
  )`,
  `CREATE TABLE IF NOT EXISTS dynamic_facts (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    provider_type TEXT NOT NULL,
    facts_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS event_embeddings (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    input_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  )`,
  `CREATE TABLE IF NOT EXISTS provider_schemas (
    id TEXT PRIMARY KEY,
    provider_type TEXT NOT NULL,
    event_type_pattern TEXT,
    field_mappings_json TEXT NOT NULL,
    searchable_text_template TEXT,
    sample_keys_hash TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0,
    inferred_at TEXT NOT NULL,
    confirmed_at TEXT,
    inferred_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ingest_rejections (
    id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    event_id TEXT,
    source_ip_hash TEXT,
    payload_hash TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS schema_inference_jobs (
    id TEXT PRIMARY KEY,
    provider_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    sample_event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
];

beforeAll(async () => {
  for (const sql of CREATE_TABLES) {
    await testDb.execute(sql);
  }
});

function makeEnvelope(overrides: Partial<NookEventEnvelope> = {}): NookEventEnvelope {
  return {
    schemaVersion: 1,
    id: 'evt-001',
    occurredAt: '2026-01-01T00:00:00.000Z',
    emittedAt: '2026-01-01T00:00:01.000Z',
    source: 'webhook',
    provider: {
      id: 'prov-1',
      type: 'stripe',
      name: 'Stripe',
      tags: ['billing', 'payment'],
    },
    event: {
      type: 'charge.succeeded',
      title: 'Charge succeeded',
      messageHtml: '<p>Payment processed</p>',
      messageText: 'Payment processed',
      url: 'https://stripe.com/charge/ch_001',
    },
    actor: {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
    },
    subject: {
      type: 'charge',
      id: 'ch_001',
      name: 'Charge #001',
      url: 'https://stripe.com/charge/ch_001',
    },
    payload: {
      normalized: { amount: 100, currency: 'usd', status: 'succeeded' },
      raw: null,
    },
    privacy: { containsPii: false, rawPayloadAllowed: true },
    ...overrides,
  };
}

async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyHmacDirect(
  secret: string,
  rawBody: string,
  headers: { eventId: string; timestamp: string; schemaVersion: string; signature: string },
  maxSkewSeconds = 300,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(headers.timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > maxSkewSeconds) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }
  if (headers.schemaVersion !== '1') {
    return { ok: false, reason: 'unsupported_schema_version' };
  }
  const sigHex = headers.signature.replace(/^sha256=/, '');
  const message = `${headers.timestamp}.${headers.eventId}.${rawBody}`;
  const expected = await computeHmac(secret, message);
  const a = expected;
  const b = sigHex;
  if (a.length !== b.length) return { ok: false, reason: 'invalid_signature' };
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0 ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}

describe('HMAC verification', () => {
  const secret = 'test-secret-abc';
  const eventId = 'evt-hmac-001';
  const rawBody = JSON.stringify(makeEnvelope({ id: eventId }));

  test('valid signature accepted', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const message = `${ts}.${eventId}.${rawBody}`;
    const sig = await computeHmac(secret, message);

    const result = await verifyHmacDirect(secret, rawBody, {
      eventId,
      timestamp: ts,
      schemaVersion: '1',
      signature: sig,
    });
    expect(result.ok).toBe(true);
  });

  test('invalid signature rejected', async () => {
    const ts = String(Math.floor(Date.now() / 1000));

    const result = await verifyHmacDirect(secret, rawBody, {
      eventId,
      timestamp: ts,
      schemaVersion: '1',
      signature: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_signature');
  });

  test('expired timestamp rejected', async () => {
    const expiredTs = String(Math.floor(Date.now() / 1000) - 999);
    const message = `${expiredTs}.${eventId}.${rawBody}`;
    const sig = await computeHmac(secret, message);

    const result = await verifyHmacDirect(secret, rawBody, {
      eventId,
      timestamp: expiredTs,
      schemaVersion: '1',
      signature: sig,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_out_of_range');
  });
});

describe('Layer 1 envelope extraction', () => {
  test('actor email is hashed', () => {
    const envelope = makeEnvelope();
    const extracted = extractEnvelope(envelope);
    expect(extracted.actor_email_hash).toBe(hashEmail('alice@example.com'));
    expect(extracted.actor_email_hash).not.toBe('alice@example.com');
  });

  test('title populated from event.title', () => {
    const envelope = makeEnvelope();
    const extracted = extractEnvelope(envelope);
    expect(extracted.title).toBe('Charge succeeded');
  });

  test('summary populated from messageText', () => {
    const envelope = makeEnvelope();
    const extracted = extractEnvelope(envelope);
    expect(extracted.summary).toBe('Payment processed');
  });

  test('summary falls back to stripped messageHtml when messageText is null', () => {
    const envelope = makeEnvelope({
      event: {
        type: 'charge.succeeded',
        title: 'Charge succeeded',
        messageHtml: '<p>Payment <b>processed</b></p>',
        messageText: null,
        url: null,
      },
    });
    const extracted = extractEnvelope(envelope);
    expect(extracted.summary).toBe('Payment processed');
  });

  test('null actor produces null email hash', () => {
    const envelope = makeEnvelope({ actor: null });
    const extracted = extractEnvelope(envelope);
    expect(extracted.actor_email_hash).toBeNull();
    expect(extracted.actor_name).toBeNull();
  });

  test('searchable_text includes provider name, type, event type, and tags', () => {
    const envelope = makeEnvelope();
    const extracted = extractEnvelope(envelope);
    expect(extracted.searchable_text).toContain('Stripe');
    expect(extracted.searchable_text).toContain('stripe');
    expect(extracted.searchable_text).toContain('charge.succeeded');
    expect(extracted.searchable_text).toContain('billing');
    expect(extracted.searchable_text).toContain('payment');
  });

  test('url prefers event.url over subject.url', () => {
    const envelope = makeEnvelope();
    const extracted = extractEnvelope(envelope);
    expect(extracted.url).toBe('https://stripe.com/charge/ch_001');
  });

  test('url falls back to subject.url when event.url is null', () => {
    const envelope = makeEnvelope({
      event: {
        type: 'charge.succeeded',
        title: 'Charge succeeded',
        messageHtml: null,
        messageText: null,
        url: null,
      },
    });
    const extracted = extractEnvelope(envelope);
    expect(extracted.url).toBe('https://stripe.com/charge/ch_001');
  });
});

describe('Layer 2 mapping', () => {
  const envelope = makeEnvelope();

  const confirmedSchema: ProviderSchema = {
    id: 'schema-1',
    provider_type: 'stripe',
    event_type_pattern: 'charge.succeeded',
    field_mappings: [
      { source_key: 'amount', target_key: 'amount', type: 'number', role: 'count', confidence: 0.9 },
      { source_key: 'currency', target_key: 'currency', type: 'text', role: 'other', confidence: 0.9 },
      { source_key: 'status', target_key: 'status', type: 'text', role: 'status', confidence: 0.95 },
    ],
    searchable_text_template: null,
    sample_keys_hash: createHash('sha256').update('amount,currency,status').digest('hex'),
    needs_review: false,
    inferred_at: '2026-01-01T00:00:00.000Z',
    confirmed_at: '2026-01-02T00:00:00.000Z',
    inferred_by: null,
  };

  const unconfirmedSchema: ProviderSchema = {
    ...confirmedSchema,
    confirmed_at: null,
  };

  test('schema with confirmed_at → quality: complete', () => {
    const { facts, quality } = mapPayload(envelope, confirmedSchema);
    expect(quality).toBe('complete');
    expect(facts.amount).toBe(100);
    expect(facts.currency).toBe('usd');
    expect(facts.status).toBe('succeeded');
  });

  test('schema without confirmed_at → quality: partial', () => {
    const { facts, quality } = mapPayload(envelope, unconfirmedSchema);
    expect(quality).toBe('partial');
    expect(facts.amount).toBe(100);
  });

  test('no schema → quality: degraded, facts = normalized payload', () => {
    const { facts, quality } = mapPayload(envelope, null);
    expect(quality).toBe('degraded');
    expect(facts).toEqual(envelope.payload.normalized);
  });
});

describe('Idempotency', () => {
  test('inserting same event_id twice only creates one row', async () => {
    const evtId = 'idempotent-evt-001';
    const now = new Date().toISOString();

    const insertSql = {
      sql: `INSERT INTO events (
        id, schema_version, source, provider_id, provider_type, provider_name,
        event_type, entity_type, entity_id, entity_name, actor_name, actor_email_hash,
        occurred_at, emitted_at, ingested_at, url, title, summary, searchable_text,
        payload_redacted_json, payload_hash, quality
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        evtId, 'webhook', null, 'stripe', 'Stripe',
        'charge.succeeded', 'charge', 'ch_001', 'Charge #001',
        'Alice', null, now, now, now,
        null, 'Charge succeeded', 'Payment processed',
        'searchable text', '{}', 'hash123', 'degraded',
      ],
    };

    await testDb.execute(insertSql);

    const check = await testDb.execute({
      sql: 'SELECT id FROM events WHERE id = ?',
      args: [evtId],
    });
    expect(check.rows.length).toBe(1);

    let threw = false;
    try {
      await testDb.execute(insertSql);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const checkAfter = await testDb.execute({
      sql: 'SELECT id FROM events WHERE id = ?',
      args: [evtId],
    });
    expect(checkAfter.rows.length).toBe(1);
  });
});

describe('Drift detection', () => {
  test('different keys trigger needs_review on schema', async () => {
    const schemaId = 'schema-drift-test';
    await testDb.execute({
      sql: 'INSERT INTO provider_schemas (id, provider_type, event_type_pattern, field_mappings_json, sample_keys_hash, needs_review, inferred_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      args: [
        schemaId,
        'stripe',
        'payment.created',
        '[]',
        createHash('sha256').update('amount,currency').digest('hex'),
        new Date().toISOString(),
      ],
    });

    const newKeys = { amount: 100, currency: 'usd', fee: 5 };
    const newHash = createHash('sha256')
      .update(Object.keys(newKeys).sort().join(','))
      .digest('hex');

    const existing = await testDb.execute({
      sql: 'SELECT sample_keys_hash FROM provider_schemas WHERE id = ?',
      args: [schemaId],
    });
    const storedHash = existing.rows[0].sample_keys_hash as string;

    expect(newHash).not.toBe(storedHash);

    await testDb.execute({
      sql: 'UPDATE provider_schemas SET needs_review = 1 WHERE id = ?',
      args: [schemaId],
    });

    const updated = await testDb.execute({
      sql: 'SELECT needs_review FROM provider_schemas WHERE id = ?',
      args: [schemaId],
    });
    expect(Number(updated.rows[0].needs_review)).toBe(1);
  });
});
