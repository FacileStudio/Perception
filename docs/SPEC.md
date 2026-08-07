# Perception — technical specification

The contract the rewrite implements. [`ROADMAP.md`](../ROADMAP.md) says what to build and in
what order and why; this says what the shapes are. Where the two disagree, the roadmap wins on
scope and this wins on detail.

Nothing here is built yet. The scaffold implements auth and the chassis only.

---

## 1. The corpus, measured

Facts from the production backup (`~/Backups/perception-2026-08-07/`), 2026-05-08 to
2026-08-07. Design against these, not against a hypothetical.

**9,355 events from 10 providers:**

| Provider | Events | Entity type it produces |
|---|---:|---|
| `opus` | 3,814 | `task` |
| `git` | 2,110 | `repository` |
| `dokploy` | 1,786 | `deployment` |
| `system` | 931 | `system` |
| `vision` | 318 | `service` |
| `sablier` | 171 | `schedule` |
| `imap` | 107 | `email` |
| `rss` | 96 | `unknown` |
| `website` | 14 | `service` |
| `nuage` | 8 | `service` |

**Top event types:** `task.updated` (3,078), `git.push` (2,109), `build` (1,783),
`system.delivery.failure` (830), `vision.analytics.report` (318), `task.created` (291),
`task.status_changed` (217), `imap.email.received` (107).

Two things to notice. First, **a third of all events are `task.updated` from Opus** — the
corpus is dominated by one noisy provider, which is why entity resolution drowned. Second,
`quality` was `complete` for all 9,355 rows: the degraded path never fired in production and
is therefore untested. Test it.

**Known data defect to fix at the boundary:** `occurred_at` was stored as an opaque string and
the IMAP provider sent RFC-2822 (`Wed, 8 Jul 2026 11:50:51 -0700`) while everything else sent
ISO-8601. Sorting was therefore wrong for 107 events. Parse both, store `timestamptz`.

## 2. Ingest

### Transport

```
POST /api/ingest
Content-Type: application/json
X-Nook-Event-Id:        <stable id, unique per event>
X-Nook-Timestamp:       <unix seconds>
X-Nook-Schema-Version:  1
X-Nook-Signature-256:   sha256=<hex hmac>
```

### Signature

HMAC-SHA256 over the exact string:

```
{timestamp}.{eventId}.{rawBody}
```

`rawBody` is the raw bytes as received — sign and verify before any JSON parsing or
re-serialisation. Compare in constant time. Reject when:

| Reason | Condition |
|---|---|
| `no_ingest_secret_configured` | no secret set |
| `timestamp_out_of_range` | `abs(now - timestamp) > INGEST_MAX_SKEW_SECONDS` (default 300) |
| `unsupported_schema_version` | header is not `1` |
| `invalid_signature` | no configured secret matches |

Two secrets are accepted, `INGEST_HMAC_SECRET` and `INGEST_HMAC_SECRET_PREVIOUS`, so rotation
does not require a synchronised restart of Nook and Perception.

**Replay protection is deduplication, not a nonce cache.** The event id is the primary key;
a resend is an idempotent upsert answering `202`. Say so plainly rather than claiming a
replay window the code does not implement — the old README claimed one and it did not exist.

Every rejection writes a row to `ingest_rejections` (reason, event id, hashed source IP,
payload hash, timestamp). A misconfigured emitter must be visible, not silent.

### Changes from the old contract

- **`workspace_id` is gone.** Perception is single-tenant. The old app carried a workspace
  column and an `organization` table with 3 rows and no product behind them.
- **`actor_email` replaces `actor_email_hash`.** Storing only a hash is exactly why Perception
  cannot participate in the suite event contract, which keys on `actor_email`
  (`Wiki/HARMONIZATION.md` §3). Store the address.
- The `X-Perception-Workspace` header is no longer read.

## 3. Data model

Postgres 16 with the `vector` extension. GORM models in `apps/api/schemas/`, migrations run at
boot from `schemas.Migrate`.

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | the Nook event id; dedup key |
| `schema_version` | int | |
| `source` | text | `webhook`, `poll` |
| `provider_id` | text | |
| `provider_type` | text | `opus`, `git`, `dokploy`, … |
| `provider_name` | text | human label |
| `event_type` | text | `task.updated`, `git.push`, … |
| `entity_type` | text | `task`, `repository`, `deployment`, … |
| `entity_ref` | text | provider-side id |
| `entity_name` | text | |
| `actor_name` | text | |
| `actor_email` | text | **not hashed** |
| `status` | text | nullable |
| `due_at`, `completed_at` | timestamptz | nullable |
| `occurred_at` | timestamptz | normalised at the boundary; the ordering key |
| `emitted_at`, `ingested_at` | timestamptz | |
| `url` | text | back-link to the source system |
| `title`, `summary` | text | |
| `searchable_text` | text | the full-text and embedding input |
| `search` | tsvector | generated column, GIN indexed |
| `payload_redacted` | jsonb | |
| `payload_hash` | text | |
| `quality` | text | `complete` \| `partial` \| `degraded` |

Index `(occurred_at DESC)`, `(provider_type, occurred_at DESC)`, `(entity_type, entity_name)`.

### `event_embeddings`

| Column | Type |
|---|---|
| `event_id` | text PK, FK → `events.id` |
| `embedding` | `vector(1024)` |
| `model` | text (`voyage-4-lite`) |
| `input_hash` | text — re-embed only when the input actually changed |
| `status` | text: `pending` \| `ready` \| `error` |
| `attempts` | int |
| `last_error` | text |
| `embedded_at` | timestamptz |

HNSW index on `embedding` with `vector_cosine_ops`.

**The backlog is a health signal.** `/ready` reports degraded when the `pending` count exceeds
a threshold or the oldest `pending` row is older than a bound. The old worker stalled at 698 of
9,355 for months in silence; that must not be reproducible.

### `entities`, `entity_aliases`, `event_entities`

Standard resolution tables. Two constraints learned the hard way:

- An entity is a **durable thing** — a repo, a person, a client, a service. A single Opus task
  is not an entity. The old system minted entities from full task titles, which is how
  notifications ended up titled *"3/ Dans la catégorie « Ce que je propose »…"*.
- Relations need a reason to exist. The old system stored **271,126** relations over 572
  entities — a fully-connected-by-accident graph nothing queried.

### `chat_sessions`, `chat_messages`

Session, role, content, and the event ids cited by each assistant message so a citation can be
re-rendered without re-running retrieval.

## 4. Retrieval

One lane. Hybrid, because neither half is sufficient alone:

1. **Vector** — embed the question with `voyage-4-lite`, cosine top-k over `event_embeddings`.
2. **Full-text** — `websearch_to_tsquery` against `events.search`, ranked with `ts_rank_cd`.
   Journal's `modules/logs` already does this half; read it rather than reinventing.
3. **Fuse** — reciprocal rank fusion over the two lists, then a time-decay factor. Operational
   questions are almost always about the recent past.

Filters (provider, entity, time range) are SQL predicates applied to both halves, never a
post-filter on the fused list — post-filtering silently empties results.

The old system had five lanes plus a 3,169-line LLM planner choosing between them, exercised
by no user. **Add a second lane only when a specific real question demonstrably fails.**

## 5. Chat

`POST /api/chat` streaming SSE. Claude via `anthropic-sdk-go` — there is no Vercel AI SDK in
Go, so the tool-call loop is hand-rolled, which is a couple of hundred lines against one lane.

Shape of a turn:

1. Retrieve with the user's question, optionally narrowed by filters from the UI.
2. Build a context block of the top events: `occurred_at`, provider, title, summary, url.
3. Stream the answer, requiring inline citations by event id.
4. Persist the message with its cited ids.

**An answer with no citations is a bug.** This is grounded retrieval over a known corpus, not
a general assistant. When retrieval returns nothing, the correct answer is "nothing in the
events covers that", not a plausible paragraph.

## 6. API surface

Built (scaffold):

| Method | Path |
|---|---|
| GET | `/health`, `/ready`, and both under `/api` |
| GET | `/docs`, `/docs/openapi.json` |
| GET | `/api/auth/config` |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` |
| GET | `/api/auth/me` |
| GET | `/api/auth/oidc`, `/api/auth/oidc/callback` |

Planned, by phase:

| Phase | Method | Path |
|---|---|---|
| 1 | POST | `/api/ingest` |
| 1 | GET | `/api/events`, `/api/events/{id}` |
| 1 | GET | `/api/ingest/rejections` |
| 2 | GET | `/api/embeddings/status` |
| 3 | POST | `/api/chat` (SSE) |
| 3 | GET | `/api/chat/sessions`, `/api/chat/sessions/{id}` |
| 4 | GET | `/api/entities`, `/api/entities/{id}` |

Every route needs an entry in its module's `documentation.go`. `TestEveryRouteIsDocumented`
fails the build otherwise — fix the registry, never the test.

## 7. Configuration

Read today: `APP_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
`JOURNAL_URL`, `JOURNAL_TOKEN`, `PUBLIC_URL`, `SSO_ONLY`, `PERCEPTION_ADMIN_EMAILS`, and the
five `OIDC_*` variables.

Reserved, present in `.env.example` and `docker-compose.yml` as commented lines, not yet read:
`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `INGEST_HMAC_SECRET`, `INGEST_HMAC_SECRET_PREVIOUS`.
Phase 1 and 2 activate them. Add `INGEST_MAX_SKEW_SECONDS` (default 300) with phase 1.

Secrets come from Casier in development (`mise run dev`) and from Dokploy in production.
Nothing reads a committed `.env`.
