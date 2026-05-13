import { createAuthClient } from 'better-auth/svelte';
import { organizationClient } from 'better-auth/client/plugins';

const baseURL = typeof window !== 'undefined'
  ? window.location.origin
  : (import.meta.env.VITE_AUTH_URL || 'http://localhost:3000');

export const authClient = createAuthClient({
  baseURL,
  basePath: '/api/auth',
  plugins: [organizationClient()],
});
