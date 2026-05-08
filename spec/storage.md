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

## Fact Tables

Each fact table stores provider-specific structured data and references the canonical event:

```sql
CREATE TABLE task_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  task_id TEXT,
  task_title TEXT NOT NULL,
  project_id TEXT,
  project_name TEXT,
  status TEXT,
  assignee_name TEXT,
  due_at TEXT,
  completed_at TEXT
);

CREATE TABLE contract_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  submission_id TEXT,
  template_id TEXT,
  template_name TEXT,
  signer_email_hash TEXT,
  status TEXT,
  opened_at TEXT,
  completed_at TEXT,
  declined_at TEXT
);

CREATE TABLE client_activity_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  client_id TEXT,
  client_name TEXT,
  contact_id TEXT,
  activity_type TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL
);

CREATE TABLE deployment_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  project_name TEXT,
  application_name TEXT,
  status TEXT,
  build_url TEXT,
  commit_sha TEXT
);

CREATE TABLE code_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  repository TEXT,
  ref TEXT,
  commit_sha TEXT,
  commit_count INTEGER,
  pull_request_id TEXT,
  issue_id TEXT
);

CREATE TABLE email_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  message_id TEXT,
  thread_id TEXT,
  uid TEXT,
  from_hash TEXT,
  from_domain TEXT,
  subject TEXT,
  sent_at TEXT
);

CREATE TABLE service_health_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  service_id TEXT,
  service_name TEXT,
  url TEXT,
  status TEXT,
  duration_seconds INTEGER,
  ping_ms INTEGER
);

CREATE TABLE schedule_facts (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  schedule_id TEXT,
  project_name TEXT,
  client_name TEXT,
  started_at TEXT,
  stopped_at TEXT,
  duration_seconds INTEGER
);
```

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
