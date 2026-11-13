# Perception — Architecture

How a request reaches the database, what the tables look like, how a session is authenticated, and how Perception talks to the rest of the suite.

## Runtime topology

```text
Internet ──▶ Traefik ──▶ Go binary (:4000) ──┬──▶ /health /ready       liveness, readiness
                                             ├──▶ /docs /openapi.json  Scalar + OpenAPI
                                             ├──▶ /api/*               four modules
                                             └──▶ /*                   SPA catch-all
                                                               │
                                                         Postgres 16 (pgvector)
                                                               │
                        Antenne (HTTP Ingest) ───────────────▶ /api/ingest
                        Journal (HTTP)        ◀── slog handler
```

One process, one container, one Traefik router. The SvelteKit client is built to static files at image build time and served by the same Go binary through `tronc`'s `spa` package, so the client calls `/api/...` on its own origin.

## Components

| Piece | Where | What it does |
|---|---|---|
| Entrypoint | `apps/api/main.go` | Loads config, opens the DB, migrates, builds the router, starts workers and background sweeps, shuts down on `SIGINT`/`SIGTERM` |
| Router | `tronc/httpx.NewRouter` | Chi router with logging, recovery, and CORS middleware |
| Modules | `apps/api/modules/*` | Four domain packages: `auth`, `embeddings`, `events`, `ingest` |
| Schemas | `apps/api/schemas` | GORM models, the query layer. They create nothing |
| Migrations | `apps/api/migrations` | Ordered goose SQL, embedded and applied at boot by `tronc/migrate`: pgvector, porte's tables, the domain tables and their indexes |
| Internal | `apps/api/internal/*` | Shared packages: `database`, `documentation`, `env`, `identity`, `middleware` |
| Client | `apps/client` | SvelteKit 5 dashboard with `adapter-static` and `fallback: index.html` |

The four modules are registered inside a single `router.Route("/api", ...)` block in `main.go`.

## Request lifecycle

1. Traefik terminates TLS and forwards requests to the container on port 4000.
2. `tronc/httpx` middleware attaches the request logger, recovers panics, and applies CORS using `CORS_ALLOWED_ORIGINS`.
3. `health.Mount` answers `/health`, `/ready`, `/api/health`, and `/api/ready` before any application routing. `/ready` checks the database ping and embedding worker backlog health.
4. `apiref.Mount` serves `/docs` (Scalar UI) and `/docs/openapi.json` (OpenAPI 3.1 specification).
5. `/api/*` dispatches into the target module router. Protected routes execute `internal/middleware.RequireAuth`, which verifies the bearer token or session cookie.
6. The module handles validation and delegates to its service layer, which interacts with PostgreSQL through GORM.
7. Responses return through `tronc/httpjson`. Errors constructed with `tronc/errors` map directly to HTTP status codes.
8. Anything outside `/api`, `/docs`, and the health endpoints falls through to the SPA handler, serving `index.html` for client routing.

## Authentication

Perception supports two authentication methods:

- **Sessions** (browser cookies or bearer tokens) managed by `porte`. Registration and password login can be disabled by setting `SSO_ONLY=true`.
- **OIDC SSO** against Authentik (`porte.facile.studio`), using PKCE flow and redirect exchange.
- **HMAC-SHA256 signatures** for unauthenticated ingest endpoints (`/api/ingest`), verified against configured `INGEST_HMAC_SECRET` keys.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `events` | `id` PK, `source`, `provider_type`, `event_type`, `entity_type`, `entity_name`, `actor_email`, `occurred_at`, `quality`, `searchable_text`, `search` | Main event corpus; `search` is a generated `tsvector` column indexed with GIN |
| `ingest_rejections` | `id` PK, `reason`, `event_id`, `source_ip_hash`, `payload_hash`, `rejected_at` | Audit log of refused ingest deliveries, bounded by retention policy |
| `event_embeddings` | `event_id` PK, `embedding`, `model`, `status`, `attempts`, `last_error` | Vector embeddings stored as `vector(1024)` with HNSW cosine distance indexing |
| `porte_users` | `id` PK, `email`, `name`, `password_hash` | User identity table managed by porte |
| `porte_identities` | `id` PK, `user_id`, `provider`, `provider_subject` | External OIDC identity mappings |
| `porte_sessions` | `id` PK, `user_id`, `token_hash`, `expires_at` | Active user sessions |
| `porte_login_codes` | `code_hash` PK, `user_id`, `expires_at` | One-time codes for CLI login flow |

## Cross-app integration

- **Antenne**: Ingests signed events via HTTP POST to `/api/ingest`.
- **Journal**: Ships structured application logs over HTTP when `JOURNAL_URL` and `JOURNAL_TOKEN` are set.
- **Casier**: Injects secrets into the environment during local development (`mise run dev`).
- **Porte**: Manages user sessions, identity storage, and OIDC discovery.
