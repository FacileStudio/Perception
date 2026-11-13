# Perception — Development

Getting a local Perception instance running, available tasks, and the quality gate that runs before every push.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Go | 1.25 | Defined in `apps/api/go.mod` and pinned in `mise.toml` |
| Bun | any recent | Package manager and tooling runner for `apps/client` |
| Docker | any recent | Runs PostgreSQL 16 with pgvector extension locally |
| mise | optional | Task runner and tool version manager |

## Setup

Install dependencies and start the local PostgreSQL service:

```sh
mise install
mise run install
mise run db-up
```

`mise install` installs required tools and registers git hooks via `lefthook`.

`mise run install` runs `bun install --frozen-lockfile` inside `apps/client`.

## Running

Run the API server with secrets injected from Casier:

```sh
mise run dev
```

In a second terminal, run the SvelteKit frontend development server:

```sh
mise run dev-client
```

If Casier is unreachable, run `mise run dev-offline` to use cached secrets, or copy `.env.example` to `.env` and fill in local connection values.

The API listens on port `4000`, and Vite proxies `/api` requests from `http://localhost:5173`.

Database migrations run automatically at API startup.

## Changing the schema

The schema is ordered goose SQL in `apps/api/migrations/`, embedded in the binary and applied at
boot by `tronc/migrate`. GORM is the query layer only: `AutoMigrate` never runs, and
`scripts/check.sh` fails on any `.AutoMigrate(` outside a test file.

1. Add the next numbered file, say `apps/api/migrations/00003_events_region.sql`, with both
   `-- +goose Up` and `-- +goose Down`.
2. Change the struct in `apps/api/schemas/` by hand.
3. Run the gate. `TestGORMModelsMatchTheMigratedSchema` fails when a struct names a column the
   migrations do not create, or a type its field cannot hold, and
   `TestPorteSchemaIsInTheMigrations` fails when a porte bump changes porte/pg's `Schema`, which
   then needs a migration of its own.

Never edit a migration a database has already run: goose records it as applied and will not
run it again. `go run . migrate status` lists what is applied.

The vector type and its operator class are written `public.vector` and
`public.vector_cosine_ops` in the migrations. The extension lives in `public`, and a test schema
from `tronc/testdb` puts only itself on `search_path`.

## Tasks

| Task | Command | What it does |
|---|---|---|
| `dev` | `casier run -- sh -c 'cd apps/api && go run .'` | Run backend API with Casier secrets |
| `dev-offline` | `casier run --offline -- sh -c 'cd apps/api && go run .'` | Run backend API with cached secrets |
| `dev-client` | `cd apps/client && bun run dev` | Start client development server |
| `install` | `cd apps/client && bun install --frozen-lockfile` | Install client dependencies |
| `db-up` | `docker compose -f docker-compose.dev.yml up -d` | Start local Postgres with pgvector |
| `db-down` | `docker compose -f docker-compose.dev.yml down` | Stop local Postgres container |
| `check` | `sh ./scripts/check.sh` | Run full quality gate (Go tests + client check + filet) |
| `check-go` | `sh ./scripts/check.sh --go-only` | Run Go quality checks and unit tests |
| `format` | `sh ./scripts/check.sh --format` | Format Go source files with gofmt |
| `secrets` | `casier secrets list -p perception -e dev` | List configured development secrets |

## Quality gate

The quality gate script at `scripts/check.sh` enforces coding standards across all modules:

```sh
sh scripts/check.sh
```

It validates:
- `gofmt` formatting and `go vet` linting on all Go packages
- Unit and integration tests via `go test ./...`
- Absence of non-Postgres database drivers in `go.mod`
- TypeScript type checking in `apps/client` via `bun run check`
- Architecture and style rules via `filet check .`
