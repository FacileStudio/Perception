# Perception — Overview

> Context brain for Facile operations. Ingests structured events from Nook, builds durable business memory, answers grounded questions about tasks, contracts, clients, deployments, email signals, and service health.

---

## What it does

Primary UX is **chat**. Ask operational questions, get source-backed answers. Secondary UX is a **context feed** for auditing what the answer used. Not a dashboard — dashboards rot. Memory plus evidence is the point.

Sample questions it answers:
- What needs attention today?
- Which contracts are unsigned or aging?
- What shipped this week?
- Which clients went quiet?
- Summarize the last 7 days.

---

## Stack

| Area | Choice |
|---|---|
| Runtime | Bun |
| API | Hono |
| Database | libSQL (`@libsql/client`) — SQLite + vector search |
| Embeddings | Voyage AI `voyage-4-lite`, 1024 dims |
| LLM | Claude Sonnet 4.6 via AI SDK `streamText()` |
| Frontend | SvelteKit 5 + muse |
| Stats | `simple-statistics` over normalized fact tables |
| Retrieval | Hybrid: vector + FTS + SQL facts + stats |

---

## Architecture

```
Nook → POST /ingest (HMAC-signed) → Perception API
  → verify signature + idempotency
  → deterministic extractor per provider
  → events + fact table + FTS + pending embedding (one tx)
  → background embedding worker (Voyage)

Dashboard → POST /chat
  → query planner (time, provider, entity, SQL/stats needs)
  → 4 parallel retrieval lanes (vector, FTS, SQL, stats)
  → merge + rank → Claude prompt → stream response
```

---

## Data model (key tables)

| Table | Purpose |
|---|---|
| `events` | Canonical normalized event record |
| `event_fts` | Full-text search over title/summary/searchable_text |
| `event_embeddings` | Voyage vector per event, retry-tracked |
| `task_facts` | Vikunja task fields |
| `contract_facts` | Docuseal contract/signer fields |
| `client_activity_facts` | Charles CRM changes |
| `deployment_facts` | Dokploy deploys |
| `code_facts` | Git pushes, PRs |
| `service_health_facts` | Uptime Kuma + website monitors |
| `email_facts` | IMAP headers (subject, from domain, thread) |
| `schedule_facts` | Sablier sessions |
| `chat_sessions` / `chat_messages` | Conversation + sources |
| `stats_snapshots` | Pre-computed operational signals |
| `ingest_rejections` | Failed HMAC / replay attempts |

---

## SDK

[**perception-js**](https://github.com/FacileStudio/perception-js) is the official TypeScript SDK for sending custom events to Perception from any Node, Bun, or Edge runtime. Use it to instrument key business logic — onboarding steps, billing events, deploys, contract signings — and make them queryable through Perception's chat interface.

```ts
import { ingest } from 'perception-js'

ingest("subscription.upgraded", { from: "free", to: "pro" }, {
  actor: { id: userId, email },
  subject: { type: "organization", id: orgId, name: orgName },
})
```

Install: `bun add github:FacileStudio/perception-js`

---

## Providers supported

`vikunja` · `docuseal` · `charles` · `dokploy` · `git` · `uptime-kuma` · `imap` · `sablier` · `website`

Unknown providers still create an `events` row at `quality = degraded` — no silent drops.

---

## API surface

| Method | Path | Auth |
|---|---|---|
| `GET` | `/health` | none |
| `GET` | `/ready` | none |
| `POST` | `/ingest` | HMAC |
| `POST` | `/chat` | session |
| `GET` | `/events` | session |
| `GET` | `/events/:id` | session |
| `GET` | `/stats` | session |
| `POST` | `/admin/embedding-jobs/retry` | session |
| `POST` | `/admin/backfill-embeddings` | session |
| `POST` | `/auth/login` | none |
| `POST` | `/auth/logout` | session |

---

## Security highlights

- HMAC-SHA256 on every ingest request (timestamp + event ID replay protection)
- Secret rotation: current + previous keys
- Single-user session auth (`HttpOnly`, `Secure`, `SameSite=Lax` cookies)
- Prompt injection controls: event content is untrusted evidence, never instructions
- PII defaults: email addresses hashed, raw payloads off by default, IMAP headers only
- Retention: 365 days default, purgeable via admin command

---

## V1 scope

**In:** Nook ingest only · single-user auth · chat + context feed · stats signals · embedding retry/backfill · source references in answers

**Out:** multi-tenant · proactive alerts · write-back to source systems · full email body indexing · fine-tuned models · public unauthenticated dashboard

---

## Build milestones

1. Scaffold Bun/Hono API, migrations, health/ready routes
2. Ingest auth, idempotency, redaction, event/fact inserts
3. Provider extractors with Nook payload fixtures
4. Voyage embedding worker with retry/backfill
5. Retrieval lanes + chat streaming
6. SvelteKit chat + context feed with auth
7. Stats snapshots
8. Dockerfile / deploy docs / backups
9. Retrieval evals on fixture questions, tune ranking

---

## Open questions

- Separate service or embedded Nook module long-term?
- Raw payload storage ever allowed in production?
- Email body excerpts indexed, or headers + subject only?
- Charles as canonical entity source, or local entity resolver?
- Local libSQL on la ruche, or Turso Cloud?

Recommended defaults: separate service · no raw payloads in prod · IMAP headers v1 · Charles IDs when available + local resolver · start local libSQL, move to Turso only when remote sync is needed.

---

## Deploy notes

- Base `docker-compose.yml` is Dokploy-oriented: app services use `expose`, not host `ports`
- Local port publishing lives in `docker-compose.override.yml`
- Dokploy Bun builds use `build.network: host` to avoid builder DNS/npm registry nonsense
- `VITE_API_URL` must point at the public API URL seen by the browser
- `CLIENT_ORIGIN` must match the public client origin for API CORS/session cookies
