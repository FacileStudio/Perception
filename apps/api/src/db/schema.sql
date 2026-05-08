CREATE TABLE IF NOT EXISTS events (
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
);

CREATE VIRTUAL TABLE IF NOT EXISTS event_fts USING fts5(
  title,
  summary,
  searchable_text,
  content='events',
  content_rowid='rowid'
);

CREATE TABLE IF NOT EXISTS event_embeddings (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  embedding F32_BLOB(1024),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','error','locked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TEXT,
  embedded_at TEXT
);

CREATE INDEX IF NOT EXISTS event_embeddings_vector_idx
  ON event_embeddings(libsql_vector_idx(embedding))
  WHERE status = 'ready';

CREATE TABLE IF NOT EXISTS dynamic_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  facts_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dynamic_facts_provider_idx ON dynamic_facts(provider_type);

CREATE TABLE IF NOT EXISTS provider_schemas (
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

CREATE INDEX IF NOT EXISTS provider_schemas_lookup_idx
  ON provider_schemas(provider_type, event_type_pattern);

CREATE TABLE IF NOT EXISTS ingest_rejections (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_id TEXT,
  source_ip_hash TEXT,
  payload_hash TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stats_snapshots (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_count INTEGER NOT NULL,
  min_sample_met INTEGER NOT NULL,
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_inference_jobs (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sample_event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','error')),
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
