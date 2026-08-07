import { browser } from '$app/environment';
import { backend, type AuthConfig, type Credentials, type Me } from '$lib/backend';

class AuthState {
	user = $state<Me | null>(null);
	config = $state<AuthConfig | null>(null);
	loaded = $state(false);

	get isAuthenticated() {
		return this.user !== null;
	}

	get ssoOnly() {
		return this.config?.sso_only ?? false;
	}

	get oidcEnabled() {
		return this.config?.oidc_enabled ?? false;
	}

	/**
	 * Resolves the session cookie and the instance auth config in one pass. Both
	 * failures are non-fatal: a logged-out visitor and an unreachable config
	 * endpoint must still land on a usable login screen.
	 */
	async load() {
		if (!browser) return;

		const [me, config] = await Promise.all([
			backend.me().catch(() => null),
			backend.authConfig().catch(() => null)
		]);

		this.user = me;
		this.config = config;
		this.loaded = true;
	}

	async login(credentials: Credentials) {
		await backend.login(credentials);
		this.user = await backend.me();
	}

	async register(credentials: Credentials) {
		await backend.register(credentials);
		this.user = await backend.me();
	}

	async logout() {
		try {
			await backend.logout();
		} finally {
			this.user = null;
		}
	}
}

export const auth = new AuthState();
