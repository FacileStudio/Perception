import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { verifyNookSignature } from '../security/hmac';
import { redactPayload } from '../ingest/redact';
import { extractEnvelope } from '../ingest/envelope';
import { mapPayload } from '../ingest/mapper';
import { lookupSchema, computeKeysHash, markNeedsReview } from '../schema-registry/lookup';
import { labelEvent } from '../ontology/labels';
import { resolveEventEntity } from '../entities/resolver';
import { extractEntityRelations } from '../entities/link';
import type { NookEventEnvelope } from '../types';
import { config } from '../config';

export const ingestRoutes = new Hono();

ingestRoutes.post('/', async (c) => {
  const rawBody = await c.req.text();

  const eventId = c.req.header('x-nook-event-id') ?? '';
  const timestamp = c.req.header('x-nook-timestamp') ?? '';
  const schemaVersion = c.req.header('x-nook-schema-version') ?? '';
  const signature = c.req.header('x-nook-signature-256') ?? '';

  const hmacResult = await verifyNookSignature(rawBody, {
    eventId,
    timestamp,
    schemaVersion,
    signature,
  });

  if (!hmacResult.ok) {
    const ip = c.req.header('x-forwarded-for') ?? '';
    const ipHash = createHash('sha256').update(ip).digest('hex');
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    await db.execute({
      sql: 'INSERT INTO ingest_rejections (id, received_at, reason, event_id, source_ip_hash, payload_hash) VALUES (?, ?, ?, ?, ?, ?)',
      args: [
        randomUUID(),
        new Date().toISOString(),
        hmacResult.reason,
        eventId || null,
        ipHash,
        bodyHash,
      ],
    });
    return c.json({ error: 'unauthorized', reason: hmacResult.reason }, 401);
  }

  let envelope: NookEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as NookEventEnvelope;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (envelope.schemaVersion !== 1) {
    return c.json({ error: 'unsupported_schema_version' }, 400);
  }

  const existing = await db.execute({
    sql: 'SELECT id FROM events WHERE id = ?',
    args: [envelope.id],
  });
  if (existing.rows.length > 0) {
    return c.json({ ok: true, duplicate: true }, 202);
  }

  const redacted = redactPayload(envelope.payload.normalized, envelope.privacy);

  const layer1 = extractEnvelope(envelope);

  const schema = await lookupSchema(envelope.provider.type, envelope.event.type);

  if (schema) {
    const currentHash = computeKeysHash(envelope.payload.normalized);
    if (currentHash !== schema.sample_keys_hash) {
      await markNeedsReview(schema.id);
      const pendingJob = await db.execute({
        sql: "SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')",
        args: [envelope.provider.type, envelope.event.type],
      });
      if (pendingJob.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            randomUUID(),
            envelope.provider.type,
            envelope.event.type,
            envelope.id,
            'pending',
            new Date().toISOString(),
          ],
        });
      }
    }
  }

  const { facts, quality } = mapPayload(envelope, schema);

  if (!layer1.actor_name && schema) {
    const actorMapping = schema.field_mappings.find((m) => m.role === 'actor');
    if (actorMapping) {
      const val = envelope.payload.normalized[actorMapping.source_key];
      if (val != null) {
        const strVal = String(val);
        if (!/^[0-9a-f]{64}$/i.test(strVal)) layer1.actor_name = strVal;
      }
    }
  }

  const labeling = await labelEvent(envelope, layer1, schema);
  const resolvedEntity = await resolveEventEntity(envelope, layer1, labeling.entityConceptId);

  if (resolvedEntity) {
    await extractEntityRelations({
      id: resolvedEntity.id,
      canonicalName: resolvedEntity.canonicalName,
      capabilities: labeling.entityCapabilities,
    });
  }

  const payloadHash = createHash('sha256')
    .update(JSON.stringify(redacted))
    .digest('hex');

  const embeddingInput = [
    layer1.title,
    layer1.summary,
    layer1.entity_name ?? '',
    envelope.provider.name,
  ]
    .filter(Boolean)
    .join(' ');

  const inputHash = createHash('sha256').update(embeddingInput).digest('hex');

  const now = new Date().toISOString();
  const conceptIds = [
    ...labeling.eventConceptIds,
    ...labeling.fieldConceptIds,
    labeling.entityConceptId,
    labeling.relationConceptId,
  ];

  await db.batch([
    {
      sql: `INSERT INTO events (
        id, schema_version, source, provider_id, provider_type, provider_name,
        event_type, entity_type, entity_id, entity_name, actor_name, actor_email_hash,
        occurred_at, emitted_at, ingested_at, url, title, summary, searchable_text,
        payload_redacted_json, payload_hash, quality
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        envelope.id,
        envelope.source,
        envelope.provider.id,
        envelope.provider.type,
        envelope.provider.name,
        layer1.event_type,
        layer1.entity_type,
        layer1.entity_id,
        layer1.entity_name,
        layer1.actor_name,
        layer1.actor_email_hash,
        envelope.occurredAt,
        envelope.emittedAt,
        now,
        layer1.url,
        layer1.title,
        layer1.summary,
        layer1.searchable_text,
        JSON.stringify(redacted),
        payloadHash,
        quality,
      ],
    },
    {
      sql: 'INSERT INTO dynamic_facts (event_id, provider_type, facts_json) VALUES (?, ?, ?)',
      args: [envelope.id, envelope.provider.type, JSON.stringify(facts)],
    },
    {
      sql: 'INSERT INTO event_embeddings (event_id, model, dimensions, input_hash, status) VALUES (?, ?, ?, ?, ?)',
      args: [
        envelope.id,
        config.embeddingModel,
        config.embeddingDimensions,
        inputHash,
        'pending',
      ],
    },
    ...conceptIds.map((conceptId) => ({
      sql: 'INSERT OR IGNORE INTO event_concepts (event_id, concept_id, confidence, source) VALUES (?, ?, ?, ?)',
      args: [envelope.id, conceptId, 0.82, 'ingest:auto'],
    })),
    ...(resolvedEntity ? [{
      sql: 'INSERT OR IGNORE INTO event_entities (event_id, entity_id, relation_concept_id, confidence, source) VALUES (?, ?, ?, ?, ?)',
      args: [envelope.id, resolvedEntity.id, labeling.relationConceptId, 0.86, 'ingest:auto'],
    }] : []),
  ]);

  await db.execute({
    sql: 'INSERT INTO event_fts(rowid, title, summary, searchable_text) SELECT rowid, title, summary, searchable_text FROM events WHERE id = ?',
    args: [envelope.id],
  });

  if (quality === 'degraded') {
    const existingJob = await db.execute({
      sql: "SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')",
      args: [envelope.provider.type, envelope.event.type],
    });
    if (existingJob.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          randomUUID(),
          envelope.provider.type,
          envelope.event.type,
          envelope.id,
          'pending',
          now,
        ],
      });
    }
  }

  return c.json({ ok: true }, 202);
});
