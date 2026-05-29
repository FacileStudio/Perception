import { authClient } from '$lib/auth-client';
import { api } from '$lib/api';
import type { AuthUser } from '$lib/api';

export const auth = $state({
  authenticated: false,
  checking: true,
  user: null as AuthUser | null,
  config: { sso_only: false, oidc_enabled: false },
  configLoaded: false,
  workspace: null as { id: string; name: string; slug: string } | null,
  workspaces: [] as Array<{ id: string; name: string; slug: string; role: string }>,
});

export async function checkAuth() {
  try {
    const session = await authClient.getSession();
    if (session.data?.user) {
      auth.authenticated = true;
      const me = await api.users.me().catch(() => null);
      auth.user = {
        id: session.data.user.id,
        email: session.data.user.email,
        name: session.data.user.name,
        image: session.data.user.image ?? null,
        color: '#818cf8',
        source: me?.user?.source ?? 'local',
      };
      await loadWorkspaces();
    } else {
      const legacy = await api.auth.status().catch(() => null);
      if (legacy?.authenticated && legacy.user) {
        auth.authenticated = true;
        auth.user = legacy.user;
        await loadWorkspaces();
      } else {
        auth.authenticated = false;
        auth.user = null;
      }
    }
  } catch {
    auth.authenticated = false;
    auth.user = null;
  } finally {
    auth.checking = false;
  }
}

export async function loadWorkspaces() {
  try {
    const res = await api.workspaces.list();
    auth.workspaces = res.workspaces;
    if (res.active_workspace_id) {
      auth.workspace = res.workspaces.find(w => w.id === res.active_workspace_id) ?? res.workspaces[0] ?? null;
    } else if (res.workspaces.length > 0) {
      auth.workspace = res.workspaces[0];
    }
  } catch {
  }
}

export async function switchWorkspace(workspaceId: string) {
  try {
    await api.workspaces.switchTo(workspaceId);
    auth.workspace = auth.workspaces.find(w => w.id === workspaceId) ?? null;
  } catch {
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
