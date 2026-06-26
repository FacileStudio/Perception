# Perception

> Context brain for Facile operations. Ingests structured events from Nook, builds durable business memory, and answers grounded operational questions via chat.

## Stack

| Area | Choice |
|---|---|
| Runtime | Bun |
| API | Hono on Bun |
| Database | libSQL — SQLite + vector search |
| Embeddings | Voyage AI `voyage-4-lite`, 1024 dims |
| LLM | Claude Sonnet 4.6 via Vercel AI SDK |
| Frontend | SvelteKit 5 + Tailwind CSS v4 |
| Auth | better-auth (session cookies, OIDC/SSO) |
| Deploy | Docker (Bun Alpine), Dokploy |

## Providers

`vikunja` · `docuseal` · `ardoise` · `dokploy` · `git` · `uptime-kuma` · `imap` · `sablier` · `website`

Unknown providers create events at `quality = degraded` — no silent drops.

## SDK

### perception-js (ingest SDK)

[**perception-js**](https://github.com/FacileStudio/perception-js) sends custom events to Perception from any Node, Bun, or Edge runtime.

```ts
import { ingest } from 'perception-js'

ingest("subscription.upgraded", { from: "free", to: "pro" }, {
  actor: { id: userId, email },
  subject: { type: "organization", id: orgId, name: orgName },
})
```

Install: `bun add github:FacileStudio/perception-js`

### TypeScript API Client

The built-in SDK at `apps/api/src/sdk.ts` provides a typed client for all API endpoints:

```ts
import { createPerceptionClient } from './sdk'

const client = createPerceptionClient({
  baseUrl: 'https://perception.example.com',
  token: 'my-api-token',
})

const { events } = await client.events.list({ limit: 10 })
const { communities } = await client.entities.communities()
const { forecast } = await client.forecasts.get('forecast-id')
const stream = await client.chat.send('What happened last week?')
```

## API Documentation

Interactive API docs available at `/docs` (Scalar) when the API is running, or at `/docs` on the client.

Full OpenAPI spec served at `/openapi.json`.

## Security

- HMAC-SHA256 on every ingest request (timestamp + event ID replay protection)
- Secret rotation: current + previous keys
- Session auth via better-auth (`HttpOnly`, `Secure`, `SameSite=Lax` cookies)
- OIDC/SSO support with auto profile sync
- Multi-workspace isolation (48 tables scoped by workspace)
- Prompt injection controls: event content is untrusted evidence, never instructions
- PII defaults: email addresses hashed, raw payloads off by default

## Deploy

- Base `docker-compose.yml` is Dokploy-oriented: services use `expose`, not host `ports`
- Local port publishing lives in `docker-compose.override.yml`
- `VITE_API_URL` must point at the public API URL seen by the browser
- `CLIENT_ORIGIN` must match the public client origin for CORS/session cookies

## Development

```sh
cp .env.example .env   # fill in API keys
mise run dev            # start API + client in dev mode
mise run test           # run API tests
mise run typecheck      # type-check the API
mise run lint           # lint all workspaces
```

API: `http://localhost:8787` · Client: `http://localhost:3000`
