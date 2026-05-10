import { db } from './client';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runMigrations(): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);

  const alreadyApplied = await db.execute('SELECT name FROM _migrations');
  const applied = new Set(alreadyApplied.rows.map(r => r.name as string));

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '001_initial_schema',
      sql: readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf-8'),
    },
    {
      name: '002_settings_and_token_usage',
      sql: `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('llm','embedding')),
  model TEXT NOT NULL,
  session_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL
);
      `,
    },
    {
      name: '003_ontology_entities',
      sql: `
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
      `,
    },
    {
      name: '004_users_and_oidc',
      sql: `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  color TEXT NOT NULL DEFAULT '#818cf8',
  source TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL
);
ALTER TABLE sessions ADD COLUMN user_id TEXT
      `,
    },
    {
      name: '005_chat_feedback',
      sql: `ALTER TABLE chat_messages ADD COLUMN feedback TEXT CHECK(feedback IN ('up','down'))`,
    },
    {
      name: '006_entity_relations_indexes',
      sql: `
CREATE INDEX IF NOT EXISTS entity_relations_from_idx ON entity_relations(from_entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_to_idx ON entity_relations(to_entity_id);
CREATE INDEX IF NOT EXISTS entity_relations_source_idx ON entity_relations(source)
      `,
    },
    {
      name: '007_worker_runs',
      sql: `
CREATE TABLE IF NOT EXISTS worker_runs (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','error')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  result_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS worker_runs_worker_idx ON worker_runs(worker_name, started_at DESC)
      `,
    },
    {
      name: '008_notifications',
      sql: `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(read_at)
      `,
    },
    {
      name: '009_entity_communities',
      sql: `
CREATE TABLE IF NOT EXISTS entity_communities (
  id TEXT PRIMARY KEY,
  membership_hash TEXT NOT NULL UNIQUE,
  member_entity_ids TEXT NOT NULL,
  member_count INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  generated_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entity_communities_stale_idx ON entity_communities(stale)
      `,
    },
    {
      name: '010_entity_narratives',
      sql: `
CREATE TABLE IF NOT EXISTS entity_narratives (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  narrative_text TEXT NOT NULL,
  source_event_count INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  staleness_score REAL NOT NULL DEFAULT 0
)
      `,
    },
    {
      name: '011_memory_episodes',
      sql: `
CREATE TABLE IF NOT EXISTS memory_episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  entity_refs TEXT NOT NULL DEFAULT '[]',
  occurred_at TEXT NOT NULL,
  retrieval_hits INTEGER NOT NULL DEFAULT 0,
  embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK(embedding_status IN ('pending','ready','error')),
  embedding F32_BLOB(1024)
);
CREATE INDEX IF NOT EXISTS memory_episodes_session_idx ON memory_episodes(session_id);
CREATE INDEX IF NOT EXISTS memory_episodes_status_idx ON memory_episodes(embedding_status)
      `,
    },
    {
      name: '012_change_points',
      sql: `
CREATE TABLE IF NOT EXISTS change_points (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  run_length_probability REAL NOT NULL,
  pre_mean REAL NOT NULL,
  post_mean REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS change_points_entity_idx ON change_points(entity_id, detected_at DESC)
      `,
    },
    {
      name: '013_graph_health_snapshots',
      sql: `
CREATE TABLE IF NOT EXISTS graph_health_snapshots (
  id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  edge_count INTEGER NOT NULL,
  degree_entropy REAL NOT NULL,
  isolated_node_ratio REAL NOT NULL,
  largest_component_ratio REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS graph_health_computed_idx ON graph_health_snapshots(computed_at DESC)
      `,
    },
    {
      name: '014_concept_drift_alerts',
      sql: `
CREATE TABLE IF NOT EXISTS concept_drift_alerts (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  old_distribution TEXT NOT NULL,
  new_distribution TEXT NOT NULL,
  drift_score REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS concept_drift_provider_idx ON concept_drift_alerts(provider_type, detected_at DESC)
      `,
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const statements = migration.sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try {
        await db.execute(stmt);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('libsql_vector_idx') || msg.includes('F32_BLOB') || msg.includes('near "WHERE"') || msg.includes('duplicate column name')) {
          console.warn(`[migrations] skipped unsupported statement: ${stmt.slice(0, 80)}`);
          continue;
        }
        throw e;
      }
    }
    await db.execute({
      sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      args: [migration.name, new Date().toISOString()],
    });
    console.log(`[migrations] applied: ${migration.name}`);
  }
}
