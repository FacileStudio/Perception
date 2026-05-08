import { createClient } from '@libsql/client';
import { config } from '../config';

export const db = createClient({
  url: config.databaseUrl,
  authToken: config.databaseAuthToken || undefined,
});
