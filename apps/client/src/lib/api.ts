const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}


export const api = {
  auth: {
    login: (password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    status: () => request<{ authenticated: boolean; user: AuthUser | null }>('/auth/status'),
    config: () => request<{ sso_only: boolean; oidc_enabled: boolean }>('/auth/config'),
  },
  users: {
    list: () => request<{ users: AuthUser[] }>('/users'),
    me: () => request<{ user: AuthUser }>('/users/me'),
  },
  events: {
    list: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ events: EventRow[]; total: number }>(`/events${q}`);
    },
    get: (id: string) => request<{ event: EventRow; facts: Record<string, unknown> | null; embedding: { status: string; embedded_at: string | null } | null }>(`/events/${id}`),
    delete: (id: string) => request<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  },
  chat: {
    send: (message: string, sessionId?: string) =>
      fetch(`${API_BASE}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId }),
      }),
    sessions: () => request<{ sessions: ChatSessionSummary[] }>('/chat/sessions'),
    session: (sessionId: string) => request<{ session: ChatSessionDetail }>(`/chat/sessions/${sessionId}`),
    deleteSession: (sessionId: string) => request<{ ok: boolean; session_id: string }>(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
    feedback: (messageId: string, feedback: 'up' | 'down' | null) =>
      request<{ ok: boolean }>(`/chat/messages/${messageId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback }),
      }),
  },
  stats: {
    get: (refresh = false) => request<{ snapshots: StatsSnapshot[] }>(`/stats${refresh ? '?refresh=1' : ''}`),
    intelligence: () => request<IntelligenceData>('/stats/intelligence'),
  },
  settings: {
    get: () => request<{ settings: Record<string, string>; sources: Record<string, string> }>('/settings'),
    update: (body: Record<string, string | null>) => request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    usage: () => request<{ usage: TokenUsageRow[]; total_cost_usd: number }>('/settings/usage'),
  },
  notifications: {
    list: (filter?: 'all' | 'unread' | 'read', limit = 50, offset = 0) => {
      const params = new URLSearchParams();
      if (filter && filter !== 'all') params.set('filter', filter);
      if (limit !== 50) params.set('limit', String(limit));
      if (offset > 0) params.set('offset', String(offset));
      const q = params.toString();
      return request<{ notifications: NotificationRow[]; total: number }>(`/notifications${q ? '?' + q : ''}`);
    },
    unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
    markRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request<{ ok: boolean; marked: number }>('/notifications/read-all', { method: 'PATCH' }),
  },
  entities: {
    graph: () => request<{ entities: GraphEntity[]; relations: EntityRelation[] }>('/entities/graph'),
    communities: () => request<{ communities: CommunityDetail[] }>('/entities/communities'),
    community: (entityId: string) => request<{ community: EntityCommunity | null }>(`/entities/${entityId}/community`),
    narrative: (entityId: string) => request<{ narrative: EntityNarrativeDetail | null }>(`/entities/${entityId}/narrative`),
    narratives: () => request<{ narratives: Array<EntityNarrativeDetail & { entity_id: string }> }>('/entities/narratives'),
    resolveRelations: () => request<{ created: number }>('/entities/relations/resolve-all', { method: 'POST' }),
  },
  resources: {
    list: () => request<{ resources: ResourceRow[] }>('/resources'),
    get: (id: string) => request<ResourceDetail>(`/resources/${id}`),
    upload: (files: Array<{ name: string; type: string; data: string }>) =>
      request<{ ids: string[] }>('/resources', {
        method: 'POST',
        body: JSON.stringify({ files }),
      }),
    downloadUrl: (id: string) => `${API_BASE}/resources/${id}/file`,
    delete: (id: string) => request<{ ok: boolean }>(`/resources/${id}`, { method: 'DELETE' }),
  },
  proposals: {
    list: (status?: string) => {
      const q = status ? `?status=${status}` : '';
      return request<{ proposals: ActionProposal[] }>(`/proposals${q}`);
    },
    approve: (id: string) => request<{ ok: boolean }>(`/proposals/${id}/approve`, { method: 'PATCH' }),
    dismiss: (id: string) => request<{ ok: boolean }>(`/proposals/${id}/dismiss`, { method: 'PATCH' }),
  },
  forecasts: {
    list: (status?: string) => {
      const q = status ? `?status=${status}` : '';
      return request<{ forecasts: Forecast[] }>(`/forecasts${q}`);
    },
    get: (id: string) => request<{ forecast: Forecast }>(`/forecasts/${id}`),
    create: (body: { question: string; question_type: string; resolution_criteria: string; resolves_at: string }) =>
      request<{ forecast: Forecast }>('/forecasts', { method: 'POST', body: JSON.stringify(body) }),
    resolve: (id: string, body: { resolution_value: number; void?: boolean }) =>
      request<{ ok: boolean }>(`/forecasts/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(body) }),
    void: (id: string) => request<{ ok: boolean }>(`/forecasts/${id}`, { method: 'DELETE' }),
    beliefs: (id: string) => request<{ beliefs: BeliefState[] }>(`/forecasts/${id}/beliefs`),
    intervals: (id: string) => request<{ intervals: ForecastInterval[] }>(`/forecasts/${id}/intervals`),
    ensemble: (id: string) => request<{ ensemble: EnsembleResult | null }>(`/forecasts/${id}/ensemble`),
    calibration: () => request<{ snapshot: CalibrationSnapshot | null }>('/forecasts/calibration'),
    calibrationHistory: () => request<{ snapshots: CalibrationSnapshotSummary[] }>('/forecasts/calibration/history'),
    strategies: () => request<{ strategies: StrategyScore[] }>('/forecasts/strategies'),
    conformalState: () => request<{ state: ConformalState }>('/forecasts/conformal/state'),
  },
  admin: {
    reinferSchemas: () => request<{ queued: number }>('/admin/reinfer-schemas', { method: 'POST' }),
    reembedAll: () => request<{ reset: number }>('/admin/reembed-all', { method: 'POST' }),
    reprocessEntities: () => request<{ actors_created: number; events_linked: number; relations_added: number }>('/admin/reprocess-entities', { method: 'POST' }),
    embeddingStats: () => request<{ total: number; pending: number; ready: number; error: number; locked: number }>('/admin/embedding-stats'),
    workers: () => request<{ workers: WorkerStatus[]; paused: boolean }>('/admin/workers'),
    workerHistory: (name: string) => request<{ history: WorkerRun[] }>(`/admin/workers/${name}/history`),
    runWorker: (name: string) => request<{ ok: boolean }>(`/admin/workers/${name}/run`, { method: 'POST' }),
    setWorkersPaused: (paused: boolean) => request<{ ok: boolean; paused: boolean }>('/admin/workers/paused', { method: 'PUT', body: JSON.stringify({ paused }) }),
    graphHealth: () => request<{ snapshot: GraphHealthSnapshot | null; isolated: IsolatedEntity[] }>('/admin/graph-health'),
    driftAlerts: () => request<{ alerts: DriftAlert[] }>('/admin/drift-alerts'),
  },
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  color: string;
  source: string;
  created_at?: string;
};

export type EventRow = {
  id: string; provider_type: string; provider_name: string; event_type: string;
  entity_type: string; entity_id: string | null; entity_name: string | null;
  actor_name: string | null; occurred_at: string; ingested_at: string; url: string | null;
  title: string; summary: string; quality: 'complete' | 'partial' | 'degraded';
  status: string | null; concepts?: string[];
};

export type StatsSnapshot = {
  id: string; kind: string; window_start: string; window_end: string;
  generated_at: string; source_count: number; min_sample_met: boolean;
  data: Record<string, unknown>;
};

export type SqlQueryMeta = { query: string; row_count: number; columns: string[] };
export type CommunitySummaryMeta = { title: string; summary: string; member_count: number; matched_entities: string[] };
export type NarrativeMeta = { entity_name: string; narrative: string; event_count: number };
export type MemoryEpisodeMeta = { summary: string; entities: string[]; occurred: string };
export type ResourceMeta = { title: string; chunk_index: number; content: string };
export type CounterfactualMeta = {
  scenario: string;
  confidence: string;
  affected_count: number;
  causal_chain: Array<{ cause: string; effect: string; lag_days: number; p_value: number; coefficient: number }>;
  affected_entities: Array<{ series: string; direction: string; magnitude: number; probability: number; lag_days: number }>;
  distribution: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
};
export type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: ChatSource[]; id?: string; feedback?: 'up' | 'down' | null; sql_query?: SqlQueryMeta | null; community_summaries?: CommunitySummaryMeta[] | null; narratives?: NarrativeMeta[] | null; memory_episodes?: MemoryEpisodeMeta[] | null; resources?: ResourceMeta[] | null; sub_queries?: string[] | null; counterfactual?: CounterfactualMeta | null };
export type EntityNarrativeDetail = { entity_name: string; text: string; source_event_count: number; generated_at: string; staleness_score: number };
export type ChatSource = { event_id: string; provider_name: string; occurred_at: string; title: string; score: number };
export type EntityCommunity = { id: string; title: string; summary: string; importance: number; member_count: number; member_names: string[] };
export type CommunityDetail = {
  id: string; title: string; summary: string; importance: number; member_count: number;
  generated_at: string; stale: boolean;
  members: Array<{ id: string; name: string; type_label: string }>;
};
export type ChatSessionSummary = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};
export type ChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  feedback: 'up' | 'down' | null;
  created_at: string;
};
export type TokenUsageRow = {
  kind: 'llm' | 'embedding';
  model: string;
  input_tokens: number;
  output_tokens: number;
  calls: number;
  cost_usd: number;
};

export type GraphEntity = {
  id: string;
  canonical_name: string;
  type_label: string;
  confidence: number;
  event_count: number;
};

export type EntityRelation = {
  from_id: string;
  to_id: string;
  label: string;
  confidence: number;
};

export type ChatSessionDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageRecord[];
};

export type NotificationRow = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

export type WorkerRun = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  error: string | null;
};

export type WorkerStatus = {
  name: string;
  description: string;
  intervalMs: number;
  status: 'idle' | 'running';
  lastRun: WorkerRun | null;
  totalRuns: number;
  totalErrors: number;
};

export type IntelligenceData = {
  graph_health: { largest_component_ratio: number; degree_entropy: number; isolated_node_ratio: number; node_count: number; edge_count: number } | null;
  memory_episodes: number;
  change_points_30d: number;
  drift_alerts_30d: number;
  coverage: { total_entities: number; with_narratives: number; in_communities: number; with_relations: number };
  change_points: Array<{ entity_id: string; entity_name: string; pre_mean: number; post_mean: number; detected_at: string }>;
  providers: Array<{ provider_type: string; provider_name: string; event_count: number; drifted: boolean; schema_confirmed: boolean }>;
  isolated_entities: Array<{ id: string; name: string; type: string; event_count: number }>;
  drift_alerts: Array<{ id: string; provider_type: string; field_name: string; detected_at: string; drift_score: number }>;
};

export type GraphHealthSnapshot = {
  computed_at: string;
  node_count: number;
  edge_count: number;
  degree_entropy: number;
  isolated_node_ratio: number;
  largest_component_ratio: number;
};

export type IsolatedEntity = {
  id: string;
  name: string;
  type: string;
  event_count: number;
};

export type DriftAlert = {
  id: string;
  provider_type: string;
  field_name: string;
  detected_at: string;
  old_distribution: Record<string, number>;
  new_distribution: Record<string, number>;
  drift_score: number;
};

export type ResourceRow = {
  id: string;
  title: string;
  description: string;
  mime_type: string;
  file_size: number;
  source_type: 'upload' | 'event_attachment';
  chunk_count: number;
  status: 'processing' | 'ready' | 'error';
  error: string | null;
  uploaded_at: string;
  updated_at: string;
  has_file: boolean;
};

export type ResourceChunkRow = {
  id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding_status: string;
};

export type ResourceDetail = ResourceRow & {
  chunks: ResourceChunkRow[];
};

export type ActionProposal = {
  id: string;
  action_type: string;
  target_provider: string;
  target_entity_id: string | null;
  target_entity_name: string | null;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  confidence: number;
  status: 'proposed' | 'approved' | 'executed' | 'dismissed' | 'failed';
  proposed_at: string;
  resolved_at: string | null;
  executed_result: string | null;
};

export type Forecast = {
  id: string;
  question: string;
  question_type: 'binary' | 'numeric' | 'date';
  resolution_criteria: string;
  resolution_source: Record<string, unknown>;
  base_rate: number | null;
  entity_id: string | null;
  entity_name: string | null;
  provider_type: string | null;
  source_signal: string | null;
  created_at: string;
  resolves_at: string;
  resolved_at: string | null;
  resolution_value: number | null;
  status: 'open' | 'resolved' | 'voided' | 'expired';
};

export type BeliefState = {
  id: string;
  forecast_id: string;
  step: number;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  evidence_for: string;
  evidence_against: string;
  open_questions: string;
  update_reasoning: string;
  created_at: string;
};

export type ForecastInterval = {
  id: string;
  forecast_id: string;
  belief_step: number;
  lower_bound: number;
  upper_bound: number;
  coverage_target: number;
  nonconformity_score: number | null;
};

export type EnsembleResult = {
  ensemble_probability: number;
  strategy_predictions: Array<{
    strategy_name: string;
    strategy_type: string;
    probability: number;
    weight: number;
  }>;
};

export type CalibrationSnapshot = {
  id: string;
  computed_at: string;
  bin_edges: number[];
  bin_counts: number[];
  bin_actuals: number[];
  brier_score: number;
  log_score: number;
  resolution_score: number;
  reliability_score: number;
  uncertainty_score: number;
  sharpness_score: number;
  domain_scores: Record<string, { brier: number; count: number }>;
  forecast_count: number;
};

export type CalibrationSnapshotSummary = {
  id: string;
  computed_at: string;
  brier_score: number;
  log_score: number;
  reliability_score: number;
  resolution_score: number;
  sharpness_score: number;
  forecast_count: number;
};

export type StrategyScore = {
  strategy_id: string;
  strategy_name: string;
  strategy_type: string;
  brier_score: number | null;
  forecast_count: number;
  weight: number;
  is_active: boolean;
};

export type ConformalState = {
  calibration_scores: number[];
  coverage_target: number;
  empirical_coverage: number;
  alpha_t: number;
};
