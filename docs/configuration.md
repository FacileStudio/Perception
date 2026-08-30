# Perception — Configuration

Every environment variable the API reads, taken from `apps/api/internal/env`, `tronc/env`, and `tronc/spa`.

Configuration is loaded once at process startup. Missing required variables cause the process to fail immediately with a non-zero exit code.

## Core

These settings come from `tronc/env`'s `LoadCore` and are standard across Go applications in the Facile suite.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `PORT` | no | `8080` | HTTP server listen port |
| `APP_ENV` | no | `development` | Environment name: `development`, `staging`, `production` |
| `LOG_LEVEL` | no | `info` | Log severity level: `debug`, `info`, `warn`, `error` |
| `CORS_ALLOWED_ORIGINS` | no | — | Comma-separated list of allowed cross-origin URLs |
| `JOURNAL_URL` | no | — | Journal log shipping endpoint URL |
| `JOURNAL_TOKEN` | no | — | Journal authentication token for log ingestion |
| `TRUSTED_PROXIES` | no | — | CIDR blocks of trusted upstream proxies |

The trap: `DATABASE_URL` is strictly required. If unset or invalid, startup aborts immediately.

`PORT` defaults to `8080` in `tronc`, but Dockerfile and `docker-compose.yml` pin it to `4000`.

## Perception-specific

| Variable | Required | Default | What it does |
|---|---|---|---|
| `PUBLIC_URL` | no | — | Public base URL; falls back to the first CORS origin if unset |
| `PERCEPTION_ADMIN_EMAILS` | no | — | Comma-separated emails allowed administrative actions |
| `INGEST_HMAC_SECRET` | no | — | Active HMAC-SHA256 secret for validating incoming Antenne deliveries |
| `INGEST_HMAC_SECRET_PREVIOUS` | no | — | Secondary HMAC secret accepted during zero-downtime key rotation |
| `INGEST_MAX_SKEW_SECONDS` | no | `300` | Allowed clock drift window in seconds for ingest timestamps |
| `VOYAGE_API_KEY` | no | — | API key for Voyage AI embeddings worker; worker remains idle if unset |
| `CLIENT_DIR` | no | `./client` | Path to compiled SvelteKit static build files |

When `INGEST_HMAC_SECRET` is unset, the `/api/ingest` route refuses deliveries with `no_ingest_secret_configured` and logs a startup warning.

When `VOYAGE_API_KEY` is not provided, the asynchronous embedding worker stays disabled, which leaves `/ready` green and prevents spurious readiness alerts.

## OIDC authentication

OIDC is enabled whenever `OIDC_ISSUER` is populated. When enabled, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URL` become mandatory.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `OIDC_ISSUER` | no | — | Authentik OpenID Connect issuer URL |
| `OIDC_CLIENT_ID` | with issuer | — | OAuth2 client identifier |
| `OIDC_CLIENT_SECRET` | with issuer | — | OAuth2 client secret |
| `OIDC_REDIRECT_URL` | with issuer | — | Callback URL for OIDC authorization response |
| `OIDC_SUCCESS_URL` | no | — | Post-login redirect URL; defaults to `CORS_ALLOWED_ORIGINS[0]` |
| `SSO_ONLY` | no | `false` | When true, disables local registration and password login routes |

Setting `SSO_ONLY=true` without `OIDC_ISSUER` is rejected at startup to prevent locking out all authentication paths.
