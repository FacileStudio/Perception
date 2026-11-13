# Perception — technical specification

The contract the rewrite implements. [`ROADMAP.md`](../ROADMAP.md) says what to build and in
what order and why; this says what the shapes are. Where the two disagree, the roadmap wins on
scope and this wins on detail.

Nothing here is built yet. The scaffold implements auth and the chassis only.

**Perception is the engine, Kori is the agent.** This document specifies the engine: ingest,
storage, embeddings, the entity graph, retrieval, and the MCP surface. Kori's prompt, sessions
and client are specified in the roadmap; the agent SDK it runs on lives in
[`FacileStudio/nacelle`](https://github.com/FacileStudio/nacelle).

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
x-antenne-event-id:        <stable id, unique per event>
x-antenne-timestamp:       <unix seconds>
x-antenne-schema-version:  1
x-antenne-signature-256:   sha256=<hex hmac>
```

These are the headers Antenne sends today — see its `apps/api/internal/envelope/signing.go`.
Earlier drafts of this spec said `X-Nook-*`; the bus was renamed and the emitter was updated,
the spec was not. Do not build against the old names.

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
does not require a synchronised restart of Antenne and Perception.

**Replay protection is deduplication, not a nonce cache.** The event id is the primary key;
a resend is an idempotent upsert answering `202`. Say so plainly rather than claiming a
replay window the code does not implement — the old README claimed one and it did not exist.

Every rejection writes a row to `ingest_rejections` (reason, event id, hashed source IP,
payload hash, timestamp). A misconfigured emitter must be visible, not silent.

### Changes from the old contract

- **`workspace_id` is gone.** Perception is single-tenant. The old app carried a workspace
  column and an `organization` table with 3 rows and no product behind them.
- **`actor_email` replaces `actor_email_hash`, but it is not a Facile identity.** The old
  schema stored only a hash, which made "what did this person touch" unanswerable. The address
  is stored now — and named after what it is, because Antenne's own envelope package states
  that `actor.email` is whatever a third-party payload happened to carry and that nothing
  downstream should read it as a suite identity. An earlier draft of this spec claimed storing
  it would let Perception participate in the suite event contract, which keys on a Facile SSO
  identity. **That was wrong.** This column is source-reported and must never be joined to an
  account.
- The `X-Perception-Workspace` header is no longer read.

## 3. Data model

Postgres 16 with the `vector` extension. The schema is ordered goose SQL in
`apps/api/migrations/`, applied at boot by `tronc/migrate`; the GORM models in
`apps/api/schemas/` are the query layer.

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | the Antenne event id; dedup key |
| `schema_version` | int | |
| `source` | text | `webhook`, `website`, `imap`, `rss`, `test`, `system` — where the event entered Antenne, not the provider |
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
| `payload_normalized` | jsonb | the envelope's normalised fields |
| `payload_raw` | jsonb | the source's own body, kept only when `privacy.rawPayloadAllowed` |
| `payload_hash` | text | |
| `contains_pii` | bool | from `privacy.containsPii` |
| `entity_url` | text | the subject's link, distinct from the event's |
| `provider_tags` | jsonb | |
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

### `entity_relations`

| Column | Type | Notes |
|---|---|---|
| `source_id`, `target_id` | text FK → `entities.id` | stored once per unordered pair |
| `kind` | text | `touched_by`, `deployed_with`, `belongs_to`, … |
| `evidence_count` | int | how many events witnessed it |
| `weight` | real | derived from evidence and recency; what the graph is traversed on |
| `first_seen_at`, `last_seen_at` | timestamptz | |

**Co-occurrence in a single event is not a relation.** A pair earns a row above an evidence
floor and loses it when the relation goes cold. This constraint is the entire difference
between a graph you can traverse and the 271,126-row one that nothing queried.

### `communities`, `entity_communities`

Clusters over the weighted relation graph — Leiden or label propagation, recomputed on a
schedule, never per event. `communities` holds the cluster, its size, its algorithm run id and
a generated label; `entity_communities` is the membership with a strength score.

**These tables exist only to be read by retrieval or the UI.** They were cut from the rewrite
alongside forecasting and are back as of 2026-08-19 because "what is connected to this" is a
real question. If they are ever computed and unread, delete them — that is what the old
`topology_snapshots` was.

### `chat_sessions`, `chat_messages`

Kori's transcripts. Session, role, content, the tool calls made during the turn, and the event
ids cited by each assistant message so a citation can be re-rendered without re-running
retrieval.

## 4. Retrieval

One lane. Hybrid, because neither half is sufficient alone:

1. **Vector** — embed the question with `voyage-4-lite`, cosine top-k over `event_embeddings`.
2. **Full-text** — `websearch_to_tsquery` against `events.search`, ranked with `ts_rank_cd`.
   Journal's `modules/logs` already does this half; read it rather than reinventing.
3. **Graph expansion** — when the query resolves to a known entity, widen the candidate set to
   that entity's relations above the weight floor and to its community before ranking. This is
   a predicate on the same query, not a third retriever with its own weights.
4. **Fuse** — reciprocal rank fusion over the lists, then a time-decay factor. Operational
   questions are almost always about the recent past.

Filters (provider, entity, time range) are SQL predicates applied to every half, never a
post-filter on the fused list — post-filtering silently empties results.

The old system had five lanes plus a 3,169-line LLM planner choosing between them, exercised
by no user. **Add a second lane only when a specific real question demonstrably fails.**

## 5. The MCP server

Perception's surface for machines, at `/api/mcp`, streamable HTTP transport, authenticated by
the same session or by a service token. Built with the official Go MCP SDK
(`github.com/modelcontextprotocol/go-sdk`) — verify its current API against the repo before
writing, it moves.

Tools, each a thin wrapper over an existing HTTP handler:

| Tool | For |
|---|---|
| `search_events` | the hybrid retrieval of §4, with filters |
| `get_event` | one event in full, by id |
| `list_entities` | entities by type or name fragment |
| `get_entity` | one entity, its aliases and its recent events |
| `related_entities` | the neighbourhood: strong relations and the community |
| `event_stats` | counts by provider, type, entity or window |

Two rules. **If writing an MCP tool needs new business logic, that logic belonged in the
module** — the server is a wrapper, not a second implementation. And **every result carries
event ids**, so a citation survives the round trip into whatever agent called it.

The acceptance test is that Claude Code can connect to this server and answer a real question
about the suite. That needs no Kori and should be true before Kori exists.

## 6. Kori

The agent. `POST /api/kori/chat` streaming SSE, sessions under `/api/kori/sessions`.

Kori runs on [nacelle](https://github.com/FacileStudio/nacelle), the suite agent SDK — the
model loop, tool registry and MCP wiring live there, not here. This module owns the persona,
the system prompt, session persistence and the client.

- Model `claude-opus-5` with adaptive thinking (`thinking: {type: "adaptive"}`). **Never pass
  `budget_tokens`** — it is a 400 on Opus 5; use `output_config.effort` instead.
- The loop is the SDK's `toolrunner`, not hand-written. The claim in earlier drafts that Go
  had no equivalent of the Vercel AI SDK is out of date.
- Remote MCP servers are reached through the Claude API's MCP connector: `mcp_servers` **and**
  a matching `mcp_toolset` entry in `tools`, with the `mcp-client-2025-11-20` beta. Both
  halves, or the request is rejected.
- Perception's own MCP server is Kori's first tool source. Others join as suite apps ship them.

Shape of a turn: the model decides which tools to call, nacelle runs them, the transcript
streams out as SSE, and the message persists with its tool calls and cited event ids.

**An answer that asserts a fact with no citation is a bug.** This is grounded retrieval over a
known corpus, not a general assistant. When retrieval returns nothing, the correct answer is
"nothing in the events covers that", not a plausible paragraph.

## 7. API surface

Built (scaffold):

| Method | Path |
|---|---|
| GET | `/health`, `/ready`, and both under `/api` |
| GET | `/docs`, `/docs/openapi.json` |
| GET | `/api/auth/config` |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` |
| GET | `/api/auth/me` |
| GET | `/api/auth/oidc`, `/api/auth/oidc/callback` |
| POST | `/api/auth/oidc/exchange`, `/api/auth/backchannel-logout` |

Everything under `/api/auth` except `/auth/me` is served by
[porte](https://github.com/FacileStudio/porte) v0.3.0 and mounted from `main.go`. Sessions are
an opaque token, hashed at rest in `porte_sessions`, carried in an `HttpOnly` `__Host-`-prefixed
cookie for browsers and as a bearer token for everything else. **A cookie-borne mutating call
must send `X-Facile-CSRF`** or it is answered 403.

Planned, by phase:

| Phase | Method | Path |
|---|---|---|
| 1 | POST | `/api/ingest` |
| 1 | GET | `/api/events`, `/api/events/{id}` |
| 1 | GET | `/api/ingest/rejections` |
| 2 | GET | `/api/embeddings/status` |
| 3 | GET | `/api/entities`, `/api/entities/{id}`, `/api/entities/{id}/related` |
| 4 | POST | `/api/retrieve` |
| 5 | GET/POST | `/api/mcp` |
| 6 | POST | `/api/kori/chat` (SSE) |
| 6 | GET | `/api/kori/sessions`, `/api/kori/sessions/{id}` |

Every route needs an entry in its module's `documentation.go`. `TestEveryRouteIsDocumented`
fails the build otherwise — fix the registry, never the test.

## 8. Configuration

Read today: `APP_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
`JOURNAL_URL`, `JOURNAL_TOKEN`, `PUBLIC_URL`, `SSO_ONLY`, `PERCEPTION_ADMIN_EMAILS`, and the
five `OIDC_*` variables.

Reserved, present in `.env.example` and `docker-compose.yml` as commented lines, not yet read:
`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `INGEST_HMAC_SECRET`, `INGEST_HMAC_SECRET_PREVIOUS`.
Phase 1 and 2 activate them. Add `INGEST_MAX_SKEW_SECONDS` (default 300) with phase 1.

Secrets come from Casier in development (`mise run dev`) and from Dokploy in production.
Nothing reads a committed `.env`.
