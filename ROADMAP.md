# Perception — rewrite roadmap

Perception is being rebuilt in Go on the Facile Suite chassis. This document is the handoff:
why the rewrite happened, what was deliberately left out, and the order the remaining work
should be done in. Read it before writing code. The technical contract — data model, ingest
signature, retrieval design — is in [`docs/SPEC.md`](docs/SPEC.md).

**Status: the scaffold is done. Phase 1 has not started.**

---

## 1. Why this rewrite exists

The TypeScript Perception ran in production at `perception.facile.studio` from 2026-05-08 to
2026-08-07. Nobody used it. Not "few users" — zero. No one prompted it.

The database says why:

| Evidence | Number |
|---|---|
| Events ingested | 9,355 |
| Events actually embedded | **698** |
| Events stuck `pending` embedding | **8,503** |
| Events `error` | 154 |
| Notifications generated | **7,550** |
| Tables that never held a single row | **~25 of 55** |
| API source | ~21,000 LOC TypeScript |

Semantic retrieval was answering over **7% of the corpus** while the notification worker
emitted thousands of alerts titled with raw Opus task descriptions. The tool could not
answer, and it would not stop talking. Both failures came from the same cause: far more
machinery than anyone had reason to maintain.

For scale, `Casier` — a complete secrets manager with per-project encryption, ACLs,
versioning, an audit log, webhooks and a CLI — is **8,330 lines of Go** and is used every day.
Perception was 2.5× that and used never.

**The rewrite is not about Go.** Go is the suite standard and brings the chassis for free.
The rewrite is about scope. The target is roughly **4,000–5,000 lines** — Journal-sized —
doing the one job well.

## 2. Where the old system went

- **Source**: git history. `git log main` — the last TypeScript commit is `217303b`. Nothing
  is lost; read it when you want to see how the old ingest HMAC or query planner worked.
- **Data**: `~/Backups/perception-2026-08-07/` on lucy. Full libSQL snapshot plus JSON
  exports of every table, verified row-for-row against production. Its `README.md` documents
  the contents and the sensitive parts.

The backup is **reference only**. The new deployment starts empty; there is no migration
path and none is wanted. Nook can replay events if a corpus is needed.

## 3. What Perception is for

One sentence: **ingest structured events from across the Facile Suite, and answer grounded
operational questions about them in natural language.**

Three questions it must answer well. If a feature does not serve one of these, it does not
belong in the codebase:

1. *"What happened with X this week?"* — retrieval over events about a project, person, repo
   or client, summarised with citations back to the source events.
2. *"Where does this stand?"* — the current state of a thing, assembled from its event
   history rather than from a status field somebody forgot to update.
3. *"What changed that I should know about?"* — genuinely notable deviations, at a volume a
   human will read. The old system's 7,550 notifications are the counter-example.

## 4. Target architecture

```
                Nook ──HMAC──▶ POST /api/ingest
                                     │
                              ┌──────▼──────┐
                              │  events     │  Postgres 16 + pgvector
                              │  entities   │  one binary, chi + GORM, tronc chassis
                              │  embeddings │  Voyage voyage-4-lite, 1024 dims
                              └──────┬──────┘
                                     │  hybrid retrieval (vector + full-text)
                              ┌──────▼──────┐
                              │  chat       │  Claude via anthropic-sdk-go, SSE
                              └─────────────┘
                                     │
                          SvelteKit SPA, served by the same binary
```

Everything ships as **one distroless container** serving the API under `/api` and the SPA on
everything else, exactly like Casier and Journal. Logs go to Journal, secrets come from
Casier, identity comes from Authentik via OIDC.

## 5. What the scaffold already gives you

Do not rebuild these. They are done and wired.

- **tronc v0.9.0 chassis** — middleware chain, error envelope, request logging with redaction,
  `/health` + `/ready`, graceful shutdown
- **Scalar API reference at `/docs`**, generated from the hand-written route registry in each
  module's `documentation.go`. `TestEveryRouteIsDocumented` fails the build when a route is
  added without an entry. Fix the registry, never the test.
- **Auth** — sessions with argon2id local accounts and optional Authentik OIDC, `SSO_ONLY`
  supported. Isolated behind the porte seam (§7).
- **Postgres 16 + pgvector**, extension enabled by the migration runner; GORM models and
  `schemas.Migrate`
- **Journal** log shipping, **Casier** secret injection via `mise run dev`
- **Docker + Dokploy + Traefik** for `perception.facile.studio`, distroless, argv healthcheck
- **SvelteKit 5 SPA** with muse, auth flow, empty authenticated shell
- **`scripts/check.sh`** — gofmt, vet, test, client type-check; also refuses any non-Postgres
  database driver. Wired to a `pre-push` hook via `mise run hooks`.

## 6. Phases

Each phase is independently shippable and ends in something a person can use. Do them in
order — each depends on the one before.

### Phase 1 — Ingest

The intake path, and nothing downstream of it.

- `POST /api/ingest`, HMAC-SHA256 signed, with timestamp skew and event-ID replay protection,
  and support for a rotating previous key. Port the scheme from the old TypeScript
  (`apps/api/src/ingest/` on `main`) — it worked; 9,355 events landed and only 243 were
  rejected.
- `events` table per [`docs/SPEC.md`](docs/SPEC.md), with `ingest_rejections` so a
  misconfigured emitter is visible rather than silent.
- Unknown providers still create an event at `quality = degraded`. **No silent drops.**
  Note that in the entire old corpus `quality` was `complete` for all 9,355 rows — that path
  never fired, so it is untested in practice. Test it.
- Normalise `occurred_at` to `timestamptz` at the boundary. The old corpus mixes ISO-8601
  with RFC-2822 from the IMAP provider, which broke ordering. Parse both, store one.
- Fix `actor_email`. The old schema stored only `actor_email_hash`, which is why Perception
  is invisible to the suite event contract (`Wiki/HARMONIZATION.md` §3). Store the address.

**Exit:** Nook points at the new endpoint and events accumulate. `GET /api/events` lists and
filters them. The corpus grows for a few days before anything is built on top.

### Phase 2 — Embeddings

- Voyage `voyage-4-lite`, 1024 dimensions, into a pgvector `vector(1024)` column with an
  HNSW index.
- A worker with **bounded retries, visible failure, and a backlog metric on `/ready`**. The
  old worker silently stalled at 698 of 9,355 and nothing noticed for months. Whatever else
  this phase does, it must make that impossible: if the backlog exceeds a threshold, the
  service is degraded and says so.
- Backfill is just the worker draining; there is no separate path.

**Exit:** embedding coverage is observable and above 99%, and a deliberately failing embed
shows up somewhere a human looks.

### Phase 3 — Retrieval and chat

The point of the product.

- Hybrid retrieval: pgvector cosine similarity **plus** Postgres full-text (`tsvector` + GIN),
  fused. Journal already does the full-text half — read `modules/logs` there.
- **One** retrieval lane. The old system had five plus a planner deciding between them, and
  the planner was 3,169 lines that no user ever exercised. Add a second lane only when a real
  question demonstrably fails without it.
- Claude via `anthropic-sdk-go`, streamed over SSE. The tool-call loop is hand-rolled — there
  is no Vercel AI SDK in Go — but with one lane it is a couple of hundred lines.
- Every answer cites the events it used. An answer without citations is a bug: this is a
  grounded-retrieval product, not a chatbot.

**Exit:** the three questions in §3 get useful, cited answers over the real corpus.

### Phase 4 — Entities

- Entity resolution over events: repos, projects, people, deployments, clients. The old
  corpus had 572 entities and 4,817 aliases from 9,355 events, which was reasonable.
- What was not reasonable: **271,126 entity relations** and entities minted from full Opus
  task titles. Resolution must have a notion of what is an entity and what is a work item.
- `GET /api/entities`, and entity context injected into retrieval.

**Exit:** asking about a repo or a person by name retrieves their events without the question
having to quote them exactly.

### Phase 5 — Notifications, if and only if earned

Do not start this until phases 1–4 are in daily use.

The bar: **a notification a person reads and acts on.** The old system sent 7,550 and trained
its only user to ignore them. Requirements before a single alert ships:

- per-entity and per-digest rate limiting, and a daily cap
- rollup — a hundred things going quiet in one dead project is one notification
- entity names truncated and sanitised for display
- an explicit "why am I seeing this" line on every alert

If it cannot clear that bar, ship no notifications. Silence beats noise.

### Phase 6 — Suite integration

- Emit Perception's own events back into Nook via `pool`/`enveloppe`, closing the loop.
- Regenerate `perception-js` from `/docs/openapi.json` rather than hand-writing an SDK.

## 7. The porte seam

Auth will be extracted into a shared suite package called **porte**. The scaffold is built so
that becomes a mechanical change, and it must stay that way.

- `internal/identity` owns `Identity` and the `Authenticator` interface. Nothing else does.
- `middleware.RequireAuth` takes the interface, never a concrete service.
- **Feature modules take `identity.Authenticator` in `RegisterRoutes`. Never `*auth.Service`.**
- `modules/auth` is imported by `main.go` and by nothing else. `seam_test.go` enforces this.

When porte lands: delete `modules/auth`, add the dependency, construct it in `main.go`, done.
If you find yourself reaching into `modules/auth` from a feature module, you are about to cost
someone a day.

This is a deliberate divergence from Casier, which passes `*auth.Service` around and
type-asserts an anonymous interface inside its middleware. Do not port that pattern back.

## 8. Decisions already made

Settled. Reopen only with new evidence, not with taste.

| Decision | Why |
|---|---|
| Postgres + pgvector, not libSQL | Suite standard is PG16; libSQL was Perception's only reason to be different |
| One chat lane, not five | The five-lane planner was 3,169 LOC serving zero users |
| No forecasting, no changepoint detection, no community detection | 3,715 LOC of statistics writing to tables that stayed empty |
| No OIDC access/refresh token storage | The old app stored them; today's backup contains live refresh tokens as a result |
| No local user table growth beyond auth | Identity belongs to Authentik, and soon to porte |
| `actor_email`, not `actor_email_hash` | The hash is why Perception is invisible to the suite event contract |
| Notifications last, not first | 7,550 alerts is what "first" produced |

## 9. Explicitly not building

`forecasts`, `forecast_beliefs`, `forecast_strategies`, `calibration_snapshots`,
`change_points`, `causal_links`, `communities`, `entity_communities`, `topology_snapshots`,
`graph_health_snapshots`, `action_proposals`, `ontology_concepts`, `concept_drift_alerts`,
`memory_episodes`, `entity_narratives`, `schema_inference_jobs`, `eval_fixtures`,
`eval_runs`, `eval_results`, `retrieval_weight_versions`, `retrieval_outcomes`,
`stats_snapshots`, `dynamic_facts`.

Every one of those existed in the TypeScript app. Most never held a row. If one turns out to
be genuinely needed, it can be argued for on its own merits — but the default is no.

## 10. Open questions for a human

1. **Who is the user?** Perception has one plausible daily reader today. Design for that
   person specifically rather than for a team that does not exist yet.
2. **Does chat beat a good filtered list?** Phase 1 gives a browsable event list. If that
   answers the three questions in §3, phase 3 gets cheaper or smaller. Find out before
   building the LLM path.
3. **Does Nook re-emit history?** If not, the new instance starts from zero and phase 3 has a
   thin corpus for its first weeks.
