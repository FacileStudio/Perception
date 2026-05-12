import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { config } from '../config';
import { redactPayload } from './redact';
import { extractEnvelope } from './envelope';
import { mapPayload } from './mapper';
import { lookupSchema, computeKeysHash, markNeedsReview } from '../schema-registry/lookup';
import { labelEvent } from '../ontology/labels';
import { resolveEventEntity } from '../entities/resolver';
import { extractEntityRelations } from '../entities/link';
import { extractEventAttachments } from '../resources/attachments';
import type { NookEventEnvelope } from './types';

export function extractStringField(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

export function extractDateField(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = payload[key];
    if (typeof val === 'string' && val.trim()) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

async function ensureInferenceJob(providerType: string, eventType: string, sampleEventId: string): Promise<void> {
  const pendingJob = await db.execute({
    sql: "SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')",
    args: [providerType, eventType],
  });
  if (pendingJob.rows.length === 0) {
    await db.execute({
      sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [
        randomUUID(),
        providerType,
        eventType,
        sampleEventId,
        'pending',
        new Date().toISOString(),
      ],
    });
  }
}

export async function processIngestEvent(
  envelope: NookEventEnvelope,
  workspaceId: string = 'default',
): Promise<{ ok: true; duplicate?: boolean } | { error: string; status: 400 | 409 }> {
  if (envelope.schemaVersion !== 1) {
    return { error: 'unsupported_schema_version', status: 400 };
  }

  const existing = await db.execute({
    sql: 'SELECT id FROM events WHERE id = ?',
    args: [envelope.id],
  });
  if (existing.rows.length > 0) {
    return { ok: true, duplicate: true };
  }

  const redacted = redactPayload(envelope.payload.normalized, envelope.privacy);

  const layer1 = extractEnvelope(envelope);

  const schema = await lookupSchema(envelope.provider.type, envelope.event.type);

  if (schema) {
    const currentHash = computeKeysHash(envelope.payload.normalized);
    if (currentHash !== schema.sample_keys_hash) {
      await markNeedsReview(schema.id);
      await ensureInferenceJob(envelope.provider.type, envelope.event.type, envelope.id);
    }
  }

  const { facts, quality } = mapPayload(envelope, schema);

  const normalizedStatus = extractStringField(envelope.payload.normalized, ['status', 'state']) ?? null;
  const normalizedDueAt = extractDateField(envelope.payload.normalized, ['dueDate', 'due_date', 'due_at', 'deadline']) ?? null;
  const normalizedCompletedAt = extractDateField(envelope.payload.normalized, ['completedDate', 'completed_date', 'completed_at', 'completedAt']) ?? null;

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

  let resolvedActor: { id: string; canonicalName: string } | null = null;
  let actorRelationConceptId: string | null = null;
  if (envelope.actor?.name) {
    const actorLayer = {
      ...layer1,
      entity_type: 'person',
      entity_id: envelope.actor.id ?? null,
      entity_name: envelope.actor.name,
      url: null as string | null,
    };
    const actorLabeling = await labelEvent(envelope, actorLayer, null);
    resolvedActor = await resolveEventEntity(envelope, actorLayer, actorLabeling.entityConceptId);
    if (resolvedActor) {
      actorRelationConceptId = actorLabeling.relationConceptId;
      await extractEntityRelations({
        id: resolvedActor.id,
        canonicalName: resolvedActor.canonicalName,
        capabilities: actorLabeling.entityCapabilities,
      });
    }
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
        status, due_at, completed_at,
        occurred_at, emitted_at, ingested_at, url, title, summary, searchable_text,
        payload_redacted_json, payload_hash, quality, workspace_id
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        normalizedStatus,
        normalizedDueAt,
        normalizedCompletedAt,
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
        workspaceId,
      ],
    },
    {
      sql: 'INSERT INTO dynamic_facts (event_id, provider_type, facts_json, workspace_id) VALUES (?, ?, ?, ?)',
      args: [envelope.id, envelope.provider.type, JSON.stringify(facts), workspaceId],
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
    ...(resolvedActor && actorRelationConceptId ? [{
      sql: 'INSERT OR IGNORE INTO event_entities (event_id, entity_id, relation_concept_id, confidence, source) VALUES (?, ?, ?, ?, ?)',
      args: [envelope.id, resolvedActor.id, actorRelationConceptId, 0.80, 'ingest:actor'],
    }] : []),
  ]);

  await db.execute({
    sql: 'INSERT INTO event_fts(rowid, title, summary, searchable_text) SELECT rowid, title, summary, searchable_text FROM events WHERE id = ?',
    args: [envelope.id],
  });

  if (envelope.attachments?.length) {
    extractEventAttachments(envelope.id, envelope.attachments).catch(() => {});
  }

  if (quality === 'degraded') {
    await ensureInferenceJob(envelope.provider.type, envelope.event.type, envelope.id);
  }

  return { ok: true };
}
