# Perception

Context brain for Facile operations. Ingests structured events from the suite, embeds them,
resolves the entity graph, and answers grounded operational questions about them. Go API +
SvelteKit frontend + PostgreSQL/pgvector.

**Perception is the engine; Kori is the agent.** Perception is headless — it speaks HTTP and
MCP and has no chat UI. Kori is the suite's mascot and its only conversational surface, lives
in `apps/api/modules/kori` plus the client, and runs on
[nacelle](https://github.com/FacileStudio/nacelle), the suite agent SDK. Neither exists yet.

**This repo is mid-rewrite.** A TypeScript version ran from 2026-05-08 to 2026-08-07 and was
retired unused; it is gone from the tree and lives in git history on `main`. What exists now is
the chassis and auth. Before writing any feature code, read [`ROADMAP.md`](ROADMAP.md) — it
explains what was deliberately cut and why — and [`docs/SPEC.md`](docs/SPEC.md) for the
contracts. Do not reintroduce something from the old app without checking §9 of the roadmap
first; most of it was deleted on purpose.

## Tech Stack

| Layer   | Stack                                                                    |
| ------- | ------------------------------------------------------------------------ |
| API     | Go 1.25, Chi v5, GORM, PostgreSQL 16 + pgvector, tronc v0.14.0           |
| Client  | SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, muse (`@facile/muse`), bits-ui |
| Build   | `go build`, Bun                                                          |
| Deploy  | Docker Compose, one distroless container serving API + client, Dokploy + Traefik |
| Auth    | [porte](https://github.com/FacileStudio/porte) v0.3.0 — sessions, argon2id passwords, Authentik OIDC, `SSO_ONLY` |
| Logging | Journal SDK; secrets from Casier in dev, Dokploy in production           |
| Planned | Voyage `voyage-4-lite` embeddings; `claude-opus-5` through nacelle; MCP server via `modelcontextprotocol/go-sdk` |

## Project Structure

```
apps/
  api/                  Go backend
    main.go             Entrypoint: env, logger, database, chassis, routes, shutdown
    apiref_test.go      Every route must appear in a module's documentation.go
    seam_test.go        modules/auth may be imported by main.go alone
    internal/
      identity/         Identity and the Authenticator interface — the porte seam
      env/              Config on top of tronc/env.Core, plus Config.Porte()
      database/         GORM + Postgres handle
      middleware/       RequireAuth (porte + profile hydration), rate limiting
      documentation/    Aliases of tronc/apiref, so modules write against a local package
    modules/auth/       The porte adapter: profile lookup and /auth/me
    modules/ingest/     The signed intake path from Antenne, and the rejection log
    modules/events/     The browsable corpus: filtered listing with cursor paging
    schemas/            Event, IngestRejection and EventEmbedding models: the query layer
    migrations/         Ordered goose SQL, embedded and applied at boot by tronc/migrate
  client/               SvelteKit dashboard
    src/lib/backend.ts  API client
    src/lib/auth.svelte.ts, theme.svelte.ts   Runes stores
    src/routes/(auth)/  Login and register shell
    src/routes/(app)/   Authenticated shell
docs/SPEC.md            Ingest contract, data model, retrieval design
ROADMAP.md              Why the rewrite, what was cut, phase order
scripts/check.sh        The quality gate
Dockerfile              bun build -> golang:1.25-alpine -> distroless
docker-compose.yml      Deploy stack; docker-compose.dev.yml is the local database only
```

## Commands

```sh
mise install         # tools, and the git hooks, once per clone
mise run install     # client dependencies
mise run db-up       # local PostgreSQL with pgvector
mise run dev         # API with secrets injected from Casier
mise run dev-offline # the same, from Casier's last-known-good cache
mise run dev-client  # SvelteKit dev server
mise run check       # gofmt, go vet, go test, then the client type-check
mise run format      # rewrite Go sources in place
```

The gate is `sh scripts/check.sh` and is deliberately not run through mise: `mise run` resolves
every tool in the merged config before running a task body, so an unrelated broken tool in a
global config would take the gate down with it. It resolves `go` from `GOROOT` when set,
because mise pins a version while leaving another `go` earlier on PATH.

`mise install` wires the git hooks through lefthook. The shared conventional-commit check
comes from `FacileStudio/hooks`, pinned by tag in `lefthook.yml`. `scripts/check.sh` is
unchanged and still the gate, now run as a lefthook `pre-push` job.

## Conventions and Gotchas

- **No inline comments.** Doc comments above a type or function only, and only to explain a
  decision a reader would otherwise undo. The suite reads this way; match it.
- **Postgres only, tests included.** `check.sh` fails the build on any SQLite/MySQL driver in
  `go.mod`: a test on SQLite builds a different schema from the GORM tags and proves nothing
  about the DDL that ships.
- **The database image must be `pgvector/pgvector:pg16`.** The baseline migration runs
  `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public`; plain `postgres:16` fails at boot.
- **Migrations are ordered SQL** in `apps/api/migrations/`, applied at boot by `tronc/migrate`
  behind an advisory lock. `AutoMigrate` never runs and `scripts/check.sh` fails on it outside a
  test file. Add a numbered file with Up and Down, then change the struct by hand;
  `TestGORMModelsMatchTheMigratedSchema` catches a struct the migrations do not match. Keep
  `public.vector` and `public.vector_cosine_ops` qualified: a test schema's `search_path` does
  not include `public`. A failed migration exits 1. `docker run <image> migrate status`
  answers without a shell.
- **porte's tables live in the baseline.** porte/pg's `Schema` no longer runs at boot;
  `TestPorteSchemaIsInTheMigrations` fails when a porte bump changes it, and that change then
  needs its own migration.
- **Every route needs an entry in its module's `documentation.go`**, or `apiref_test.go` fails.
  Fix the registry, never the test. That registry is what `/docs` renders.
- **`internal/documentation/` declares `package docs`, and importers must alias it.** A Go
  package literally named `documentation` is silently discarded by `go/build` — its files are
  reported as `IgnoredGoFiles` and importers fail with `build constraints exclude all Go files`,
  with no build tag anywhere to explain it. Import it as
  `documentation "…/internal/documentation"`. Casier does the same thing for the same reason.
- **The porte seam is load-bearing, and it already paid for itself.** Auth is
  `github.com/FacileStudio/porte`; swapping the hand-rolled module for it was a change to one
  constructor call because nothing outside `main.go` named the implementation. Keep it that
  way: feature modules take `identity.Authenticator` in `RegisterRoutes`, never `*auth.Service`;
  only `main.go` imports `modules/auth`; only `main.go` and `modules/auth` build a porte kit
  (`porte/session`, `porte/local`, `porte/oidc`). `seam_test.go` enforces both rules. The
  contract package `porte` and the storage package `porte/pg` are exempt and may be imported
  anywhere — neither authenticates anybody. This is a deliberate divergence from Casier — do
  not port its pattern back.
- **porte mounts eight of the nine auth routes**, from `main.go`, not from `modules/auth`. That
  module holds the profile lookup porte declines to make and `GET /auth/me`. Its
  `documentation.go` still has to describe every porte route, because `/docs` is Perception's
  contract with its callers and `TestEveryRouteIsDocumented` walks the router that ships.
- **Cookie-borne mutations need `X-Facile-CSRF`.** porte answers 403 without it. The client
  sends it on every non-GET/HEAD/OPTIONS call from `backend.ts`; a new caller must too.
  Bearer callers are exempt — nothing attaches a header on their behalf.
- **Perception keeps no user table.** `porte_users` is the profile table; no domain row hangs
  off an account, so there is nothing to join and no parallel table to keep in step.
- **`events.actor_email` is source-reported and is not a Facile identity.** Antenne's envelope
  package says so itself: the value is whatever a third-party payload carried. It answers
  "what did this person touch" and must never be joined to an SSO account. The August roadmap
  claimed otherwise; it was wrong.
- **Ingest is unauthenticated by design.** The HMAC signature is the credential — requiring a
  session as well would mean Antenne holding one. Every refusal is written to
  `ingest_rejections` so a misconfigured emitter is visible rather than silent.
- **Database tests use `tronc/testdb`**, which gives each test binary its own Postgres schema.
  A shared schema deadlocks in porte's DDL when two packages migrate at once, and leaks one
  package's fixtures into another's assertions. Both happened before it was adopted.
- **Do not store OIDC access or refresh tokens.** The old app did, which is why the August 2026
  backup contains live credentials.
- Errors, JSON, logging, CORS, health and the API reference all come from `tronc`. Never
  hand-roll one of them.
- The client is `adapter-static`; the Go binary serves the build via `tronc/spa`. There is no
  Node server in production, and `CLIENT_DIR` is set explicitly in the Dockerfile because the
  distroless base carries its own working directory.
- Client uses Svelte 5 runes (`$state`, `$props`, `$derived`, `$effect`) and muse tokens. Never
  hardcode a hex colour.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. The API exits 1 without it |
| `APP_ENV` | No | development/staging/production. Never gates security behaviour |
| `PORT` | No | Default 4000 |
| `LOG_LEVEL` | No | debug/info/warn/error, default info |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated, read through `tronc/env`; legacy names remain fallbacks. Unset denies every cross-origin caller; `*` is refused at startup because the API sends credentials |
| `PUBLIC_URL` | No | Public origin for links that leave the server. Defaults to the first CORS origin |
| `SSO_ONLY` | No | Removes the local login and register routes entirely when true — porte does not register them, so there is no endpoint to probe |
| `INGEST_HMAC_SECRET` | For ingest | Signs the Antenne endpoint. Must match Antenne's Perception delivery target. Unset means every delivery is refused, and the API warns at boot |
| `INGEST_HMAC_SECRET_PREVIOUS` | No | Accepted alongside the current key so a rotation needs no synchronised restart |
| `INGEST_MAX_SKEW_SECONDS` | No | Accepted clock difference, default 300 |
| `PERCEPTION_ADMIN_EMAILS` | No | Comma-separated. Empty means nobody — admin routes fail closed |
| `OIDC_ISSUER` | No | Enables SSO. `porte.facile.studio/application/o/perception/` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URL` | If OIDC | Required together once the issuer is set; validated at startup |
| `OIDC_SUCCESS_URL` | No | Redirect after login, defaults to the first CORS origin |
| `JOURNAL_URL` / `JOURNAL_TOKEN` | No | Log shipping. The URL must end in `/api` or every line is silently dropped |
| `CLIENT_DIR` | No | Built client directory served by the API, default `./client` |
| `TEST_DATABASE_URL` | No | Test-only Postgres; unset makes database tests skip loudly |

Reserved for later phases — present in `.env.example` and `docker-compose.yml` as commented
lines, not read by any code yet: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`.

## Suite context

- Events arrive from **Antenne**, the suite event bus (renamed from Nook on 2026-08-07; its
  headers are `x-antenne-*`). Perception is a consumer, not a peer of other apps — see the
  `Suite` repo's `INTERCONNECTIVITY.md`.
- **nacelle** is the agent SDK Kori runs on. It is a dependency, never vendored: nothing
  Perception-shaped may leak into it. If a nacelle change would mention events, entities or
  citations, the abstraction is wrong — keep it in `modules/kori`.
- Identity federates to **Authentik** at `porte.facile.studio`, app slug `perception`.
- Logs ship to **Journal**; secrets come from **Casier** (project `perception`).
- The chassis is **tronc**; read it before writing HTTP plumbing, because it probably already
  exists there.
