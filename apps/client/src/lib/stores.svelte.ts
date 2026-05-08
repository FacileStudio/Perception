import { api, type ChatMessage, type ChatSessionSummary, type EventRow, type StatsSnapshot } from './api';

export const auth = $state({ authenticated: false, checking: true });
const ACTIVE_CHAT_SESSION_KEY = 'perception.active-chat-session';

export async function checkAuth() {
  try {
    const { authenticated } = await api.auth.status();
    auth.authenticated = authenticated;
  } catch {
    auth.authenticated = false;
  } finally {
    auth.checking = false;
  }
}

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

function persistActiveSessionId(sessionId: string | null) {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (sessionId) {
    localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, sessionId);
    return;
  }
  localStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
}

function readActiveSessionId(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(ACTIVE_CHAT_SESSION_KEY);
}

export function setActiveChatSession(sessionId: string | null) {
  chatState.sessionId = sessionId;
  persistActiveSessionId(sessionId);
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
  if (chatState.loadingSessions) {
    return;
  }
  chatState.loadingSessions = true;
  try {
    const { sessions } = await api.chat.sessions();
    chatState.sessions = sessions;
  } finally {
    chatState.loadingSessions = false;
  }
}

export async function openChatSession(sessionId: string) {
  chatState.loadingHistory = true;
  try {
    const { session } = await api.chat.session(sessionId);
    setActiveChatSession(session.id);
    chatState.messages = session.messages.map((message) => ({
      role: message.role,
      content: message.content,
      sources: message.sources,
    }));
    chatState.pending = false;
    chatState.streaming = false;
  } finally {
    chatState.loadingHistory = false;
  }
}

export async function restoreChatSession() {
  if (chatState.loadingHistory) {
    return;
  }
  if (chatState.sessions.length === 0) {
    await loadChatSessions();
  }
  if (chatState.messages.length > 0 && chatState.sessionId) {
    return;
  }
  const preferredSessionId = chatState.sessionId ?? readActiveSessionId() ?? chatState.sessions[0]?.id ?? null;
  if (!preferredSessionId) {
    startNewChat();
    return;
  }
  try {
    await openChatSession(preferredSessionId);
  } catch {
    chatState.sessions = chatState.sessions.filter((session) => session.id !== preferredSessionId);
    startNewChat();
  }
}

export async function deleteChatSession(sessionId: string) {
  chatState.deletingSessionId = sessionId;
  try {
    await api.chat.deleteSession(sessionId);
    const remainingSessions = chatState.sessions.filter((session) => session.id !== sessionId);
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

export const eventsState = $state({
  events: [] as EventRow[],
  total: 0,
  loading: false,
  query: '',
  providerFilter: '',
  qualityFilter: '',
});
