import { api, type EventRow, type StatsSnapshot, type ChatMessage } from './api';

export const auth = $state({ authenticated: false, checking: true });

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
  pending: false,
  streaming: false,
  input: '',
});

export const eventsState = $state({
  events: [] as EventRow[],
  total: 0,
  loading: false,
  query: '',
  providerFilter: '',
  qualityFilter: '',
});
