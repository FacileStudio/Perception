# Perception — Configuration

Every environment variable the code actually reads, and — just as important — the settings that
look like environment variables but are not.

## What is not an environment variable

`.env.example` lists eight variables that **no code reads**:

```
ANTHROPIC_API_KEY
VOYAGE_API_KEY
PERCEPTION_LLM_MODEL
PERCEPTION_EMBEDDING_MODEL
PERCEPTION_EMBEDDING_DIMENSIONS
PERCEPTION_STORE_RAW_PAYLOADS
PERCEPTION_EMAIL_BODY_INDEXING
PERCEPTION_RETENTION_DAYS
```

They moved into the database when Perception gained workspaces, and the example file was never
cleaned up. Setting them in `.env` does nothing at all — including, most memorably, the two API
keys, which is why a fresh deploy can look healthy while every embedding and every chat turn
fails.

Those settings now resolve through `apps/api/src/db/settings.ts`, in this precedence order:

1. **Workspace override** — the `organization.metadata` JSON blob for the active workspace.
2. **Instance setting** — a row in the `app_settings` table.
3. **Built-in default** — hardcoded in `DEFAULTS`.

Manage them through `GET /settings` and `PUT /settings`, or the settings screen in the client. The
API key values are masked on read (`••••••••` plus the last four characters), and each key reports
where its effective value came from.

| Setting key | Default | What it does |
|---|---|---|
| `anthropic_api_key` | — | Claude API key. Chat, narratives, memory and proposals need it |
| `voyage_api_key` | — | Voyage API key. The embedding workers need it |
| `llm_model` | `claude-sonnet-4-6` | Model used for chat and generation |
| `embedding_model` | `voyage-4-lite` | Embedding model |
| `embedding_dimensions` | `1024` | Embedding width. Changing it invalidates every stored vector |
| `retention_days` | `365` | Event retention window |
| `store_raw_payloads` | `false` | Whether raw envelope payloads are kept |
| `email_body_indexing` | `false` | Whether email bodies are indexed for retrieval |
| `notification_webhook_url` | — | Where notification alerts are posted |
| `ingest_secret` | — | HMAC secret for `POST /ingest`. Per workspace, no default — ingest fails closed with `no_ingest_secret_configured` until it is set |
| `workers_paused` | `false` | Global worker pause switch |

`ingest_secret` is set per workspace and is not in the settings route's allowed-key list — it is
managed through the workspace settings endpoints (`GET`/`PUT /workspaces/:id/settings`).

## Environment variables

Perception does not use `tronc`, so there is no `troncenv.Core` block and no fail-fast on a missing
variable. Every variable below has a default and the process starts without any of them — which is
convenient in development and dangerous in production, since an unset session secret or admin
password produces a running, wide-open service rather than an error.

### Core

| Variable | Required | Default | What it does |
|---|---|---|---|
| `PORT` | no | `8787` | API listen port |
| `PERCEPTION_DATABASE_URL` | no | `file:./data/perception.db` | libSQL URL. `file:` for local SQLite, an `https://` Turso URL for remote |
| `PERCEPTION_DATABASE_AUTH_TOKEN` | no | — | Auth token for a remote libSQL instance |
| `PERCEPTION_DATA_DIR` | no | derived | Data directory. Defaults to the directory of `PERCEPTION_DATABASE_URL` |
| `CLIENT_ORIGIN` | yes in production | — | Public client origin. Appended to the CORS allow-list next to `http://localhost:3000` and `http://localhost:5173`. Get it wrong and sessions fail with opaque CORS errors |

### Ingest

| Variable | Required | Default | What it does |
|---|---|---|---|
| `PERCEPTION_INGEST_MAX_SKEW_SECONDS` | no | `300` | Maximum clock skew between the `x-nook-timestamp` header and the server. Outside it, ingest is rejected with `timestamp_out_of_range` |

The ingest secret itself is a per-workspace setting, not a variable. See above.

### Authentication

| Variable | Required | Default | What it does |
|---|---|---|---|
| `PERCEPTION_ADMIN_USERNAME` | no | `admin` | Username recorded for the local account |
| `PERCEPTION_ADMIN_PASSWORD` | yes unless `SSO_ONLY` | — | Local login password. **Empty by default**, and `POST /auth/login` compares against it directly |
| `PERCEPTION_SESSION_SECRET` | yes | — | Session signing key. Empty by default |
| `PERCEPTION_LOCAL_DEV_AUTH_DISABLED` | no | `false` | `true` makes `/auth/status` always return an authenticated `Dev User`. Development only |
| `SSO_ONLY` | no | `false` | `true` rejects `POST /auth/login`, and `better-auth` sign-up and email sign-in |

### OIDC

OIDC routes are only registered when `OIDC_ISSUER` **and** `OIDC_CLIENT_ID` are both set.
`GET /auth/config` reports `oidc_enabled` only when issuer, client id, client secret and redirect
URL are all present — so a partially configured setup can register routes while advertising itself
as disabled.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `OIDC_ISSUER` | for SSO | — | Issuer URL. Discovery is fetched from it |
| `OIDC_CLIENT_ID` | for SSO | — | Client id of the Authentik application |
| `OIDC_CLIENT_SECRET` | for SSO | — | Client secret. Also used to refresh tokens during profile sync |
| `OIDC_REDIRECT_URL` | for SSO | — | Callback URL. Must match the provider exactly |
| `OIDC_SUCCESS_URL` | for SSO | `http://localhost:3000` | Where the callback redirects. Success goes to `<url>/chat`, failure to `<url>/login?error=oidc_failed` |

Against the suite's Authentik at `porte.facile.studio`, `OIDC_ISSUER` is the application's issuer
and `OIDC_REDIRECT_URL` points at the **client** origin, since the client proxies `/api/*` to the
API — for example `https://perception.facile.studio/api/auth/oidc/callback`.

### Client

Read by the SvelteKit app, not by the API.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `API_UPSTREAM` | no | `http://api:8787` | Where `hooks.server.ts` proxies `/api/*`. Server-side only |
| `ORIGIN` | yes in production | `https://perception.facile.studio` | SvelteKit's origin check. Set from `CLIENT_ORIGIN` in the compose file |
| `PORT` | no | `3000` | Client listen port |
| `BODY_SIZE_LIMIT` | no | `Infinity` in the image | SvelteKit request body ceiling; raised so resource uploads pass through the proxy |
| `VITE_API_URL` | no | `/api` | Build-time API base for the browser. The default routes through the proxy, which is what you want |
| `VITE_AUTH_URL` | no | `http://localhost:3000` | Build-time base URL for the `better-auth` browser client |

`VITE_*` values are baked in at build time, not read at runtime. Changing one needs a rebuild.

### Local compose

| Variable | Required | Default | What it does |
|---|---|---|---|
| `API_PORT` | no | `8787` | Host port for the API, from `docker-compose.override.yml` |
| `CLIENT_PORT` | no | `3000` | Host port for the client, same file |

## Body limits

Set in `server.ts`, not configurable:

| Route | Limit |
|---|---|
| `/ingest` | 1 MB |
| `/resources` | 50 MB |

## Privacy defaults

Perception defaults to storing less:

- `store_raw_payloads` is `false`, so only normalized facts are kept.
- `email_body_indexing` is `false`, so email bodies are not indexed for retrieval.
- Emails are stored as SHA-256 hashes.
- When an envelope declares `privacy.containsPii`, every field whose key contains `email` or
  `phone` is replaced with `[REDACTED]` before storage.

Turning any of these on increases what a compromised database would reveal. Decide deliberately.
