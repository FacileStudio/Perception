import { browser } from '$app/environment';

/*
 * In production one Go binary serves both the SPA and the API, so a same-origin
 * `/api` is always correct. `VITE_API_URL` exists only for the case where the
 * client is served from somewhere the API is not — a separate dev host, or a
 * preview deploy — and dev normally leans on the Vite proxy instead.
 */
const configuredOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const API_BASE = configuredOrigin ? `${configuredOrigin}/api` : '/api';

type FetchOptions = {
	method?: string;
	body?: unknown;
	query?: Record<string, string | number | undefined>;
};

/** The methods porte treats as non-mutating, and so exempt from the CSRF header. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
	status: number;
	code: string;

	constructor(message: string, status: number, code = '') {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

function readString(source: Record<string, unknown>, key: string): string {
	const value = source[key];
	return typeof value === 'string' ? value : '';
}

/** Unwraps the tronc error envelope `{"error":{"code","message"}}`. */
function parseError(body: string, status: number): ApiError {
	let message = '';
	let code = '';

	try {
		const parsed: unknown = JSON.parse(body);
		if (parsed && typeof parsed === 'object') {
			const payload = parsed as Record<string, unknown>;
			const nested = payload.error;
			if (nested && typeof nested === 'object') {
				const inner = nested as Record<string, unknown>;
				message = readString(inner, 'message');
				code = readString(inner, 'code');
			} else if (typeof nested === 'string') {
				message = nested;
			}
			if (!message) message = readString(payload, 'message');
			if (!code) code = readString(payload, 'code');
		}
	} catch {
		message = '';
	}

	return new ApiError(message || `HTTP ${status}`, status, code);
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
	if (!browser) throw new ApiError('The API is only reachable from the browser', 0, 'no_browser');

	const method = options.method ?? 'GET';
	const headers: Record<string, string> = {};

	if (options.body !== undefined) {
		headers['Content-Type'] = 'application/json';
	}

	/*
	 * porte's second lock on the cookie transport. SameSite=Lax stops
	 * cross-site form posts; a header a browser will not attach to a simple
	 * cross-origin request stops the rest. Any non-empty value counts, so
	 * there is no token to fetch or rotate — and without it every mutating
	 * call authenticated by the cookie is answered 403.
	 */
	if (!SAFE_METHODS.has(method)) {
		headers['X-Facile-CSRF'] = '1';
	}

	// Build URL with query parameters
	let url = `${API_BASE}${path}`;
	if (options.query && Object.keys(options.query).length > 0) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(options.query)) {
			if (value !== undefined) {
				params.append(key, String(value));
			}
		}
		const queryString = params.toString();
		if (queryString) {
			url += `?${queryString}`;
		}
	}

	const response = await fetch(url, {
		method,
		headers,
		credentials: 'include',
		body: options.body === undefined ? undefined : JSON.stringify(options.body)
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw parseError(body, response.status);
	}

	if (response.status === 204) return undefined as T;

	const body = await response.text().catch(() => '');
	if (!body) return undefined as T;

	try {
		return JSON.parse(body) as T;
	} catch {
		throw new ApiError('Unexpected response from server', response.status, 'invalid_response');
	}
}

export type EventSummary = {
	id: string;
	occurred_at: string;
	provider: string;
	event_type: string;
	entity_type: string;
	entity_name: string;
	actor_name: string;
	title: string;
	summary: string;
	url?: string;
	quality: string;
};

export type EventPage = {
	events: EventSummary[];
	next_cursor?: string;
};

export type AuthConfig = {
	sso_only: boolean;
	oidc_enabled: boolean;
};

export type AuthResponse = {
	user_id: string;
};

export type Me = {
	id: string;
	email: string;
	name: string;
	avatar_url: string;
};

export type Credentials = {
	email: string;
	password: string;
	name?: string;
};

export const backend = {
	authConfig: () => request<AuthConfig>('/auth/config'),
	login: (credentials: Credentials) =>
		request<AuthResponse>('/auth/login', { method: 'POST', body: credentials }),
	register: (credentials: Credentials) =>
		request<AuthResponse>('/auth/register', { method: 'POST', body: credentials }),
	logout: () => request<void>('/auth/logout', { method: 'POST', body: {} }),
	me: () => request<Me>('/auth/me'),
	events: (params?: { provider?: string; type?: string; limit?: number; cursor?: string }) =>
		request<EventPage>('/events', {
			method: 'GET',
			query: params
		})
};

export const OIDC_START_URL = `${API_BASE}/auth/oidc`;
