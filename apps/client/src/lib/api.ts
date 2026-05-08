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
};

export type EventRow = {
  id: string; provider_type: string; provider_name: string; event_type: string;
  entity_type: string; entity_id: string | null; entity_name: string | null;
  actor_name: string | null; occurred_at: string; ingested_at: string; url: string | null;
  title: string; summary: string; quality: 'complete' | 'partial' | 'degraded';
  status: string | null;
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
export type ChatSessionDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageRecord[];
};
