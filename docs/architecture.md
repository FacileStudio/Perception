# Perception — Architecture

How events get in, how they become memory, how a question turns into a grounded answer, and what
runs in the background while nobody is watching.

## Runtime topology

Two containers, one public hostname. The SvelteKit server is the only thing exposed; it proxies
`/api/*` to the API container over the internal network.

```
                                     ┌─────────────────────────────────────┐
Internet ──▶ Traefik ──▶ client (:3000) SvelteKit node server              │
                            │        │                                     │
                            │  /api/* ──proxy──▶ api (:8787) Hono on Bun   │
                            │  else   ──▶ SSR / static assets              │
                            └─────────────────────────────────────┬────────┘
                                                                  │
Nook ──POST /ingest (HMAC-signed)───────────────────────────────▶ │
                                                                  │
                                        ┌─────────────────────────┼──────────────────┐
                                        │                         │                  │
                                  libSQL file DB           Voyage AI API      Anthropic API
                                  /app/data/perception.db   embeddings         Claude Sonnet
                                        ▲
                                        │
                              22 background workers (in-process)
```

`apps/client/src/hooks.server.ts` is the proxy: it strips the `/api` prefix, forwards the request
to `API_UPSTREAM` (default `http://api:8787`), drops hop-by-hop headers, and carefully re-appends
every `Set-Cookie` individually so session cookies survive. A proxy failure returns a 502 with
`{"error":"proxy_error"}`.

This is one router and one hostname but **two containers**, which is a deliberate deviation from
the suite's single-container shape. See [deployment.md](deployment.md).

## Components

| Path | Role |
|---|---|
| `apps/api/src/server.ts` | Hono app, auth routes, route mounting, migrations, worker bootstrap |
| `apps/api/src/routes/` | One router per domain: ingest, chat, events, entities, forecasts, admin, … |
| `apps/api/src/ingest/` | The ingest pipeline: envelope extraction, mapping, redaction, uplift |
| `apps/api/src/schema-registry/` | Per-provider schema inference and confirmation |
| `apps/api/src/ontology/` | Concept and capability labeling |
| `apps/api/src/entities/` | Resolution, aliasing, linking, merging, graph traversal |
| `apps/api/src/chat/` | Query planner, nine retrieval lanes, ranking, prompt assembly, streaming |
| `apps/api/src/embeddings/` | Voyage client and the embedding worker |
| `apps/api/src/math/` | Change points, graph health, concept drift, Granger causality, TDA |
| `apps/api/src/forecasts/` | Forecast generation, beliefs, resolution, calibration, conformal, ensemble |
| `apps/api/src/workers/` | Worker registry and scheduler |
| `apps/api/src/security/` | HMAC verification, OIDC, sessions, redaction, workspace scoping |
| `apps/client/src/` | SvelteKit app plus the API proxy hook |

## The ingest contract

`POST /ingest` accepts exactly one thing: a Nook event envelope at `schemaVersion: 1`, signed the
way Nook signs it.

Required headers:

| Header | Purpose |
|---|---|
| `x-perception-workspace` | Target workspace id. Must match an existing `organization` row |
| `x-nook-event-id` | Envelope id, part of the signed message |
| `x-nook-timestamp` | Unix seconds, checked against `PERCEPTION_INGEST_MAX_SKEW_SECONDS` |
| `x-nook-schema-version` | Must be exactly `1` |
| `x-nook-signature-256` | `sha256=<hex>` HMAC-SHA256 over `<timestamp>.<event_id>.<raw_body>` |

The secret is the per-workspace `ingest_secret` setting. The verifier accepts a **list** of
secrets and compares in constant time, which is what makes rotation possible: keep the old secret
in the list until every sender has moved.

Rejections are not silent. Every failure is written to `ingest_rejections` with the reason, the
event id, a SHA-256 of the client IP and a SHA-256 of the body, then answered `401` with the
reason. The body limit on `/ingest` is 1 MB.

Nook's envelope has no `actor_email` field in the sense the suite `enveloppe` contract uses — its
`actor.email` is whatever a third-party payload happened to carry. **Perception therefore cannot
key cross-app identity on `actor_email` either**, and hashes any email it does receive rather than
storing it plainly.

## The ingest pipeline

`processIngestEvent` in `apps/api/src/ingest/pipeline.ts`:

1. **Version gate.** Anything other than `schemaVersion: 1` is a 400.
2. **Deduplicate.** An envelope id already present in `events` returns `{ok: true, duplicate: true}`
   without reprocessing. The envelope id is stable across retries because Nook derives it from a
   hash of the event's content.
3. **Redact.** When the envelope declares `privacy.containsPii`, every string field whose key
   contains `email` or `phone` is replaced with `[REDACTED]`. Emails kept elsewhere are stored as
   SHA-256 hashes.
4. **Extract layer 1.** Envelope-level facts — provider, event type, actor, subject, timestamps —
   are read straight from the envelope structure and always available.
5. **Look up a schema.** `provider_schemas` is keyed by provider type and event type. If a schema
   exists but the payload's key set no longer hashes to the recorded one, the schema is flagged
   `needs_review` and a re-inference job is queued.
6. **Map facts, assign quality.** No schema means `quality = degraded` and the normalized payload
   is kept as-is. A schema that exists but is unconfirmed gives `partial`. A confirmed schema
   gives `complete`. **Unknown providers are never dropped** — degraded is a real, queryable state,
   and the uplift worker upgrades those events once a schema is confirmed.
7. **Label.** The ontology assigns concepts and capabilities (see below).
8. **Resolve entities.** The event is attached to a canonical entity, and relations are extracted.
9. **Extract attachments.** Files referenced by the event become resources.

Embedding happens afterwards, out of band, in the embedding worker.

## Ontology and capabilities

Perception refuses to hardcode an enum per provider. Three layers:

1. **Raw observations** — what the source actually said.
2. **Generated concepts** — `ontology_concepts` rows with a label, kind, description, confidence
   and source, plus `ontology_concept_aliases` for the synonyms.
3. **Stable capabilities** — the contract code branches on.

A concept looks like `{label: "customer_company", kind: "entity_type", capabilities:
["organization", "commercial_account"], confidence: 0.91}`. Labels are for meaning and display and
may be renamed or aliased; capabilities are the stable bridge into retrieval, stats and entity
resolution. The rule for anything new: check `capabilities.includes("commercial_account")`, never
`type === "client"`.

Entity types are inferred from the event type against a keyword list (`task`, `submission`,
`contract`, `deployment`, `service`, `monitor`, `client`, `invoice`, `payment`, `document`, `form`,
`issue`, `alert`, `repository`, `branch`, `commit`, `release`, `build`, `pipeline`, `organization`,
`account`, `contact`, `person`, `user`), and field roles map to fixed capabilities (`status`,
`identity`, `name`, `person`, `date`, `url`, `amount`).

Low-confidence or risky inferences go to a review queue rather than into production semantics
unchecked.

## Chat and retrieval

A question is not answered by one similarity search.

```
message
  └▶ planner            LLM classifies intent and extracts filters
       └▶ nine lanes    run in parallel, each returning scored events
            └▶ merge    weighted, deduplicated, lane provenance kept per event
                 └▶ enrich  memory episodes, narratives, resource chunks, causal links
                      └▶ score  context confidence
                           └▶ prompt + stream  Claude, grounded, with citations
```

**Planner** (`chat/planner.ts`) classifies the message into one of seven intents: `lookup`,
`trend`, `status_check`, `comparison`, `anomaly`, `narrative`, `counterfactual`. It also extracts
time windows, a comparison window for `comparison`, and scenario details for `counterfactual`. An
unparseable plan falls back to `narrative`.

**Lanes** (`chat/lanes/`), nine of them:

| Lane | What it retrieves |
|---|---|
| `entity` | Events attached to entities mentioned in the question |
| `fts` | Full-text search over event content |
| `concept` | Events carrying matching ontology concepts |
| `sql` | Structured filters over extracted facts |
| `vector` | Voyage embedding similarity |
| `stats` | Statistical snapshots and detected signals |
| `graph` | Neighbors reached by traversing entity relations |
| `community` | Detected community summaries |
| `text_to_sql` | A generated SQL query against the fact tables |

**Merge and rank** applies per-intent lane weights and deduplicates, keeping the set of lanes that
surfaced each event so the answer can show why something was retrieved.

**Lane weights are learned, not fixed.** Every answer records a `retrieval_outcomes` row with the
intent, the weights used, the active lanes and the top event ids. Message-level feedback
(`PATCH /chat/messages/:id/feedback`) labels those outcomes, and the bandit worker refits weights
per intent daily via Thompson sampling over Beta posteriors.

**Context confidence** is scored before answering, from event quality (`complete` 1.0, `partial`
0.6, `degraded` 0.2), score spread, lane diversity against an intent-specific expectation, entity
coverage and event count. It is exposed alongside the answer so a thin-evidence answer looks thin.

**Prompt safety.** Retrieved events enter the prompt as tagged evidence lines
(`[EVENT id=… provider=… type=… quality=… lanes=… ]`), explicitly untrusted. Event content is data
to reason about, never instructions to follow.

## Data model

libSQL — SQLite with vector search and FTS — in a single file. 56 tables, created by `db/schema.sql`
and 36 migrations in `db/migrations.ts`, applied automatically at startup.

**Events and extraction** — `events`, `event_embeddings`, `event_entities`, `event_concepts`,
`event_counts_daily`, `dynamic_facts`, `ingest_rejections`.

**Schema registry** — `provider_schemas`, `schema_inference_jobs`, `concept_drift_alerts`.

**Ontology** — `ontology_concepts`, `ontology_concept_aliases`.

**Entities** — `entities`, `entity_aliases`, `entity_relations`, `entity_communities`,
`entity_narratives`, `entity_match_candidates`, `entity_merge_log`.

**Chat and memory** — `chat_sessions`, `chat_messages`, `memory_episodes`, `retrieval_outcomes`,
`retrieval_weight_versions`, `token_usage`.

**Analysis** — `stats_snapshots`, `change_points`, `graph_health_snapshots`, `topology_snapshots`,
`causal_links`.

**Forecasting** — `forecasts`, `forecast_beliefs`, `forecast_intervals`, `forecast_resolutions`,
`forecast_strategies`, `strategy_forecasts`, `calibration_snapshots`.

**Resources and evaluation** — `resources`, `resource_chunks`, `eval_fixtures`, `eval_runs`,
`eval_results`.

**Operations** — `notifications`, `action_proposals`, `app_settings`, `worker_runs`, `_migrations`.

**Identity** — the `better-auth` tables `user`, `session`, `account`, `verification`,
`organization`, `member`, `invitation`, plus the older `users` and `sessions` tables that predate
the `better-auth` migration and are still read by the OIDC profile-sync path.

Almost every domain table carries a `workspace_id`. `organization` **is** the workspace: a default
one with slug `default` is created at startup, and legacy rows tagged `workspace_id = 'default'`
are backfilled to its real id.

## Authentication

Three paths coexist, which is more history than design:

- **Local password.** `POST /auth/login` compares against `PERCEPTION_ADMIN_PASSWORD`, upserts a
  user and creates a session. Rejected with `password_login_disabled` when `SSO_ONLY=true`.
- **OIDC.** Registered only when `OIDC_ISSUER` and `OIDC_CLIENT_ID` are both set. `/auth/oidc`
  starts the flow, `/auth/oidc/callback` upserts the user by email, stores access and refresh
  tokens, and redirects to `<OIDC_SUCCESS_URL>/chat`. `POST /auth/sync-profile` refreshes name and
  avatar from the userinfo endpoint, **rate limited to once every five minutes** via
  `profile_synced_at`, refreshing the access token when it gets a 401. This is the same OIDC client
  adapter shape the rest of the suite copy-pastes.
- **`better-auth`.** Mounted as a catch-all on `/auth/*`. In `SSO_ONLY` mode, paths containing
  `/sign-up` or `/sign-in/email` are rejected with `sso_only_mode`.

`PERCEPTION_LOCAL_DEV_AUTH_DISABLED=true` short-circuits `/auth/status` to a fake `Dev User`. It is
a development switch and must never be true in production.

## Background workers

22 workers, registered and scheduled in `server.ts`, all running in the API process. Each has a
name, an interval and a staggered first run so a cold start does not fire everything at once.

| Worker | Interval | What it does |
|---|---|---|
| `embedding` | 5 s | Generates Voyage embeddings for new events |
| `resource-embedding` | 5 s | Same, for resource chunks |
| `schema-inference` | 15 s | Infers and applies provider schemas |
| `resolution-oracle` | 1 h | Auto-resolves matured forecasts |
| `memory` | 30 min | Extracts durable memory episodes from idle sessions |
| `uplift` | 6 h | Re-extracts degraded events once a schema is confirmed |
| `communities` | 6 h | Detects entity communities and summarizes them |
| `narratives` | 6 h | Writes per-entity operational narratives |
| `belief-updater` | 6 h | Updates Bayesian belief states for open forecasts |
| `conformal` | 6 h | Computes conformal prediction intervals |
| `cross-link` | 12 h | Discovers cross-provider entity relationships |
| `change-points` | 12 h | BOCPD regime detection on entity event series |
| `notifications` | 24 h | Evaluates anomalies and raises alerts |
| `concept-drift` | 24 h | Detects per-provider distribution drift, invalidates schemas |
| `granger` | 24 h | Finds Granger-causal relations between event series |
| `bandit` | 24 h | Refits retrieval lane weights from feedback |
| `proposals` | 24 h | Generates action proposals from detected gaps |
| `forecasts` | 24 h | Generates forecast questions from signals |
| `ensemble` | 24 h | Strategy forecasts and track-record weighting |
| `graph-health` | 7 d | Graph entropy and connectivity metrics |
| `tda` | 7 d | Topological persistence for knowledge gap detection |
| `calibration` | 7 d | Forecast calibration scores and reliability diagrams |

Workers can be paused globally (`PUT /admin/workers/paused`), inspected
(`GET /admin/workers`, `GET /admin/workers/:name/history`) and triggered by hand
(`POST /admin/workers/:name/run`).

Because they run in-process, **the API cannot be scaled to more than one replica** without every
worker running twice.

## Startup sequence

`server.ts` starts listening immediately, then runs the rest asynchronously: migrations, default
workspace bootstrap, `ready = true`, then worker registration. A failure sets `startupError` and
still sets `ready = true`, so the container does not crash-loop on a bad migration — it comes up
degraded and reports the error on `/health`.

Two probes, and the difference matters:

- `GET /health` — always `200`, with `{ok, ready, startupError?, authError?}`. It is a liveness
  probe and a green response proves nothing about the database.
- `GET /ready` — `503` until bootstrap finishes, then executes `SELECT 1` and returns `503` with
  `db_unavailable` if that fails. This is the one worth alerting on.
