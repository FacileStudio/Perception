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

CREATE TABLE IF NOT EXISTS ontology_concepts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('entity_type','field_role','relation_type','event_category')),
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('draft','tentative','confirmed','rejected','superseded')),
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  UNIQUE(kind, label)
);

CREATE INDEX IF NOT EXISTS ontology_concepts_kind_idx ON ontology_concepts(kind);
CREATE INDEX IF NOT EXISTS ontology_concepts_label_idx ON ontology_concepts(label);

CREATE TABLE IF NOT EXISTS ontology_concept_aliases (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES ontology_concepts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(concept_id, alias)
);

CREATE INDEX IF NOT EXISTS ontology_concept_alias_lookup_idx ON ontology_concept_aliases(alias);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type_concept_id TEXT NOT NULL REFERENCES ontology_concepts(id),
  canonical_name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_type_idx ON entities(type_concept_id);
CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(canonical_name);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  provider_type TEXT,
  confidence REAL NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(alias_type, alias_value)
);

CREATE INDEX IF NOT EXISTS entity_aliases_entity_idx ON entity_aliases(entity_id);
CREATE INDEX IF NOT EXISTS entity_aliases_lookup_idx ON entity_aliases(alias_type, alias_value);

CREATE TABLE IF NOT EXISTS event_entities (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_concept_id TEXT NOT NULL REFERENCES ontology_concepts(id),
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (event_id, entity_id, relation_concept_id)
);

CREATE INDEX IF NOT EXISTS event_entities_entity_idx ON event_entities(entity_id);

CREATE TABLE IF NOT EXISTS event_concepts (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES ontology_concepts(id) ON DELETE CASCADE,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (event_id, concept_id)
);

CREATE INDEX IF NOT EXISTS event_concepts_concept_idx ON event_concepts(concept_id);

CREATE TABLE IF NOT EXISTS entity_relations (
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_concept_id TEXT NOT NULL REFERENCES ontology_concepts(id),
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_entity_id, to_entity_id, relation_concept_id)
);

CREATE INDEX IF NOT EXISTS entity_relations_from_idx ON entity_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_to_idx ON entity_relations(to_entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_source_idx ON entity_relations(source);

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
