# Perception — Deployment

Images, the two-container split, what to set before it will work, backups, and what it costs to
run.

## Images

Two Dockerfiles, both on `oven/bun:1.2-alpine`, both installing from the same workspace lockfile.

**`apps/api/Dockerfile`** — a `deps` stage installs with `--frozen-lockfile`, the runner stage
copies `node_modules` and `apps/api/src`, creates `/app/data`, exposes `8787` and runs
`bun run src/server.ts`. There is no build step; Bun executes the TypeScript directly.

**`apps/client/Dockerfile`** — a builder stage runs `bun run build` (SvelteKit with
`adapter-node`), and the runner stage copies `build/`, `package.json` and `node_modules`, then runs
`bun build/index.js`. It sets `PORT=3000`, `BODY_SIZE_LIMIT=Infinity` and defaults `ORIGIN` to
`https://perception.facile.studio`.

`BODY_SIZE_LIMIT=Infinity` is not decoration: resource uploads pass through the client proxy, and
SvelteKit's default ceiling would truncate them well below the API's own 50 MB limit.

## Two containers, one hostname

The suite standard is one container per app. Perception runs two, and only the client is exposed:

```
Traefik ──▶ client:3000 ──┬──▶ /api/*   proxied to api:8787
                           └──▶ /*       SvelteKit SSR and assets
```

So it satisfies one router and one hostname, but not one container. The split is real work to
undo — the client is a Node server, not static files, so it cannot simply be handed to nginx.
Treat it as a known deviation rather than something to "fix" casually.

Practical consequence: **do not route a second hostname at the API container.** The API's CORS
allow-list is `http://localhost:3000`, `http://localhost:5173` and `CLIENT_ORIGIN`, and sessions
are cookie-based. Reaching the API from anywhere else fails on CORS and silently drops cookies.

## Docker Compose

```sh
cp .env.example .env
docker compose up -d
```

`docker-compose.yml`:

- `api` — built from `apps/api/Dockerfile`, `expose: 8787` only, `.env` via `env_file`,
  `PERCEPTION_DATABASE_URL` forced to `file:/app/data/perception.db`, the `perception_data` volume
  mounted at `/app/data`, `restart: unless-stopped`, and a healthcheck hitting `/health` every 30 s
  with a 30 s start period and 5 retries.
- `client` — built from `apps/client/Dockerfile`, `expose: 3000`, `API_UPSTREAM=http://api:8787`,
  `ORIGIN` from `CLIENT_ORIGIN` (defaulting to `https://perception.facile.studio`), depends on the
  API being started, `restart: unless-stopped`.

`docker-compose.override.yml` publishes both ports on the host for local work. Docker Compose
merges it automatically, so a plain `docker compose up` locally gives you `localhost:3000` and
`localhost:8787` while a deploy that only reads the base file exposes nothing.

Note the healthcheck target: `/health` returns `200` even when startup failed, because a failed
migration sets `startupError` and still marks the process ready rather than crash-looping. It is a
liveness probe. For a real readiness signal, use `/ready`, which returns `503` until bootstrap
completes and executes `SELECT 1` against the database.

## Deploying to la ruche

Route one hostname at the `client` container's port `3000`. Set, at minimum:

```sh
CLIENT_ORIGIN=https://perception.facile.studio
PERCEPTION_SESSION_SECRET=<openssl rand -hex 32>
PERCEPTION_ADMIN_PASSWORD=<a real password>
```

All three default to empty or localhost, and none of them fails loudly. An unset session secret
signs sessions with an empty key; an unset admin password leaves `POST /auth/login` comparing
against `''`. Set `SSO_ONLY=true` once Authentik is wired up and the local path is no longer
needed.

For SSO against `porte.facile.studio`:

```sh
OIDC_ISSUER=https://porte.facile.studio/application/o/perception/
OIDC_CLIENT_ID=…
OIDC_CLIENT_SECRET=…
OIDC_REDIRECT_URL=https://perception.facile.studio/api/auth/oidc/callback
OIDC_SUCCESS_URL=https://perception.facile.studio
```

The redirect URL points at the **client** origin because the client proxies `/api/*` to the API.
`GET /auth/config` reports `oidc_enabled` only when issuer, client id, client secret and redirect
URL are all set — a partial configuration registers the routes but advertises SSO as unavailable,
which is a confusing state to debug.

Prefer the `dokploy` CLI over SSH plus docker for managing the deployment.

## After the first deploy

The container being healthy does not mean Perception works. Two things are still unset:

1. **API keys.** `anthropic_api_key` and `voyage_api_key` are database settings, not environment
   variables. Set them in the settings screen. Until then, every embedding and every chat turn
   fails while the health check stays green.
2. **The ingest secret.** `ingest_secret` is per workspace and has no default. Until it is set,
   `POST /ingest` rejects everything with `no_ingest_secret_configured`. Set the same value on the
   Perception delivery target in Nook.

Verify the round trip by sending a test alert from Nook to its Perception target, then checking
`GET /events`. If it does not land, `ingest_rejections` records the reason for every rejected
request — `timestamp_out_of_range`, `unsupported_schema_version`, `invalid_signature` or
`no_ingest_secret_configured`.

## Scaling

**The API cannot run more than one replica.** All 22 background workers run in-process on timers,
so a second instance duplicates every embedding job, every LLM call and every analysis pass. The
libSQL file database is also single-writer. If throughput ever becomes a problem, the workers have
to move out of the API process first.

The client is stateless and could be replicated, though there is little reason to.

## Data and backups

Everything is on the `perception_data` volume, in one file: `/app/data/perception.db`, plus its
`-wal` and `-shm` siblings. That single file holds events, embeddings, entities, chat history,
forecasts, settings and the API keys.

Back it up with the container stopped, or use SQLite's backup API — copying a live WAL database
with `cp` gives a file that may not open. Losing it loses every derived artifact too: embeddings,
narratives, communities and calibration history are all rebuilt only from events that no longer
exist.

`retention_days` defaults to `365`.

## Running costs

Estimates at typical Facile volume, prices as of May 2026. Perception is not a cost-sensitive
system at this scale, but the shape is worth knowing.

**Voyage AI embeddings** — `voyage-4-lite` at $0.02 per million tokens, roughly 300 tokens per
event:

| Volume | Monthly |
|---|---|
| 1k events | ~$0.01 |
| 10k events | ~$0.06 |
| 100k events | ~$0.60 |

A first deploy adds a one-time backfill spike. Retries are the same token count and rare.

**Anthropic chat** — Claude Sonnet at $3 per million input tokens and $15 per million output. A
turn sends roughly 2k–6k tokens of retrieved context and produces 300–600 tokens:

| Usage | Turns/day | Monthly |
|---|---|---|
| Light | 5 | ~$1–2 |
| Active | 20 | ~$4–8 |
| Heavy | 50 | ~$10–20 |

Background workers add to this: narratives, memory episodes, proposals and forecasts all call the
model on their own schedules. Pausing workers is the fastest way to cut spend on an idle instance.

**Infrastructure** — libSQL as a local file on la ruche is $0. Turso Cloud, if the database ever
moves off-box, has a free tier at 500 MB and 1 billion row reads per month, then around $29.

**Total** — under $1 idle, roughly $5–10 for normal operations, $20–30 for heavy chat with high
event volume. Token spend per workspace is tracked in the `token_usage` table and readable at
`GET /settings/usage`.
