# Storage Design

Single libSQL database. Use migrations from day one.

## Core Tables

```sql
CREATE TABLE events (
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
  quality TEXT NOT NULL
);

CREATE VIRTUAL TABLE event_fts USING fts5(
  title,
  summary,
  searchable_text,
  content='events',
  content_rowid='rowid'
);

CREATE TABLE event_embeddings (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  embedding F32_BLOB(1024),
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TEXT,
  embedded_at TEXT
);

CREATE INDEX event_embeddings_vector_idx
ON event_embeddings(libsql_vector_idx(embedding))
WHERE status = 'ready';
```

`F32_BLOB(1024)` follows the recommended embedding dimension. If the embedding model or dimension changes, create a new embedding table or migration. Do not mutate vector dimensions in place.

---

## Facts Table

All provider-specific structured data lives in one generic table. No per-provider fact tables exist.

```sql
CREATE TABLE dynamic_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  facts_json TEXT NOT NULL
);

CREATE INDEX dynamic_facts_provider_idx ON dynamic_facts(provider_type);
```

`facts_json` stores the mapped key-value output of schema-driven payload extraction. Keys and types follow the `InferredFieldMapping` definitions in `provider_schemas`. For `quality = "degraded"` events, it stores the raw `payload.normalized` dump.

---

## Schema Registry Tables

```sql
CREATE TABLE provider_schemas (
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
);

CREATE INDEX provider_schemas_lookup_idx
ON provider_schemas(provider_type, event_type_pattern);
```

`event_type_pattern = null` is a wildcard — applies to all event types for that provider. Exact match wins over wildcard.

`needs_review = 1` when incoming `payload.normalized` keys diverge from `sample_keys_hash`. Schema is still used but flagged for re-inference on the new keys.

`field_mappings_json` is an array of `InferredFieldMapping`. Each mapping includes a `role` field (`status`, `id`, `name`, `date`, `url`, `count`, `other`) that lets the query and stats layers understand field semantics without provider-specific knowledge.

---

## Operational Tables

```sql
CREATE TABLE ingest_rejections (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_id TEXT,
  source_ip_hash TEXT,
  payload_hash TEXT
);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE stats_snapshots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  min_sample_met INTEGER NOT NULL,
  data_json TEXT NOT NULL
);
```
