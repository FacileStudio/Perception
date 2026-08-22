# Perception

Context brain for Facile operations. Ingests structured events from across the suite, builds
durable business memory, and answers grounded operational questions in natural language.

One Go binary serves the API under `/api` and the built SvelteKit dashboard on everything
else. Storage is PostgreSQL 16 with pgvector; identity comes from Authentik over OIDC.

Live at [perception.facile.studio](https://perception.facile.studio).

> **Perception is being rebuilt.** This branch is the Go rewrite of a TypeScript app that ran
> from May to August 2026 and was retired unused. The chassis, auth and deployment are done;
> ingest, embeddings, chat and entities are not. See [`ROADMAP.md`](ROADMAP.md) for the plan
> and [`docs/SPEC.md`](docs/SPEC.md) for the contract.

## What it does

Today, in this scaffold:

- Serves `/health` and `/ready` at both the root and `/api`, plus an argv healthcheck hook for
  the distroless container
- Publishes its own API reference at [`/docs`](https://perception.facile.studio/docs), generated
  from a route registry the test suite keeps honest
- Authenticates with email and password (argon2id sessions) or Authentik OIDC, with an
  `SSO_ONLY` mode that removes the local forms entirely
- Ships structured logs to Journal and reads its secrets from Casier
- Serves the SvelteKit dashboard from the same binary, at the same origin

Planned, in order — see [`ROADMAP.md`](ROADMAP.md):

- HMAC-signed event ingest from Antenne, with rejections recorded rather than dropped
- Voyage embeddings into pgvector, with the backlog wired to `/ready`
- Hybrid retrieval (vector + Postgres full-text) and streamed, cited answers from Claude
- Entity resolution over repos, people, projects and deployments

## Stack

| Layer | Tech |
|---|---|
| API | Go 1.25, Chi v5, GORM, PostgreSQL 16 + pgvector, [tronc](https://github.com/FacileStudio/tronc) v0.9.0 |
| Client | SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, muse (`@facile/muse`), bits-ui |
| Auth | Sessions (argon2id) or OIDC SSO via `porte.facile.studio`, `SSO_ONLY` supported |
| Logging | [Journal](https://github.com/FacileStudio/Journal) SDK |
| Secrets | [Casier](https://casier.facile.studio) in development, Dokploy in production |
| Deploy | Docker Compose, one distroless container serving API + client, Traefik |
| Planned | Claude via `anthropic-sdk-go`, Voyage `voyage-4-lite` embeddings |

## Development

Requires `mise`, Go 1.25 and `bun`. Secrets are injected by Casier — there is no `.env` to
create for normal work.

```sh
mise install         # tools, and the git hooks, once per clone
mise run install     # client dependencies
mise run db-up       # local PostgreSQL with pgvector
mise run dev         # API with secrets injected from Casier
mise run dev-client  # the SvelteKit dev server, in another shell
```

Without access to Casier, copy `.env.example` to `.env` and fill it in; every variable is
documented there.

```sh
mise run check       # gofmt, go vet, go test, then the client type-check
mise run check-go    # the Go half only
mise run format      # rewrite Go sources in place
```

`scripts/check.sh` is the gate and runs on every push. It also refuses any non-Postgres
database driver in `go.mod`: a test on SQLite builds a different schema from the GORM tags and
proves nothing about the DDL that ships.

`mise install` wires the git hooks through lefthook. `lefthook.yml` pulls the shared
conventional-commit check from [FacileStudio/hooks](https://github.com/FacileStudio/hooks),
pinned by tag, and runs `scripts/check.sh` as the local `pre-push` job.

## Deployment

`docker-compose.yml` targets Dokploy behind Traefik on la ruche. The API service uses `expose`
rather than `ports` and carries its own router labels for `perception.facile.studio`. The
database image is `pgvector/pgvector:pg16` — plain `postgres:16` will fail the migration that
enables the `vector` extension.

Configuration is documented in [`.env.example`](.env.example) and
[`docs/SPEC.md`](docs/SPEC.md) §7.

## Repository

```
apps/
  api/                Go backend
    main.go           Entrypoint: config, chassis, routes, graceful shutdown
    apiref_test.go    Fails the build when a route is missing from /docs
    seam_test.go      Fails the build when a module reaches into auth (see ROADMAP §7)
    internal/         identity (the porte seam), env, database, middleware,
                      authcrypto, documentation
    modules/auth/     Sessions and OIDC — the only module in the scaffold
    schemas/          GORM models and migrations
  client/             SvelteKit dashboard
docs/                 SPEC.md and reference docs
scripts/              check.sh and the repo-local Postgres helpers
```

## Related

- [ROADMAP.md](ROADMAP.md) — why the rewrite, what was cut, and the phase order
- [docs/SPEC.md](docs/SPEC.md) — ingest contract, data model, retrieval design
- [Antenne](https://github.com/FacileStudio/Antenne) — the event bus Perception ingests from
- [nacelle](https://github.com/FacileStudio/nacelle) — the agent SDK Kori runs on
- [tronc](https://github.com/FacileStudio/tronc) — the Go app chassis
