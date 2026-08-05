# Perception

Operational context brain for Facile — it ingests signed event envelopes from Nook, turns them
into durable business memory, and answers grounded questions about what happened through a chat
interface.

Perception is a stack outlier: libSQL rather than PostgreSQL, Claude and Voyage AI rather than no
model at all, and a retrieval layer built out of nine parallel lanes rather than a single vector
search. Every answer is grounded in stored events, and event content is treated as untrusted
evidence, never as instructions.

Live at [perception.facile.studio](https://perception.facile.studio).

## What it does

- Ingests `NookEventEnvelope` payloads over a single HMAC-signed endpoint, with replay protection
- Infers a schema per provider and event type, then extracts facts against it; unknown shapes are
  stored at `quality = degraded` rather than dropped
- Builds an ontology of concepts and stable capabilities so new providers do not need new enums
- Resolves entities across providers, links relations, detects communities and writes narratives
- Answers questions over that memory with Claude, retrieving through nine lanes and citing events
- Runs statistical analysis in the background — change points, drift, Granger causality, graph
  health, topological gap detection
- Generates and scores calibrated forecasts, plus action proposals from detected gaps
- Indexes uploaded documents alongside events as retrievable resources
- Isolates everything by workspace, with local password auth or OIDC SSO

## Stack

| Layer | Tech |
|---|---|
| API | Bun 1.2, Hono 4, libSQL (`@libsql/client` 0.14), `better-auth` 1.6, `jose` 6 |
| Client | SvelteKit 2 with Svelte 5 runes, Tailwind CSS 4, bits-ui, Vite 6, `adapter-node` |
| Models | Claude Sonnet 4.6 through the Vercel AI SDK, Voyage AI `voyage-4-lite` at 1024 dimensions |
| Storage | libSQL file database — SQLite with vector search and FTS, 56 tables |
| Deploy | Docker Compose, two containers behind one hostname, Dokploy on la ruche |

## Quick start

```sh
cp .env.example .env
docker compose up -d
```

The base compose file uses `expose`, not `ports`, because it targets a reverse proxy.
`docker-compose.override.yml` publishes the API on `8787` and the client on `3000` locally, and
Docker Compose picks it up automatically. Then open <http://localhost:3000>.

The Anthropic and Voyage API keys are **not** environment variables. Set them in the app once it
is running, under settings — see [docs/configuration.md](docs/configuration.md).

### Local development

```sh
cp .env.example .env
mise run dev
```

API on `http://localhost:8787`, client on `http://localhost:3000`. Migrations run on API startup.

## Configuration

| Variable | What it does |
|---|---|
| `PERCEPTION_DATABASE_URL` | libSQL URL. Default `file:./data/perception.db` |
| `PERCEPTION_SESSION_SECRET` | Session signing key |
| `PERCEPTION_ADMIN_PASSWORD` | Password for local login; the only credential when SSO is off |
| `CLIENT_ORIGIN` | Public client origin. Must match, or CORS and session cookies break |
| `OIDC_ISSUER` | Authentik issuer URL; enables SSO when set with client id, secret and redirect |
| `SSO_ONLY` | `true` disables password login entirely |

Full reference: [docs/configuration.md](docs/configuration.md).

## Structure

```
apps/
  api/       Bun + Hono service — routes/, ingest/, chat/, entities/, forecasts/, workers/, db/
  client/    SvelteKit app that also proxies /api/* to the API container
docs/        Architecture, configuration, development, deployment, API
```

## Documentation

| Doc | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | Topology, the ingest pipeline, retrieval lanes, the data model, workers |
| [Configuration](docs/configuration.md) | Every environment variable, and the settings that are not variables |
| [Development](docs/development.md) | Local setup, tests, migrations, conventions |
| [Deployment](docs/deployment.md) | Docker, the two-container split, Dokploy, backups, running costs |
| [API](docs/api.md) | HTTP endpoints, the ingest contract, payloads |

---

Part of the [Facile Suite](https://facile.studio) — self-hosted tools for creative studios
and freelancers. One login, zero cloud dependency.
