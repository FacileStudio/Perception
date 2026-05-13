import { dirname } from 'node:path';

function resolveDataDir(): string {
  if (process.env.PERCEPTION_DATA_DIR) return process.env.PERCEPTION_DATA_DIR;
  const dbUrl = process.env.PERCEPTION_DATABASE_URL ?? 'file:./data/perception.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  return dirname(dbPath);
}

export const config = {
  port: parseInt(process.env.PORT ?? '8787', 10),
  databaseUrl: process.env.PERCEPTION_DATABASE_URL ?? 'file:./data/perception.db',
  databaseAuthToken: process.env.PERCEPTION_DATABASE_AUTH_TOKEN ?? '',
  ingestSecretCurrent: process.env.PERCEPTION_INGEST_SECRET_CURRENT ?? '',
  ingestSecretPrevious: process.env.PERCEPTION_INGEST_SECRET_PREVIOUS ?? '',
  ingestMaxSkewSeconds: parseInt(process.env.PERCEPTION_INGEST_MAX_SKEW_SECONDS ?? '300', 10),
  adminUsername: process.env.PERCEPTION_ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.PERCEPTION_ADMIN_PASSWORD ?? '',
  sessionSecret: process.env.PERCEPTION_SESSION_SECRET ?? '',
  localDevAuthDisabled: process.env.PERCEPTION_LOCAL_DEV_AUTH_DISABLED === 'true',
  oidcIssuer: process.env.OIDC_ISSUER ?? '',
  oidcClientId: process.env.OIDC_CLIENT_ID ?? '',
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
  oidcRedirectUrl: process.env.OIDC_REDIRECT_URL ?? '',
  oidcSuccessUrl: process.env.OIDC_SUCCESS_URL ?? '',
  ssoOnly: process.env.SSO_ONLY === 'true',
  dataDir: resolveDataDir(),
} as const;
