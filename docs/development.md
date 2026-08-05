# Perception — Development

Local setup, how migrations work, what the tests cover, and the conventions the codebase actually
follows.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Bun | latest | Runtime, package manager and test runner. Pinned in `mise.toml` |
| Node | 22 | Pinned in `mise.toml` for the client tooling |
| mise | any recent | The task runner. Every root command goes through it |
| Docker | any recent | Only for a container run |

No PostgreSQL, no Redis, no external service. The database is a file.

## Setup

```sh
cp .env.example .env
mise run dev
```

That starts the API in watch mode on `:8787` and the Vite dev server on `:3000`. The database file
is created at `./data/perception.db` on first boot and migrations run automatically.

Fill in `.env` with a session secret and an admin password:

```sh
openssl rand -hex 32
```

Then — and this is the step people miss — start the app and set `anthropic_api_key` and
`voyage_api_key` **in the settings screen**. They are database settings, not environment
variables, and putting them in `.env` does nothing. See [configuration.md](configuration.md).

For a UI-only session with no login, `PERCEPTION_LOCAL_DEV_AUTH_DISABLED=true` makes
`/auth/status` return a fake authenticated user. Never set it anywhere real.

## Commands

```sh
mise run dev         # API watch + client dev server
mise run build       # Build all workspaces
mise run test        # bun test across apps/api and apps/client
mise run typecheck   # tsc --noEmit on the API
mise run lint        # Lint every workspace
```

Per workspace:

```sh
cd apps/api
bun run dev          # bun --watch src/server.ts
bun run start        # production start
bun test
bun run typecheck
bun run lint         # biome lint src

cd apps/client
bun run dev          # vite dev
bun run build        # svelte-kit sync && vite build
bun run check        # svelte-check
bun run lint         # prettier --check . && eslint .
```

There is no `scripts/check.sh` and no git hooks. `mise run lint` plus `mise run typecheck` plus
`mise run test` is the gate; run all three before pushing.

## Migrations

Migrations live in `apps/api/src/db/migrations.ts` as an ordered array of `{name, sql}`. The first
one reads `db/schema.sql` wholesale; the 35 after it are inline SQL. Applied names are tracked in
the `_migrations` table, so each runs exactly once.

`runMigrations()` is called from `server.ts` at startup, before the workspace bootstrap. To add
one, append to the array with the next `NNN_` prefix — never edit an applied migration, and never
reorder.

The bootstrap that follows creates the default workspace (`organization` with slug `default`) and
backfills every table still tagged `workspace_id = 'default'` to its real id. It is idempotent and
skipped once a default organization exists.

A migration failure does not crash the process. It records `startupError`, sets `ready = true`
anyway, and the API comes up degraded — check `GET /health` for `startupError` rather than assuming
a running container means a successful boot.

## Tests

```sh
mise run test
```

Four API suites in `apps/api/tests/`:

| File | Covers |
|---|---|
| `ingest.test.ts` | HMAC verification, replay and skew rejection, the ingest pipeline |
| `events.test.ts` | Event storage and query |
| `chat-planner.test.ts` | Intent classification and plan extraction |
| `ontology-labels.test.ts` | Concept and capability labeling |

Plus `apps/client/src/hooks.server.test.ts`, which covers the API proxy — including the
`Set-Cookie` handling, which is subtle enough that it earned its own test.

The planner and ontology tests are the best available documentation of how those two subsystems are
meant to behave; read them before changing either.

## Working on retrieval

Retrieval is the part most likely to look broken when it is merely tuned differently.

- Lane weights are **learned**, not configured. The bandit worker refits them daily from
  `retrieval_outcomes` rows labelled by message feedback. A local database with no feedback runs on
  the priors.
- `POST /admin/eval/run` runs the retrieval evaluation over stored fixtures;
  `GET /admin/eval/runs` and `/admin/eval/runs/:runId` read the results. Promote a real chat message
  into a fixture with `POST /admin/eval/promote/:messageId`. That is the loop for judging whether a
  retrieval change actually helped.
- To force a specific lane's behavior in isolation, call it directly from a test rather than
  reweighting — merge order and deduplication will otherwise hide what you changed.

## Working on workers

All 22 workers run in the API process on timers. In development that means opening the app starts
background LLM and embedding work.

```sh
# pause everything
curl -X PUT localhost:8787/admin/workers/paused -d '{"paused":true}'

# run one by hand
curl -X POST localhost:8787/admin/workers/embedding/run

# see what ran and what it did
curl localhost:8787/admin/workers
curl localhost:8787/admin/workers/embedding/history
```

Every `/admin` route goes through `requireAdmin`, so those calls need a session cookie — or
`PERCEPTION_LOCAL_DEV_AUTH_DISABLED=true`, which is the usual reason to turn it on locally.

Pause them when working offline or without API keys, otherwise the logs fill with failed Voyage and
Anthropic calls.

## Conventions

- **No inline comments in code.** This is enforced by review, not tooling.
- API code is linted by Biome; client code by Prettier and ESLint. They disagree about formatting,
  which is why they are scoped per workspace.
- Client components use Svelte 5 runes — `$state`, `$props`, `$derived`, `$effect` — never the
  legacy reactive syntax. Stores are `.svelte.ts` files using the runes API.
- One Hono router per domain in `apps/api/src/routes/`, business logic in the sibling domain
  directory. Routes stay thin.
- Every query that touches a domain table must be workspace-scoped. `security/workspace.ts` and
  `db/scoped.ts` exist so this is not done by hand.
- Never branch on an entity's label. Branch on its capabilities — see
  [architecture.md](architecture.md).
- Event content is untrusted evidence. Anything from an event that reaches a prompt goes in as
  tagged data, never as instruction.
