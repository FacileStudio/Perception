import { api, type ChatMessage, type ChatSessionSummary, type ChatSource, type SqlQueryMeta, type CommunitySummaryMeta, type NarrativeMeta, type MemoryEpisodeMeta, type ResourceMeta, type CounterfactualMeta } from '$lib/api';

export const chatState = $state({
  sessionId: null as string | null,
  messages: [] as ChatMessage[],
  sessions: [] as ChatSessionSummary[],
  pending: false,
  streaming: false,
  input: '',
  loadingSessions: false,
  loadingHistory: false,
  deletingSessionId: null as string | null,
});

export function setActiveChatSession(sessionId: string | null) {
  chatState.sessionId = sessionId;
}

export function startNewChat() {
  setActiveChatSession(null);
  chatState.messages = [];
  chatState.pending = false;
  chatState.streaming = false;
  chatState.input = '';
}

export function clearChatState() {
  startNewChat();
  chatState.sessions = [];
  chatState.loadingSessions = false;
  chatState.loadingHistory = false;
  chatState.deletingSessionId = null;
}

export async function loadChatSessions() {
  if (chatState.loadingSessions) return;
  chatState.loadingSessions = true;
  try {
    const { sessions } = await api.chat.sessions();
    chatState.sessions = sessions;
  } finally {
    chatState.loadingSessions = false;
  }
}

export async function openChatSession(sessionId: string) {
  if (chatState.sessionId === sessionId && chatState.messages.length > 0 && !chatState.loadingHistory) return;
  chatState.loadingHistory = true;
  try {
    const { session } = await api.chat.session(sessionId);
    setActiveChatSession(session.id);
    chatState.messages = session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources,
      feedback: message.feedback,
    }));
    chatState.pending = false;
    chatState.streaming = false;
  } finally {
    chatState.loadingHistory = false;
  }
}

export async function deleteChatSession(sessionId: string) {
  chatState.deletingSessionId = sessionId;
  try {
    await api.chat.deleteSession(sessionId);
    const remainingSessions = chatState.sessions.filter((s) => s.id !== sessionId);
    chatState.sessions = remainingSessions;
    if (chatState.sessionId === sessionId) {
      const nextSessionId = remainingSessions[0]?.id ?? null;
      if (nextSessionId) {
        try {
          await openChatSession(nextSessionId);
        } catch {
          startNewChat();
        }
      } else {
        startNewChat();
      }
    }
  } finally {
    chatState.deletingSessionId = null;
  }
}

export async function sendChatMessage(): Promise<{ sessionId: string | null; sources: ChatSource[] }> {
  const text = chatState.input.trim();
  if (!text || chatState.pending || chatState.streaming || chatState.loadingHistory) {
    return { sessionId: null, sources: [] };
  }

  chatState.messages.push({ role: 'user', content: text });
  chatState.messages.push({ role: 'assistant', content: '' });
  const idx = chatState.messages.length - 1;
  chatState.input = '';
  chatState.pending = true;

  let sessionId: string | null = chatState.sessionId;

  try {
    const res = await api.chat.send(text, chatState.sessionId ?? undefined);
    if (!res.ok || !res.body) throw new Error(`chat_failed_${res.status}`);

    const sid = res.headers.get('X-Session-Id');
    if (sid) {
      sessionId = sid;
      setActiveChatSession(sid);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as {
              text?: string;
              error?: string;
              done?: boolean;
              sources?: ChatSource[];
              session_id?: string;
              message_id?: string;
              sql_query?: SqlQueryMeta;
              community_summaries?: CommunitySummaryMeta[];
              narratives?: NarrativeMeta[];
              memory_episodes?: MemoryEpisodeMeta[];
              resources?: ResourceMeta[];
              sub_queries?: string[];
              counterfactual?: CounterfactualMeta;
            };
            if (parsed.session_id && !sessionId) {
              sessionId = parsed.session_id;
              setActiveChatSession(parsed.session_id);
            }
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              chatState.pending = false;
              chatState.streaming = true;
              chatState.messages[idx].content += parsed.text;
            }
            if (parsed.sources?.length) {
              chatState.messages[idx].sources = parsed.sources;
            }
            if (parsed.message_id) {
              chatState.messages[idx].id = parsed.message_id;
            }
            if (parsed.sql_query) {
              chatState.messages[idx].sql_query = parsed.sql_query;
            }
            if (parsed.community_summaries?.length) {
              chatState.messages[idx].community_summaries = parsed.community_summaries;
            }
            if (parsed.narratives?.length) {
              chatState.messages[idx].narratives = parsed.narratives;
            }
            if (parsed.memory_episodes?.length) {
              chatState.messages[idx].memory_episodes = parsed.memory_episodes;
            }
            if (parsed.resources?.length) {
              chatState.messages[idx].resources = parsed.resources;
            }
            if (parsed.sub_queries?.length) {
              chatState.messages[idx].sub_queries = parsed.sub_queries;
            }
            if (parsed.counterfactual) {
              chatState.messages[idx].counterfactual = parsed.counterfactual;
            }
          } catch (error) {
            if (error instanceof Error) throw error;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!chatState.messages[idx].content) {
      chatState.messages[idx].content = 'No response received. Please try again.';
    }

    chatState.pending = false;
    chatState.streaming = false;

    const sources = chatState.messages[idx].sources ?? [];
    try { await loadChatSessions(); } catch {}
    return { sessionId, sources };
  } catch (err) {
    chatState.pending = false;
    chatState.streaming = false;
    const detail = err instanceof Error ? err.message : '';
    chatState.messages[idx].content = detail || 'Something went wrong. Please try again.';
    try { await loadChatSessions(); } catch {}
    return { sessionId, sources: [] };
  }
}
