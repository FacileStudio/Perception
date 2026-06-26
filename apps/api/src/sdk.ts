/**
 * Perception API SDK
 *
 * Standalone TypeScript client for the Perception API.
 * Works in both browser and Node.js environments (requires global fetch).
 *
 * @example
 * ```typescript
 * import { createPerceptionClient } from './sdk';
 *
 * const client = createPerceptionClient({
 *   baseUrl: 'https://perception.example.com/api',
 *   token: 'my-api-token',
 *   onError: (err) => console.error(err),
 * });
 *
 * const { events, total } = await client.events.list({ limit: 10 });
 *
 * const response = await client.chat.send('What happened last week?');
 * const reader = response.body?.getReader();
 *
 * const { authenticated, user } = await client.auth.status();
 * ```
 */

export type PerceptionError = { status: number; error: string; message?: string };

export type Event = {
  id: string;
  provider_type: string;
  provider_name: string;
  entity_type: string;
  entity_name: string | null;
  event_type: string;
  title: string;
  summary: string | null;
  quality: "complete" | "partial" | "degraded";
  occurred_at: string;
};

export type Entity = {
  id: string;
  canonical_name: string;
  type_label: string;
  confidence: number;
  event_count: number;
};

export type Forecast = {
  id: string;
  question: string;
  question_type: "binary" | "numeric" | "date";
  status: "open" | "resolved" | "voided";
  resolution_criteria: string;
  resolves_at: string;
  base_rate: number | null;
  created_at: string;
};

export type Community = {
  id: string;
  title: string;
  summary: string;
  importance: number;
  member_count: number;
  members: Array<{ id: string; name: string; type_label: string }>;
};

export type Notification = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export type MatchCandidate = {
  id: string;
  source_entity_id: string;
  source_entity_name: string;
  target_entity_id: string;
  target_entity_name: string;
  similarity_score: number;
  match_method: string;
  status: "pending" | "approved" | "rejected";
};

export type GraphNode = { id: string; name: string; type: string };
export type GraphEdge = { from: string; to: string; label: string; confidence: number };
export type PathResult = { path: GraphNode[]; edges: GraphEdge[]; totalConfidence: number };

export interface PerceptionClient {
  auth: {
    login(password: string): Promise<{ ok: boolean }>;
    logout(): Promise<{ ok: boolean }>;
    status(): Promise<{
      authenticated: boolean;
      user: { id: string; email: string; name: string } | null;
    }>;
  };
  events: {
    list(params?: {
      q?: string;
      provider_type?: string;
      entity_type?: string;
      quality?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ events: Event[]; total: number }>;
    get(id: string): Promise<{ event: Event; facts: Record<string, unknown> | null }>;
    delete(id: string): Promise<{ ok: boolean }>;
  };
  chat: {
    send(message: string, sessionId?: string): Promise<Response>;
    sessions(): Promise<{
      sessions: Array<{
        id: string;
        title: string;
        message_count: number;
        updated_at: string;
      }>;
    }>;
    session(
      sessionId: string,
    ): Promise<{
      session: {
        id: string;
        messages: Array<{ role: string; content: string; created_at: string }>;
      };
    }>;
    deleteSession(sessionId: string): Promise<{ ok: boolean }>;
    feedback(messageId: string, feedback: "up" | "down" | null): Promise<{ ok: boolean }>;
  };
  entities: {
    graph(): Promise<{
      entities: Entity[];
      relations: Array<{
        from_id: string;
        to_id: string;
        label: string;
        confidence: number;
      }>;
    }>;
    communities(): Promise<{ communities: Community[] }>;
    narratives(): Promise<{
      narratives: Array<{
        entity_id: string;
        entity_name: string;
        text: string;
        source_event_count: number;
      }>;
    }>;
    narrative(
      entityId: string,
    ): Promise<{ narrative: { entity_name: string; text: string } | null }>;
    community(
      entityId: string,
    ): Promise<{ community: { id: string; title: string; summary: string } | null }>;
    merge(sourceId: string, targetId: string): Promise<{ merged: boolean }>;
    split(
      entityId: string,
      aliasIds: string[],
      newName: string,
    ): Promise<{ newEntityId: string }>;
    path(fromId: string, toId: string): Promise<{ path: PathResult | null }>;
    neighbors(
      entityId: string,
      hops?: number,
    ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
    matchCandidates(status?: string): Promise<{ candidates: MatchCandidate[] }>;
    generateMatchCandidates(): Promise<{ generated: number }>;
    resolveMatchCandidate(
      id: string,
      decision: "approve" | "reject",
    ): Promise<{ resolved: boolean }>;
  };
  forecasts: {
    list(status?: string): Promise<{ forecasts: Forecast[] }>;
    create(forecast: {
      question: string;
      question_type: string;
      resolution_criteria: string;
      resolves_at: string;
    }): Promise<{ id: string }>;
    get(id: string): Promise<{ forecast: Forecast }>;
    void(id: string): Promise<{ ok: boolean }>;
    resolve(id: string, value?: number | null, shouldVoid?: boolean): Promise<{ ok: boolean }>;
    beliefs(
      id: string,
    ): Promise<{
      beliefs: Array<{
        step: number;
        probability: number;
        confidence: string;
        evidence_for: string;
        evidence_against: string;
      }>;
    }>;
    intervals(
      id: string,
    ): Promise<{
      intervals: Array<{
        belief_step: number;
        lower_bound: number;
        upper_bound: number;
        coverage_target: number;
      }>;
    }>;
    ensemble(
      id: string,
    ): Promise<{
      probability: number | null;
      strategies: Array<{ name: string; probability: number; weight: number }>;
    }>;
    calibration(): Promise<{
      snapshot: {
        brier_score: number;
        log_score: number;
        reliability_score: number;
      } | null;
    }>;
    strategies(): Promise<{
      strategies: Array<{ name: string; brier_score: number; is_active: boolean }>;
    }>;
  };
  notifications: {
    list(
      filter?: string,
      limit?: number,
    ): Promise<{ notifications: Notification[]; total: number }>;
    unreadCount(): Promise<{ count: number }>;
    markRead(id: string): Promise<{ ok: boolean }>;
    markAllRead(): Promise<{ ok: boolean }>;
  };
  proposals: {
    list(
      status?: string,
    ): Promise<{
      proposals: Array<{ id: string; action_type: string; title: string; status: string }>;
    }>;
    approve(id: string): Promise<{ ok: boolean }>;
    dismiss(id: string): Promise<{ ok: boolean }>;
  };
  stats: {
    get(refresh?: boolean): Promise<Record<string, unknown>>;
    intelligence(): Promise<Record<string, unknown>>;
  };
}

export class PerceptionApiError extends Error {
  public readonly status: number;
  public readonly error: string;

  constructor(err: PerceptionError) {
    super(err.message ?? err.error);
    this.name = "PerceptionApiError";
    this.status = err.status;
    this.error = err.error;
  }
}

export function createPerceptionClient(options: {
  baseUrl: string;
  token?: string;
  onError?: (error: PerceptionError) => void;
}): PerceptionClient {
  const { baseUrl, token, onError } = options;

  function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = `${baseUrl}${path}`;
    if (!params) return url;
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) search.set(k, String(v));
    }
    const qs = search.toString();
    return qs ? `${url}?${qs}` : url;
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  async function handleError(res: globalThis.Response): Promise<never> {
    let err: PerceptionError;
    try {
      const parsed = await res.json();
      err = { status: res.status, error: parsed.error ?? res.statusText, message: parsed.message };
    } catch {
      err = { status: res.status, error: res.statusText };
    }
    if (onError) onError(err);
    throw new PerceptionApiError(err);
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const init: RequestInit = { method, headers: headers(), credentials: "include" };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(buildUrl(path, params), init);
    if (!res.ok) return handleError(res);
    return res.json() as Promise<T>;
  }

  async function streamRequest(path: string, body: unknown): Promise<Response> {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) return handleError(res);
    return res;
  }

  return {
    auth: {
      login: (password) => request("POST", "/auth/login", { password }),
      logout: () => request("POST", "/auth/logout"),
      status: () => request("GET", "/auth/status"),
    },

    events: {
      list: (params) =>
        request("GET", "/events", undefined, params as Record<string, string | number | undefined>),
      get: (id) => request("GET", `/events/${id}`),
      delete: (id) => request("DELETE", `/events/${id}`),
    },

    chat: {
      send: (message, sessionId) =>
        streamRequest("/chat", { message, session_id: sessionId }),
      sessions: () => request("GET", "/chat/sessions"),
      session: (sessionId) => request("GET", `/chat/sessions/${sessionId}`),
      deleteSession: (sessionId) => request("DELETE", `/chat/sessions/${sessionId}`),
      feedback: (messageId, feedback) =>
        request("PATCH", `/chat/messages/${messageId}/feedback`, { feedback }),
    },

    entities: {
      graph: () => request("GET", "/entities/graph"),
      communities: () => request("GET", "/entities/communities"),
      narratives: () => request("GET", "/entities/narratives"),
      narrative: (entityId) => request("GET", `/entities/${entityId}/narrative`),
      community: (entityId) => request("GET", `/entities/${entityId}/community`),
      merge: (sourceId, targetId) =>
        request("POST", `/entities/${sourceId}/merge`, { targetId }),
      split: (entityId, aliasIds, newName) =>
        request("POST", `/entities/${entityId}/split`, { aliasIds, newName }),
      path: (fromId, toId) =>
        request("GET", "/entities/path", undefined, { from: fromId, to: toId }),
      neighbors: (entityId, hops) =>
        request("GET", `/entities/${entityId}/neighbors`, undefined, hops ? { hops } : undefined),
      matchCandidates: (status) =>
        request("GET", "/entities/match-candidates", undefined, status ? { status } : undefined),
      generateMatchCandidates: () => request("POST", "/entities/match-candidates/generate"),
      resolveMatchCandidate: (id, decision) =>
        request("POST", `/entities/match-candidates/${id}/resolve`, { decision }),
    },

    forecasts: {
      list: (status) =>
        request("GET", "/forecasts", undefined, status ? { status } : undefined),
      create: (forecast) => request("POST", "/forecasts", forecast),
      get: (id) => request("GET", `/forecasts/${id}`),
      void: (id) => request("DELETE", `/forecasts/${id}`),
      resolve: (id, value, shouldVoid) =>
        request("PATCH", `/forecasts/${id}/resolve`, {
          resolution_value: value ?? null,
          void: shouldVoid,
        }),
      beliefs: (id) => request("GET", `/forecasts/${id}/beliefs`),
      intervals: (id) => request("GET", `/forecasts/${id}/intervals`),
      ensemble: (id) => request("GET", `/forecasts/${id}/ensemble`),
      calibration: () => request("GET", "/forecasts/calibration"),
      strategies: () => request("GET", "/forecasts/strategies"),
    },

    notifications: {
      list: (filter, limit) => {
        const params: Record<string, string | number | undefined> = {};
        if (filter && filter !== "all") params.filter = filter;
        if (limit !== undefined) params.limit = limit;
        return request("GET", "/notifications", undefined, params);
      },
      unreadCount: () => request("GET", "/notifications/unread-count"),
      markRead: (id) => request("PATCH", `/notifications/${id}/read`),
      markAllRead: () => request("PATCH", "/notifications/read-all"),
    },

    proposals: {
      list: (status) =>
        request("GET", "/proposals", undefined, status ? { status } : undefined),
      approve: (id) => request("PATCH", `/proposals/${id}/approve`),
      dismiss: (id) => request("PATCH", `/proposals/${id}/dismiss`),
    },

    stats: {
      get: (refresh) =>
        request("GET", "/stats", undefined, refresh ? { refresh: 1 } : undefined),
      intelligence: () => request("GET", "/stats/intelligence"),
    },
  };
}
