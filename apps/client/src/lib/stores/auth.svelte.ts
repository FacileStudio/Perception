import { api } from '$lib/api';

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
