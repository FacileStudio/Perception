import { createAuthClient } from 'better-auth/svelte';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_URL ?? '/api',
  basePath: '/auth',
  plugins: [organizationClient()],
});
