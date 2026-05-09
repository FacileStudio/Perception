import { api } from '$lib/api';
import type { AuthUser } from '$lib/api';

export const auth = $state({
  authenticated: false,
  checking: true,
  user: null as AuthUser | null,
  config: { sso_only: false, oidc_enabled: false },
  configLoaded: false,
});

export async function checkAuth() {
  try {
    const { authenticated, user } = await api.auth.status();
    auth.authenticated = authenticated;
    auth.user = user;
  } catch {
    auth.authenticated = false;
    auth.user = null;
  } finally {
    auth.checking = false;
  }
}

export async function loadAuthConfig() {
  try {
    const cfg = await api.auth.config();
    auth.config = cfg;
  } catch {
  } finally {
    auth.configLoaded = true;
  }
}
