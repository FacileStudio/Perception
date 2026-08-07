# Perception

Context brain for Facile operations. Ingests structured events from the suite and answers
grounded operational questions about them. Go API + SvelteKit frontend + PostgreSQL/pgvector.

**This repo is mid-rewrite.** A TypeScript version ran from 2026-05-08 to 2026-08-07 and was
retired unused; it is gone from the tree and lives in git history on `main`. What exists now is
the chassis and auth. Before writing any feature code, read [`ROADMAP.md`](ROADMAP.md) — it
explains what was deliberately cut and why — and [`docs/SPEC.md`](docs/SPEC.md) for the
contracts. Do not reintroduce something from the old app without checking §9 of the roadmap
first; most of it was deleted on purpose.

## Tech Stack

| Layer   | Stack                                                                    |
| ------- | ------------------------------------------------------------------------ |
| API     | Go 1.25, Chi v5, GORM, PostgreSQL 16 + pgvector, tronc v0.9.0            |
| Client  | SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, muse (`@facile/muse`), bits-ui |
| Build   | `go build`, Bun                                                          |
| Deploy  | Docker Compose, one distroless container serving API + client, Dokploy + Traefik |
| Auth    | Sessions (argon2id) or Authentik OIDC, `SSO_ONLY` supported              |
| Logging | Journal SDK; secrets from Casier in dev, Dokploy in production           |
| Planned | Claude via `anthropic-sdk-go`, Voyage `voyage-4-lite` embeddings         |

## Project Structure

```
apps/
  api/                  Go backend
    main.go             Entrypoint: env, logger, database, chassis, routes, shutdown
    apiref_test.go      Every route must appear in a module's documentation.go
    seam_test.go        modules/auth may be imported by main.go alone
    internal/
      identity/         Identity and the Authenticator interface — the porte seam
      env/              Config on top of tronc/env.Core
      database/         GORM + Postgres handle
      middleware/       RequireAuth, rate limiting
      authcrypto/       argon2id passwords, session tokens
      documentation/    Aliases of tronc/apiref, so modules write against a local package
    modules/auth/       Sessions and OIDC. The only module that exists yet
    schemas/            GORM models and migrations
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
mise run hooks       # enable .githooks, once per clone
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

## Conventions and Gotchas

- **No inline comments.** Doc comments above a type or function only, and only to explain a
  decision a reader would otherwise undo. The suite reads this way; match it.
- **Postgres only, tests included.** `check.sh` fails the build on any SQLite/MySQL driver in
  `go.mod`: a test on SQLite builds a different schema from the GORM tags and proves nothing
  about the DDL that ships.
- **The database image must be `pgvector/pgvector:pg16`.** `schemas.Migrate` runs
  `CREATE EXTENSION IF NOT EXISTS vector`; plain `postgres:16` fails at boot.
- **Every route needs an entry in its module's `documentation.go`**, or `apiref_test.go` fails.
  Fix the registry, never the test. That registry is what `/docs` renders.
- **`internal/documentation/` declares `package docs`, and importers must alias it.** A Go
  package literally named `documentation` is silently discarded by `go/build` — its files are
  reported as `IgnoredGoFiles` and importers fail with `build constraints exclude all Go files`,
  with no build tag anywhere to explain it. Import it as
  `documentation "…/internal/documentation"`. Casier does the same thing for the same reason.
- **The porte seam is load-bearing.** Feature modules take `identity.Authenticator` in
  `RegisterRoutes`, never `*auth.Service`, and nothing but `main.go` imports `modules/auth`.
  `seam_test.go` enforces it. Auth will be replaced by a shared package; keep the swap
  mechanical. This is a deliberate divergence from Casier — do not port its pattern back.
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
| `SSO_ONLY` | No | Removes the local login and register routes entirely when true |
| `PERCEPTION_ADMIN_EMAILS` | No | Comma-separated. Empty means nobody — admin routes fail closed |
| `OIDC_ISSUER` | No | Enables SSO. `porte.facile.studio/application/o/perception/` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URL` | If OIDC | Required together once the issuer is set; validated at startup |
| `OIDC_SUCCESS_URL` | No | Redirect after login, defaults to the first CORS origin |
| `JOURNAL_URL` / `JOURNAL_TOKEN` | No | Log shipping. The URL must end in `/api` or every line is silently dropped |
| `CLIENT_DIR` | No | Built client directory served by the API, default `./client` |
| `TEST_DATABASE_URL` | No | Test-only Postgres; unset makes database tests skip loudly |

Reserved for later phases — present in `.env.example` and `docker-compose.yml` as commented
lines, not read by any code yet: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `INGEST_HMAC_SECRET`,
`INGEST_HMAC_SECRET_PREVIOUS`.

## Suite context

- Events arrive from **Nook**, the suite event bus. Perception is a consumer, not a peer of
  other apps — see `~/Projects/Facile/Code/Suite/INTERCONNECTIVITY.md`.
- Identity federates to **Authentik** at `porte.facile.studio`, app slug `perception`.
- Logs ship to **Journal**; secrets come from **Casier** (project `perception`).
- The chassis is **tronc**; read it before writing HTTP plumbing, because it probably already
  exists there.
