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
    {
      name: '015_event_counts_daily',
      sql: `
CREATE TABLE IF NOT EXISTS event_counts_daily (
  day TEXT NOT NULL,
  series_key TEXT NOT NULL,
  cnt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, series_key)
);
CREATE INDEX IF NOT EXISTS event_counts_daily_series_idx ON event_counts_daily(series_key, day)
      `,
    },
    {
      name: '016_causal_links',
      sql: `
CREATE TABLE IF NOT EXISTS causal_links (
  id TEXT PRIMARY KEY,
  cause_series TEXT NOT NULL,
  effect_series TEXT NOT NULL,
  lag_days INTEGER NOT NULL,
  f_statistic REAL NOT NULL,
  p_value REAL NOT NULL,
  bic_score REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('forward','reverse','bidirectional')),
  detected_at TEXT NOT NULL,
  superseded_at TEXT
);
CREATE INDEX IF NOT EXISTS causal_links_cause_idx ON causal_links(cause_series, detected_at DESC);
CREATE INDEX IF NOT EXISTS causal_links_pvalue_idx ON causal_links(p_value)
      `,
    },
    {
      name: '017_resources',
      sql: `
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('upload','event_attachment')),
  source_event_id TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','ready','error')),
  error TEXT,
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS resources_status_idx ON resources(status);
CREATE INDEX IF NOT EXISTS resources_source_idx ON resources(source_type);

CREATE TABLE IF NOT EXISTS resource_chunks (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding_status TEXT NOT NULL DEFAULT 'pending' CHECK(embedding_status IN ('pending','ready','error','locked')),
  embedding F32_BLOB(1024),
  input_hash TEXT,
  locked_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE(resource_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS resource_chunks_resource_idx ON resource_chunks(resource_id);
CREATE INDEX IF NOT EXISTS resource_chunks_status_idx ON resource_chunks(embedding_status)
      `,
    },
    {
      name: '018_eval_harness',
      sql: `
CREATE TABLE IF NOT EXISTS eval_fixtures (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  expected_event_ids TEXT NOT NULL DEFAULT '[]',
  expected_lanes TEXT NOT NULL DEFAULT '[]',
  intent TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  source_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  ran_at TEXT NOT NULL,
  fixture_count INTEGER NOT NULL,
  precision_at_5 REAL NOT NULL,
  recall_at_5 REAL NOT NULL,
  mrr REAL NOT NULL,
  lane_hit_rates TEXT NOT NULL DEFAULT '{}',
  duration_ms INTEGER NOT NULL,
  regression_detected INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS eval_runs_ran_idx ON eval_runs(ran_at DESC);

CREATE TABLE IF NOT EXISTS eval_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  fixture_id TEXT NOT NULL REFERENCES eval_fixtures(id) ON DELETE CASCADE,
  retrieved_event_ids TEXT NOT NULL DEFAULT '[]',
  retrieved_lanes TEXT NOT NULL DEFAULT '[]',
  precision_val REAL NOT NULL,
  recall_val REAL NOT NULL,
  reciprocal_rank REAL NOT NULL,
  score REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS eval_results_run_idx ON eval_results(run_id);
CREATE INDEX IF NOT EXISTS eval_results_fixture_idx ON eval_results(fixture_id)
      `,
    },
    {
      name: '019_resource_file_path',
      sql: `ALTER TABLE resources ADD COLUMN file_path TEXT`,
    },
    {
      name: '020_retrieval_outcomes',
      sql: `
CREATE TABLE IF NOT EXISTS retrieval_outcomes (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  lane_weights TEXT NOT NULL,
  active_lanes TEXT NOT NULL,
  top_event_ids TEXT NOT NULL,
  outcome_label TEXT CHECK(outcome_label IN ('up','down','implicit_negative')),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS retrieval_outcomes_session_idx ON retrieval_outcomes(session_id);
CREATE INDEX IF NOT EXISTS retrieval_outcomes_occurred_idx ON retrieval_outcomes(occurred_at);
CREATE INDEX IF NOT EXISTS retrieval_outcomes_message_idx ON retrieval_outcomes(message_id);

CREATE TABLE IF NOT EXISTS retrieval_weight_versions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  weights TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  avg_reward REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS retrieval_weight_versions_ver_idx ON retrieval_weight_versions(version DESC)
      `,
    },
    {
      name: '021_action_proposals',
      sql: `
CREATE TABLE IF NOT EXISTS action_proposals (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_provider TEXT NOT NULL,
  target_entity_id TEXT,
  target_entity_name TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','executed','dismissed','failed')),
  proposed_at TEXT NOT NULL,
  resolved_at TEXT,
  executed_result TEXT
);
CREATE INDEX IF NOT EXISTS action_proposals_status_idx ON action_proposals(status);
CREATE INDEX IF NOT EXISTS action_proposals_proposed_idx ON action_proposals(proposed_at DESC)
      `,
    },
    {
      name: '022_forecasts',
      sql: `
CREATE TABLE IF NOT EXISTS forecasts (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('binary','numeric','date')),
  resolution_criteria TEXT NOT NULL,
  resolution_source TEXT NOT NULL DEFAULT '{}',
  base_rate REAL,
  entity_id TEXT,
  entity_name TEXT,
  provider_type TEXT,
  source_signal TEXT,
  created_at TEXT NOT NULL,
  resolves_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_value REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','voided','expired'))
);
CREATE INDEX IF NOT EXISTS forecasts_status_idx ON forecasts(status);
CREATE INDEX IF NOT EXISTS forecasts_resolves_idx ON forecasts(resolves_at);
CREATE INDEX IF NOT EXISTS forecasts_entity_idx ON forecasts(entity_id);
CREATE INDEX IF NOT EXISTS forecasts_dedup_idx ON forecasts(entity_id, source_signal, question_type, status)
      `,
    },
    {
      name: '023_forecast_resolutions',
      sql: `
CREATE TABLE IF NOT EXISTS forecast_resolutions (
  id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  resolution_method TEXT NOT NULL CHECK(resolution_method IN ('auto','manual','voided')),
  raw_evidence TEXT NOT NULL DEFAULT '{}',
  resolved_by TEXT NOT NULL DEFAULT 'system',
  resolved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forecast_resolutions_forecast_idx ON forecast_resolutions(forecast_id)
      `,
    },
    {
      name: '024_forecast_beliefs',
      sql: `
CREATE TABLE IF NOT EXISTS forecast_beliefs (
  id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  probability REAL NOT NULL,
  confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high')),
  evidence_for TEXT NOT NULL DEFAULT '',
  evidence_against TEXT NOT NULL DEFAULT '',
  open_questions TEXT NOT NULL DEFAULT '',
  update_reasoning TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forecast_beliefs_forecast_idx ON forecast_beliefs(forecast_id, step)
      `,
    },
    {
      name: '025_topology_snapshots',
      sql: `
CREATE TABLE IF NOT EXISTS topology_snapshots (
  id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  h0_component_count INTEGER NOT NULL,
  h1_loop_count INTEGER NOT NULL,
  max_h0_persistence REAL NOT NULL,
  persistence_pairs TEXT NOT NULL DEFAULT '[]',
  gap_entity_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS topology_snapshots_computed_idx ON topology_snapshots(computed_at DESC)
      `,
    },
    {
      name: '026_calibration_snapshots',
      sql: `
CREATE TABLE IF NOT EXISTS calibration_snapshots (
  id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  bin_edges TEXT NOT NULL DEFAULT '[]',
  bin_counts TEXT NOT NULL DEFAULT '[]',
  bin_actuals TEXT NOT NULL DEFAULT '[]',
  brier_score REAL NOT NULL,
  log_score REAL NOT NULL,
  resolution_score REAL NOT NULL,
  reliability_score REAL NOT NULL,
  uncertainty_score REAL NOT NULL DEFAULT 0,
  sharpness_score REAL NOT NULL,
  domain_scores TEXT NOT NULL DEFAULT '{}',
  forecast_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS calibration_snapshots_computed_idx ON calibration_snapshots(computed_at DESC)
      `,
    },
    {
      name: '027_forecast_intervals',
      sql: `
CREATE TABLE IF NOT EXISTS forecast_intervals (
  id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  belief_step INTEGER NOT NULL,
  lower_bound REAL NOT NULL,
  upper_bound REAL NOT NULL,
  coverage_target REAL NOT NULL DEFAULT 0.9,
  nonconformity_score REAL
);
CREATE INDEX IF NOT EXISTS forecast_intervals_forecast_idx ON forecast_intervals(forecast_id, belief_step)
      `,
    },
    {
      name: '028_forecast_strategies',
      sql: `
CREATE TABLE IF NOT EXISTS forecast_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  strategy_type TEXT NOT NULL CHECK(strategy_type IN ('base_rate','causal','pattern','llm_belief','human')),
  is_active INTEGER NOT NULL DEFAULT 1,
  brier_score REAL,
  brier_count INTEGER NOT NULL DEFAULT 0,
  log_weight REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forecast_strategies_active_idx ON forecast_strategies(is_active)
      `,
    },
    {
      name: '029_strategy_forecasts',
      sql: `
CREATE TABLE IF NOT EXISTS strategy_forecasts (
  id TEXT PRIMARY KEY,
  forecast_id TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  strategy_id TEXT NOT NULL REFERENCES forecast_strategies(id),
  probability REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS strategy_forecasts_forecast_idx ON strategy_forecasts(forecast_id);
CREATE INDEX IF NOT EXISTS strategy_forecasts_strategy_idx ON strategy_forecasts(strategy_id)
      `,
    },
    {
      name: '030_better_auth_tables',
      sql: `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  activeOrganizationId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  metadata TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  inviterId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','canceled')),
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_email_idx ON user(email);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);
CREATE INDEX IF NOT EXISTS session_token_idx ON session(token);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);
CREATE INDEX IF NOT EXISTS member_userId_idx ON member(userId);
CREATE INDEX IF NOT EXISTS member_orgId_idx ON member(organizationId);
CREATE INDEX IF NOT EXISTS invitation_orgId_idx ON invitation(organizationId)
      `,
    },
    {
      name: '031_workspace_id',
      sql: `
ALTER TABLE events ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE event_embeddings ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE dynamic_facts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE ontology_concepts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE ontology_concept_aliases ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE entities ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE entity_aliases ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE event_entities ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE event_concepts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE entity_relations ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE entity_communities ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE entity_narratives ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE provider_schemas ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE schema_inference_jobs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE chat_sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE chat_messages ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memory_episodes ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stats_snapshots ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE notifications ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE resources ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE resource_chunks ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE change_points ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE graph_health_snapshots ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE concept_drift_alerts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE event_counts_daily ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE causal_links ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE forecasts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE forecast_resolutions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE forecast_beliefs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE forecast_intervals ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE forecast_strategies ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE strategy_forecasts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE calibration_snapshots ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE topology_snapshots ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE action_proposals ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE retrieval_outcomes ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE retrieval_weight_versions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE eval_fixtures ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE eval_runs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE eval_results ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE ingest_rejections ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE token_usage ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE worker_runs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS events_ws_idx ON events(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS entities_ws_idx ON entities(workspace_id, canonical_name);
CREATE INDEX IF NOT EXISTS chat_sessions_ws_idx ON chat_sessions(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notifications_ws_idx ON notifications(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS forecasts_ws_idx ON forecasts(workspace_id, status);
CREATE INDEX IF NOT EXISTS resources_ws_idx ON resources(workspace_id, status);
CREATE INDEX IF NOT EXISTS ontology_concepts_ws_idx ON ontology_concepts(workspace_id, kind);
CREATE INDEX IF NOT EXISTS provider_schemas_ws_idx ON provider_schemas(workspace_id, provider_type);
CREATE INDEX IF NOT EXISTS action_proposals_ws_idx ON action_proposals(workspace_id, status);
CREATE INDEX IF NOT EXISTS change_points_ws_idx ON change_points(workspace_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS causal_links_ws_idx ON causal_links(workspace_id, cause_series);
CREATE INDEX IF NOT EXISTS entity_communities_ws_idx ON entity_communities(workspace_id);
CREATE INDEX IF NOT EXISTS stats_snapshots_ws_idx ON stats_snapshots(workspace_id, kind);
CREATE INDEX IF NOT EXISTS event_counts_daily_ws_idx ON event_counts_daily(workspace_id, series_key, day)
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
