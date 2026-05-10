import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import { config } from '../config';
import { extractAllMissingRelations, extractEntityRelations } from '../entities/link';

export const adminRoutes = new Hono();

adminRoutes.post('/embedding-jobs/retry', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0, last_error = NULL WHERE status = 'error'`,
    args: [],
  });

  return c.json({ reset: result.rowsAffected });
});

adminRoutes.post('/backfill-embeddings', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO event_embeddings (event_id, model, dimensions, input_hash, status) SELECT id, ?, ?, '', 'pending' FROM events WHERE id NOT IN (SELECT event_id FROM event_embeddings)`,
    args: [config.embeddingModel, config.embeddingDimensions],
  });

  return c.json({ enqueued: result.rowsAffected });
});

adminRoutes.post('/reinfer-schemas', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const schemas = await db.execute({
    sql: `SELECT ps.provider_type, ps.event_type_pattern,
                 (SELECT e.id FROM events e WHERE e.provider_type = ps.provider_type LIMIT 1) AS sample_event_id
          FROM provider_schemas ps`,
    args: [],
  });

  let queued = 0;
  for (const row of schemas.rows) {
    const providerType = row.provider_type as string;
    const eventType = (row.event_type_pattern as string | null) ?? providerType;
    const sampleEventId = row.sample_event_id as string | null;
    if (!sampleEventId) continue;

    const existing = await db.execute({
      sql: "SELECT id FROM schema_inference_jobs WHERE provider_type = ? AND event_type = ? AND status IN ('pending','running')",
      args: [providerType, eventType],
    });
    if (existing.rows.length > 0) continue;

    await db.execute({
      sql: 'INSERT INTO schema_inference_jobs (id, provider_type, event_type, sample_event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), providerType, eventType, sampleEventId, 'pending', new Date().toISOString()],
    });
    queued++;
  }

  return c.json({ queued });
});

adminRoutes.post('/reembed-all', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await db.execute({
    sql: `UPDATE event_embeddings SET status = 'pending', attempts = 0, last_error = NULL WHERE status IN ('ready', 'error')`,
    args: [],
  });

  return c.json({ reset: result.rowsAffected });
});

adminRoutes.post('/reprocess-entities', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO ontology_concepts (id, kind, label, description, capabilities_json, examples_json, confidence, state, source, created_at, updated_at, confirmed_at)
          VALUES ('concept_entity_type_person', 'entity_type', 'person', 'A person or actor extracted from events', '["identity","person"]', '[]', 0.86, 'confirmed', 'admin:backfill', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [now, now, now],
  });

  await db.execute({
    sql: `INSERT INTO ontology_concepts (id, kind, label, description, capabilities_json, examples_json, confidence, state, source, created_at, updated_at, confirmed_at)
          VALUES ('concept_relation_type_about_entity', 'relation_type', 'about_entity', 'Relation between event and actor entity', '[]', '[]', 0.72, 'confirmed', 'admin:backfill', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [now, now, now],
  });

  const eventsWithActors = await db.execute({
    sql: `SELECT id, actor_name, provider_type FROM events WHERE actor_name IS NOT NULL AND actor_name != '' ORDER BY occurred_at ASC`,
    args: [],
  });

  function normalizeActorName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const actorEntityMap = new Map<string, string>();
  let actorsCreated = 0;
  let eventsLinked = 0;

  for (const row of eventsWithActors.rows) {
    const actorName = row.actor_name as string;
    const providerType = row.provider_type as string;
    const eventId = row.id as string;
    const normalized = normalizeActorName(actorName);

    let entityId = actorEntityMap.get(normalized);
    if (!entityId) {
      const existing = await db.execute({
        sql: `SELECT entity_id FROM entity_aliases WHERE alias_type = 'name' AND alias_value = ? LIMIT 1`,
        args: [normalized],
      });
      if (existing.rows.length > 0) {
        entityId = existing.rows[0].entity_id as string;
      } else {
        const hash = createHash('sha256').update(`${providerType}:person:${normalized}`).digest('hex').slice(0, 24);
        entityId = `entity_${hash}`;
        await db.execute({
          sql: `INSERT INTO entities (id, type_concept_id, canonical_name, description, status, confidence, created_at, updated_at)
                VALUES (?, 'concept_entity_type_person', ?, ?, NULL, 0.72, ?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [entityId, actorName, `${providerType} actor`, now, now],
        });
        await db.execute({
          sql: `INSERT OR IGNORE INTO entity_aliases (id, entity_id, alias_type, alias_value, provider_type, confidence, first_seen_at, last_seen_at)
                VALUES (?, ?, 'name', ?, ?, 0.76, ?, ?)`,
          args: [randomUUID(), entityId, normalized, providerType, now, now],
        });
        actorsCreated++;
      }
      actorEntityMap.set(normalized, entityId);
    }

    const linked = await db.execute({
      sql: `INSERT OR IGNORE INTO event_entities (event_id, entity_id, relation_concept_id, confidence, source)
            VALUES (?, ?, 'concept_relation_type_about_entity', 0.80, 'admin:backfill')`,
      args: [eventId, entityId],
    });
    if (linked.rowsAffected > 0) eventsLinked++;
  }

  for (const [normalized, entityId] of actorEntityMap) {
    await extractEntityRelations({ id: entityId, canonicalName: normalized, capabilities: ['person'] });
  }

  const relationsAdded = await extractAllMissingRelations();

  return c.json({ actors_created: actorsCreated, events_linked: eventsLinked, relations_added: relationsAdded });
});
