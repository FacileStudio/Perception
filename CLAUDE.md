# Perception

Context brain for Facile operations. Ingests structured events from Nook, builds durable business memory, and answers grounded operational questions via chat.

## Tech Stack

- **Runtime**: Bun (task runner: mise)
- **Monorepo**: Bun workspaces (`apps/api`, `apps/client`)
- **API** (`apps/api`): Hono on Bun, TypeScript
- **Database**: libSQL (`@libsql/client`) -- SQLite with vector search
- **LLM**: Claude Sonnet 4.6 via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- **Embeddings**: Voyage AI `voyage-4-lite`, 1024 dimensions
- **Auth**: better-auth (session cookies, optional OIDC/SSO)
- **Frontend** (`apps/client`): SvelteKit 5 + Svelte 5 (runes), Tailwind CSS v4, adapter-node
- **UI components**: bits-ui + shadcn-svelte style (see `components.json`)
- **Icons**: Iconify Solar set
- **Linting**: Biome (API), Prettier + ESLint (client)
- **Deploy**: Docker (Bun Alpine images), docker-compose, Dokploy-oriented

## Key Commands

All commands run from the project root via mise:

```sh
mise run dev         # Start all services in dev mode (API watch + Vite dev server)
mise run build       # Build all services
mise run test        # Run API tests (bun test)
mise run typecheck   # Type-check the API
mise run lint        # Lint all workspaces
```

Per-workspace commands (from `apps/api` or `apps/client`):

```sh
# API
bun run dev          # Watch mode (src/server.ts)
bun run start        # Production start
bun test             # Run tests
bun run typecheck    # tsc --noEmit
bun run lint         # Biome lint

# Client
bun run dev          # Vite dev server
bun run build        # svelte-kit sync + vite build
bun run check        # svelte-check
bun run lint         # Prettier + ESLint
```

## Project Structure

```
apps/
  api/
    src/
      server.ts            # Entry point
      config.ts            # Env/config
      auth.ts              # Auth setup (better-auth)
      types.ts             # Shared types
      routes/              # Hono route handlers
      db/                  # Database layer (libSQL, migrations)
      ingest/              # Event ingestion pipeline + HMAC verification
      chat/                # Chat streaming, query planner, retrieval
      embeddings/          # Voyage AI embedding worker
      entities/            # Entity resolution
      events/              # Event processing
      stats/               # Stats snapshots + computation
      memory/              # Durable memory subsystem
      forecasts/           # Forecasting
      narratives/          # Narrative generation
      notifications/       # Notification system
      ontology/            # Ontology / labeling
      communities/         # Community detection
      proposals/           # Proposal generation
      resources/           # Resource management
      eval/                # Retrieval evaluation
      security/            # Security utilities
      schema-registry/     # Schema registry
      workers/             # Background workers
      lib/                 # Shared utilities
      math/                # Math/statistics helpers
    tests/                 # Bun test files (*.test.ts)
    data/                  # Local libSQL database (gitignored)
  client/
    src/
      routes/              # SvelteKit pages (chat, context, stats, entities, ...)
      lib/
        components/        # Svelte components (chat UI, charts, sidebar, ui primitives)
        stores/            # Svelte 5 rune stores (.svelte.ts)
        api.ts             # API client
        auth-client.ts     # better-auth client
    static/                # Static assets
docs/                      # Design docs, specs, diagrams
docker-compose.yml         # Dokploy-oriented (expose, not ports)
docker-compose.override.yml # Local dev port publishing
mise.toml                  # Task runner config
```

## Environment

Copy `.env.example` to `.env` and fill in:

- `ANTHROPIC_API_KEY` -- for Claude chat
- `VOYAGE_API_KEY` -- for embeddings
- `PERCEPTION_ADMIN_USERNAME` / `PERCEPTION_ADMIN_PASSWORD` -- single-user auth
- `PERCEPTION_SESSION_SECRET` -- random string for session signing

The API listens on port 8787, the client on port 3000. `CLIENT_ORIGIN` must match the public client URL for CORS/cookies to work.

## Conventions and Gotchas

- The base `docker-compose.yml` uses `expose` (not `ports`) because it targets Dokploy reverse proxy. Local port publishing lives in the override file.
- Dokploy builds use `build.network: host` to avoid DNS issues in the builder.
- `VITE_API_URL` must point to the public API URL as seen by the browser.
- Ingest endpoint is HMAC-SHA256 signed (timestamp + event ID replay protection). Supports secret rotation with current + previous keys.
- Unknown providers still create events at `quality = degraded` -- no silent drops.
- The API has no inline comments by convention.
- Client uses Svelte 5 runes (`$state`, `$props`, `$derived`, `$effect`), not legacy reactive syntax.
- Client stores are `.svelte.ts` files using the runes API.
