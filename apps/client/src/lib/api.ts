const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

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
    status: () => request<{ authenticated: boolean }>('/auth/status'),
  },
  events: {
    list: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ events: EventRow[]; total: number }>(`/events${q}`);
    },
    get: (id: string) => request<{ event: EventRow; facts: Record<string, unknown> | null; embedding: { status: string; embedded_at: string | null } | null }>(`/events/${id}`),
    label: (id: string) => request<{ ok: boolean; concepts: number }>(`/events/${id}/label`, { method: 'POST' }),
    labelUnlabeled: () => request<{ ok: boolean; labeled: number }>('/events/label-unlabeled', { method: 'POST' }),
    resolveEntities: () => request<{ ok: boolean; resolved: number }>('/events/resolve-entities', { method: 'POST' }),
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
  },
  stats: {
    get: (refresh = false) => request<{ snapshots: StatsSnapshot[] }>(`/stats${refresh ? '?refresh=1' : ''}`),
  },
  settings: {
    get: () => request<{ settings: Record<string, string>; sources: Record<string, string> }>('/settings'),
    update: (body: Record<string, string | null>) => request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
    usage: () => request<{ usage: TokenUsageRow[]; total_cost_usd: number }>('/settings/usage'),
  },
  entities: {
    graph: () => request<{ entities: GraphEntity[]; relations: EntityRelation[] }>('/entities/graph'),
  },
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

export type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: ChatSource[] };
export type ChatSource = { event_id: string; provider_name: string; occurred_at: string; title: string; score: number };
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
