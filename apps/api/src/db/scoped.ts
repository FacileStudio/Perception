import { db } from './client';
import type { InStatement, ResultSet, InArgs } from '@libsql/client';

const WORKSPACE_TABLES = new Set([
  'events',
  'event_embeddings',
  'dynamic_facts',
  'ontology_concepts',
  'ontology_concept_aliases',
  'entities',
  'entity_aliases',
  'event_entities',
  'event_concepts',
  'entity_relations',
  'entity_communities',
  'entity_narratives',
  'provider_schemas',
  'schema_inference_jobs',
  'chat_sessions',
  'chat_messages',
  'memory_episodes',
  'stats_snapshots',
  'notifications',
  'resources',
  'resource_chunks',
  'change_points',
  'graph_health_snapshots',
  'concept_drift_alerts',
  'event_counts_daily',
  'causal_links',
  'forecasts',
  'forecast_resolutions',
  'forecast_beliefs',
  'forecast_intervals',
  'forecast_strategies',
  'strategy_forecasts',
  'calibration_snapshots',
  'topology_snapshots',
  'action_proposals',
  'retrieval_outcomes',
  'retrieval_weight_versions',
  'eval_fixtures',
  'eval_runs',
  'eval_results',
  'ingest_rejections',
  'token_usage',
  'entity_match_candidates',
  'entity_merge_log',
]);

export interface ScopedDb {
  workspaceId: string;
  execute(stmt: InStatement): Promise<ResultSet>;
  batch(stmts: InStatement[]): Promise<ResultSet[]>;
}

export function scopedDb(workspaceId: string): ScopedDb {
  return {
    workspaceId,
    execute(stmt: InStatement): Promise<ResultSet> {
      return db.execute(stmt);
    },
    batch(stmts: InStatement[]): Promise<ResultSet[]> {
      return db.batch(stmts);
    },
  };
}

export function wsFilter(workspaceId: string): string {
  return workspaceId;
}

export { WORKSPACE_TABLES };
