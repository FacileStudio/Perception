# Perception & Kori — rewrite roadmap

Perception is being rebuilt in Go on the Facile Suite chassis. This document is the handoff:
why the rewrite happened, what was deliberately left out, and the order the remaining work
should be done in. Read it before writing code. The technical contract — data model, ingest
signature, retrieval design — is in [`docs/SPEC.md`](docs/SPEC.md).

**Status: phase 1 is built, and waiting on Antenne being repointed.** Ingest, the event
listing and the rejection log are in; the corpus is empty until Antenne's Perception delivery
target names the new endpoint and both sides share `INGEST_HMAC_SECRET`.

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
The rewrite is about scope.

## 2. Where the old system went

- **Source**: git history. `git log main` — the last TypeScript commit is `217303b`. Nothing
  is lost; read it when you want to see how the old ingest HMAC or query planner worked.
- **Data**: `~/Backups/perception-2026-08-07/` on lucy. Full libSQL snapshot plus JSON
  exports of every table, verified row-for-row against production. Its `README.md` documents
  the contents and the sensitive parts.

The backup is **reference only**. The new deployment starts empty; there is no migration
path and none is wanted. Antenne can replay events if a corpus is needed.

## 3. Three things, and which is which

The single biggest change since the August scaffold: **Perception is no longer the thing you
talk to.** It is the engine. Kori is the face. Nacelle is what Kori is built out of.

| | What it is | Where it lives | Who talks to it |
|---|---|---|---|
| **Perception** | The analytics black box. Ingests suite events, embeds them, resolves entities and their relationships, answers structured questions about them. Speaks HTTP and MCP. No chat UI. | this repo, `apps/api/modules/*` | Kori, and any other agent |
| **Kori** | The agent. The suite's mascot and its only conversational surface. Asks Perception for facts, calls tools on other suite apps, answers in natural language with citations. | this repo, `apps/api/modules/kori` + the client | humans |
| **Nacelle** | The agent SDK. The model loop, tool registry, MCP wiring, streaming and usage accounting, with no opinion about the product on top. Optional TUI and sandbox layers on the side. | its own public repo, [`FacileStudio/nacelle`](https://github.com/FacileStudio/nacelle) | Kori, Atelier, a `pi` replacement, client sites |

Perception must stay useful with Kori deleted, and Kori must stay useful with Perception
returning nothing. Keep the seam sharp — the MCP server in §6 is that seam, and it is what
makes splitting Kori into its own app a mechanical change if it ever earns one.

**Nacelle is not built here.** It is a suite library in the shape of tronc and porte, and it
has three named consumers on day one, which is why it starts as its own repo rather than being
extracted from this one later:

- **Kori** — headless, embedded in a Go backend, tools reached over MCP
- **Atelier** — agents running inside isolated container boxes, swappable models, cost and
  token accounting per run so best-of-N can be compared
- **A replacement for `pi`** — a TUI coding agent with local file and shell tools

Those three want the same core and three different skins. That is the whole design brief: a
core that a backend can import without dragging in a terminal UI or a container runtime.

### What Kori is for

One sentence: **answer operational questions about Facile in natural language, grounded in
what actually happened, and act on the answer through the suite's tools.**

Four questions it must answer well. If a feature does not serve one of these, it does not
belong in the codebase:

1. *"What happened with X this week?"* — retrieval over events about a project, person, repo
   or client, summarised with citations back to the source events.
2. *"Where does this stand?"* — the current state of a thing, assembled from its event
   history rather than from a status field somebody forgot to update.
3. *"What's connected to this?"* — the neighbourhood of an entity: who touched it, what
   shipped alongside it, which cluster of work it belongs to.
4. *"Do this."* — a tool call against Opus, Sablier, Casier or another app, on the strength of
   what Kori just read.

Question 3 is new, and it is why community detection comes back (§8). Question 4 is new, and
it is the whole reason nacelle exists.

## 4. Target architecture

```
   Antenne ──HMAC──▶ POST /api/ingest
                          │
                   ┌──────▼───────────────────────────┐
                   │ PERCEPTION — the black box       │
                   │  events        Postgres 16       │
                   │  embeddings    + pgvector        │
                   │  entities ─ relations ─          │
                   │             communities          │
                   │  retrieval (vector + FTS + graph)│
                   └──────┬──────────────┬────────────┘
                     HTTP │              │ MCP  (/api/mcp)
                          │              │
                   ┌──────▼──────────────▼────────────┐
                   │ KORI — the agent                 │
                   │  built on nacelle                │
                   │   ├─ Claude, anthropic-sdk-go    │
                   │   ├─ tool registry + MCP client  │
                   │   └─ SSE transcript              │
                   └──────┬───────────────────────────┘
                          │ MCP
              ┌───────────┼───────────┬───────────┐
            Opus       Sablier      Casier      Nuage …
                    (suite MCP servers, once they exist)
                          │
              SvelteKit SPA, served by the same binary
```

Everything ships as **one distroless container** serving the API under `/api` and the SPA on
everything else, exactly like Casier and Journal. Logs go to Journal, secrets come from
Casier, identity comes from Authentik via OIDC.

## 5. What the scaffold already gives you

Do not rebuild these. They are done and wired.

- **tronc v0.14.0 chassis** — middleware chain, error envelope, request logging with redaction,
  `/health` + `/ready`, graceful shutdown, request ids that round-trip
- **Scalar API reference at `/docs`**, generated from the hand-written route registry in each
  module's `documentation.go`. `TestEveryRouteIsDocumented` fails the build when a route is
  added without an entry. Fix the registry, never the test.
- **Auth** — [porte](https://github.com/FacileStudio/porte) v0.3.0: sessions, argon2id local
  accounts, Authentik OIDC, CLI login codes, back-channel logout, `SSO_ONLY`. Mounted from
  `main.go` behind the seam in §7.
- **Postgres 16 + pgvector**, extension enabled by the migration runner; GORM models and
  `schemas.Migrate`
- **Journal** log shipping, **Casier** secret injection via `mise run dev`
- **Docker + Dokploy + Traefik** for `perception.facile.studio`, distroless, argv healthcheck
- **SvelteKit 5 SPA** with muse, auth flow, empty authenticated shell
- **`scripts/check.sh`** — gofmt, vet, test, client type-check; also refuses any non-Postgres
  database driver. Wired to a `pre-push` hook via `mise run hooks`.

### Deployed state, and two things still owed

The scaffold is live at `perception.facile.studio`: one container on `:4000` behind Traefik,
`pgvector/pgvector:pg16` beside it, OIDC through Authentik with `SSO_ONLY=true`, and a login
that has been round-tripped by a human. Routing is owned by `docker-compose.yml`, not by
Dokploy's panel — do not add a domain entry there, it would fight the compose labels and
Dokploy aborts a deploy when a panel domain names a service the compose does not have.

The TypeScript deployment is fully retired: containers, images and the libSQL volume are
deleted, and `api-perception.facile.studio` no longer exists in DNS. Nothing may point at
that host again; the API is same-origin under `/api`.

- **`POSTGRES_PASSWORD` is still the compose default** (`perception-internal-db`). The
  database is `expose`-only on an internal network, so nothing external reaches it, but set a
  real value in Dokploy.
- **Antenne has never been repointed.** Its Perception delivery target still names the retired
  endpoint and was switched off besides, so no events are arriving and none will until phase 1
  lands. Repointing it and setting `INGEST_HMAC_SECRET` on both sides is a paired change, part
  of phase 1's exit criteria.

## 6. Phases

Each phase is independently shippable. Do them in order — each depends on the one before.

Phases 1–4 are engine work and exit on an API plus a thin admin screen; they do not produce
something a person chats with. That is deliberate: Kori answering over an empty corpus with
no entity graph is the old system's failure mode with a nicer name. **If you want early signal
on nacelle's shape, spike Kori as a throwaway right after phase 2 and delete it** — do not
promote the spike.

### Phase 1 — Ingest

The intake path, and nothing downstream of it.

- `POST /api/ingest`, HMAC-SHA256 signed, with timestamp skew and event-ID replay protection,
  and support for a rotating previous key. Port the scheme from the old TypeScript
  (`apps/api/src/ingest/` on `main`) — it worked; 9,355 events landed and only 243 were
  rejected.
- **The headers are `x-antenne-*`, not `x-nook-*`.** Antenne already emits the new names from
  `internal/envelope/signing.go`; the old spec text was written before the rename. Signature
  covers `{timestamp}.{eventId}.{rawBody}`, which matches what Antenne signs today.
- `events` table per [`docs/SPEC.md`](docs/SPEC.md), with `ingest_rejections` so a
  misconfigured emitter is visible rather than silent.
- Unknown providers still create an event at `quality = degraded`. **No silent drops.**
  Note that in the entire old corpus `quality` was `complete` for all 9,355 rows — that path
  never fired, so it is untested in practice. Test it.
- Normalise `occurred_at` to `timestamptz` at the boundary. The old corpus mixes ISO-8601
  with RFC-2822 from the IMAP provider, which broke ordering. Parse both, store one.
- Fix `actor_email`. The old schema stored only `actor_email_hash`, which made "what did this
  person touch" unanswerable. **It does not make Perception part of the suite event contract**,
  which keys on a Facile SSO identity — Antenne's envelope package says plainly that
  `actor.email` is whatever a third-party payload carried. Store it, name it honestly, never
  join it to an account.

**Exit:** Antenne points at the new endpoint and events accumulate. `GET /api/events` lists
and filters them. The corpus grows for a few days before anything is built on top.

### Phase 2 — Embeddings

Retrieval quality is decided here, not in the chat prompt. This phase is worth doing
carefully.

- Voyage `voyage-4-lite`, 1024 dimensions, into a pgvector `vector(1024)` column with an
  HNSW index.
- **`searchable_text` is the product, not an afterthought.** A raw JSON payload embeds badly.
  Build a per-provider template that renders an event into a sentence a human would write —
  actor, verb, entity, project, status, time — and embed that. Store the template version so a
  changed template triggers a re-embed via `input_hash`.
- A worker with **bounded retries, visible failure, and a backlog metric on `/ready`**. The
  old worker silently stalled at 698 of 9,355 and nothing noticed for months. Whatever else
  this phase does, it must make that impossible: if the backlog exceeds a threshold, the
  service is degraded and says so.
- Backfill is just the worker draining; there is no separate path.

**Exit:** embedding coverage is observable and above 99%, a deliberately failing embed shows
up somewhere a human looks, and a handful of hand-written probe queries return the events a
human would have picked.

### Phase 3 — Entities, relationships, communities

The graph. Promoted ahead of chat because "what's connected to this" is a first-class
question now, and retrofitting a graph under a finished chat lane costs more than building
retrieval on top of one.

- Entity resolution over events: repos, projects, people, deployments, clients. The old
  corpus had 572 entities and 4,817 aliases from 9,355 events, which was reasonable.
- What was not reasonable: **271,126 entity relations** and entities minted from full Opus
  task titles. Resolution must have a notion of what is an entity and what is a work item.
- **A relation needs a reason and a weight.** Co-occurrence in one event is not a relation.
  Store the evidence count and the last time it was observed, and prune below a floor —
  otherwise the graph is fully connected by accident again and every traversal returns
  everything.
- **Communities are back in scope**, on one condition: they must be read by retrieval or the
  UI. Cluster the entity graph (Leiden or label propagation over the weighted relations),
  persist `communities` and `entity_communities`, and recompute on a schedule rather than per
  event. A community is a *retrieval expansion*: asking about one entity may pull in its
  neighbours' events. If a phase ends with communities computed and nothing reading them,
  that is the old `topology_snapshots` failure and the table should be deleted.
- `GET /api/entities`, `GET /api/entities/{id}`, `GET /api/entities/{id}/related`.

**Exit:** asking about a repo or a person by name retrieves their events without the question
having to quote them exactly, and `/related` returns a neighbourhood a human recognises.

### Phase 4 — Retrieval

- Hybrid: pgvector cosine similarity **plus** Postgres full-text (`tsvector` + GIN), fused by
  reciprocal rank fusion, then time-decayed. Journal already does the full-text half — read
  `modules/logs` there.
- **Graph expansion is part of the one lane, not a second lane.** When the query resolves to a
  known entity, widen the candidate set to that entity's strong relations and its community
  before ranking. This is a SQL predicate, not a separate retriever with its own weights.
- Filters (provider, entity, time range) are SQL predicates applied to every half, never a
  post-filter on the fused list — post-filtering silently empties results.
- The old system had five lanes plus a 3,169-line LLM planner choosing between them, exercised
  by no user. **Add a second lane only when a specific real question demonstrably fails.**

**Exit:** `POST /api/retrieve` returns ranked, cited events for the four questions in §3, and
its output is good enough that the eventual answer quality is a prompt problem, not a
retrieval problem.

### Phase 5 — Perception speaks MCP

Perception's public face for machines. Built before Kori on purpose: it forces the engine to
have a clean, describable surface, and it means Kori's first tool server is one we control.

- `GET/POST /api/mcp`, streamable HTTP transport, authenticated by the same session or a
  service token. Use the official Go MCP SDK (`github.com/modelcontextprotocol/go-sdk`) —
  verify the current API against the repo before writing, this moves.
- Tools, roughly: `search_events`, `get_event`, `list_entities`, `get_entity`,
  `related_entities`, `event_stats`. Every one is a thin wrapper over an existing HTTP handler
  — if writing an MCP tool needs new business logic, that logic belonged in the module.
- Tool descriptions are prompt engineering. Write them for a model that has never seen this
  codebase, and say what a tool is *for*, not what it returns.
- Every tool result carries event ids so a citation survives the round trip.

**Exit:** Claude Code can connect to `perception.facile.studio/api/mcp` and answer a real
question about the suite. That is the acceptance test, and it needs no Kori.

### Phase 6 — Kori v1, on nacelle

The product. Nacelle is built in its own repo on its own schedule; this phase consumes it and
is the forcing function for its v0.1 API.

**What nacelle owes Kori** (the full design lives in that repo's README):

- `claude-opus-5` via `anthropic-sdk-go`, adaptive thinking (`thinking: {type: "adaptive"}`).
  Do **not** pass `budget_tokens` — it is rejected with a 400 on Opus 5. Tune depth with
  `output_config.effort` instead.
- **No hand-rolled tool loop.** The Go SDK ships `toolrunner` /
  `client.Beta.Messages.NewToolRunner`, with a streaming variant. The August roadmap claimed
  there was no Go equivalent of the Vercel AI SDK and the loop had to be written by hand;
  that is no longer true, and the hand-rolled version is now the expensive option.
- **No MCP client either, for remote servers.** The Claude API's MCP connector calls remote
  MCP servers directly: pass `mcp_servers: [{type: "url", url, name}]` **and**
  `tools: [{type: "mcp_toolset", mcp_server_name: <same name>}]` with the
  `mcp-client-2025-11-20` beta — both halves, or the request is rejected. Nacelle holds the
  server list and its credentials; it does not speak the protocol. Verify the Go binding
  against the SDK before writing; the connector is not documented per-language everywhere.
- Streaming out as typed events Kori can map onto SSE, and usage reported per turn.

**What Kori owns**: the persona and system prompt, the Perception MCP server wired in as its
first tool source, chat sessions persisted with their tool calls and cited event ids, and the
client. Chat *is* the Perception UI now — it replaces the empty authenticated shell. The
engine keeps a thin admin screen for ingest health, embedding backlog and an event browser,
and nothing more.

**An answer that asserts a fact with no citation is a bug.** This is grounded retrieval over a
known corpus, not a general assistant. When retrieval returns nothing, the correct answer is
"nothing in the events covers that", not a plausible paragraph.

**Exit:** the four questions in §3 get useful, cited answers over the real corpus, and one of
them is answered by a tool call rather than by retrieval.

### Phase 7 — Kori reaches the rest of the suite

- Add suite MCP servers to Kori's roster as the apps ship them: Opus, Sablier, Casier, Nuage,
  Agenda. Each is a config entry and a credential, not code.
- **Write actions need a confirmation step.** Reading is free; creating an Opus task or
  stopping a Sablier timer is not. The first destructive tool Kori is given is the moment to
  build that, and not a moment later.
- Emit Perception's own events back into Antenne via `antenne-client`/`enveloppe`, closing the
  loop.
- Regenerate `perception-js` from `/docs/openapi.json` rather than hand-writing an SDK.

### Phase 8 — Notifications, if and only if earned

Do not start this until the phases above are in daily use.

The bar: **a notification a person reads and acts on.** The old system sent 7,550 and trained
its only user to ignore them. Requirements before a single alert ships:

- per-entity and per-digest rate limiting, and a daily cap
- rollup — a hundred things going quiet in one dead project is one notification
- entity names truncated and sanitised for display
- an explicit "why am I seeing this" line on every alert

If it cannot clear that bar, ship no notifications. Silence beats noise. If Kori works, the
right shape is probably "Kori tells you when you ask" plus one daily digest, not a stream.

## 7. The porte seam, and the seams that follow it

**porte has landed** (2026-08-19, v0.3.0). The scaffold was built so that would be a mechanical
change, and it was: the hand-rolled auth module became a constructor call in `main.go`, and no
consumer outside it changed. That is the whole argument for keeping the discipline.

- `internal/identity` owns `Identity` and the `Authenticator` interface. Nothing else does.
- `middleware.RequireAuth` takes the interface, never a concrete service.
- **Feature modules take `identity.Authenticator` in `RegisterRoutes`. Never `*auth.Service`.**
- `modules/auth` is imported by `main.go` and by nothing else.
- Only `main.go` and `modules/auth` build a porte kit — `porte/session`, `porte/local`,
  `porte/oidc`. A second session manager is a second clock and a second cookie policy.
- `seam_test.go` enforces the last two. The contract package `porte` and the storage package
  `porte/pg` are exempt: neither authenticates anybody.

If you find yourself reaching into `modules/auth` from a feature module, you are about to cost
someone a day.

This is a deliberate divergence from Casier, which passes `*auth.Service` around and
type-asserts an anonymous interface inside its middleware. Do not port that pattern back.

**Nacelle is a dependency, not a module.** `modules/kori` imports
`github.com/FacileStudio/nacelle` and is the only package here that may. Nothing
Perception-shaped may travel the other way: if a change to Kori needs a change in nacelle that
mentions events, entities or citations, the abstraction is wrong. Push the Perception-specific
part back into `modules/kori` and keep nacelle ignorant — a shared library that grew one
consumer's vocabulary is a library with one consumer.

## 8. Decisions already made

Settled. Reopen only with new evidence, not with taste.

| Decision | Why |
|---|---|
| Postgres + pgvector, not libSQL | Suite standard is PG16; libSQL was Perception's only reason to be different |
| Perception is headless; Kori is the only face | Two UIs for one corpus is two things to design and one nobody opens |
| Kori lives in this repo until an MCP-shaped seam proves it should not | It has no data of its own, and a second chassis buys nothing today |
| Nacelle is its own public repo from day one | Three consumers already named — Kori, Atelier, a `pi` replacement — which is the bar tronc was extracted at |
| Nacelle's core has no TUI and no container runtime in it | A backend importing an agent SDK must not pull in Bubble Tea; Atelier's sandbox needs must not reach Kori |
| One retrieval lane, graph expansion inside it | The five-lane planner was 3,169 LOC serving zero users |
| **No forecasting.** No changepoint detection, no causal inference, no calibration | 3,715 LOC of statistics writing to tables that stayed empty |
| **Communities are in**, gated on being read by retrieval or the UI | "What's connected to this" is a real question; a clustering nobody queries is not |
| `claude-opus-5`, adaptive thinking, no `budget_tokens` | `budget_tokens` is a 400 on Opus 5; effort replaces it |
| SDK tool runner and the API's MCP connector, not hand-rolled loops | Both exist now; hand-rolling is strictly more code and more bugs |
| No OIDC access/refresh token storage | The old app stored them; today's backup contains live refresh tokens as a result |
| `actor_email`, not `actor_email_hash` | The hash made "what did this person touch" unanswerable. It is source-reported, not a Facile identity, and joins to no account |
| Notifications last, not first | 7,550 alerts is what "first" produced |

## 9. Explicitly not building

`forecasts`, `forecast_beliefs`, `forecast_strategies`, `calibration_snapshots`,
`change_points`, `causal_links`, `topology_snapshots`, `graph_health_snapshots`,
`action_proposals`, `ontology_concepts`, `concept_drift_alerts`, `memory_episodes`,
`entity_narratives`, `schema_inference_jobs`, `eval_fixtures`, `eval_runs`, `eval_results`,
`retrieval_weight_versions`, `retrieval_outcomes`, `stats_snapshots`, `dynamic_facts`.

Every one of those existed in the TypeScript app. Most never held a row. If one turns out to
be genuinely needed, it can be argued for on its own merits — but the default is no.

`communities` and `entity_communities` **were on this list and have been taken off it** as of
2026-08-19. They were cut alongside forecasting because the old implementation was a
statistics feature nobody read. They come back as a graph feature that retrieval consumes,
and they go back on the list if phase 3 ends with nothing reading them.

## 10. Open questions for a human

1. **Who is the user?** Kori has one plausible daily reader today. Design for that person
   specifically rather than for a team that does not exist yet.
2. **Which app ships an MCP server second?** Phase 7 is cheap per app but needs one to exist.
   Opus is the obvious first candidate — it is a third of the corpus and the most likely
   target of "do this".
3. **Does Antenne re-emit history?** If not, the new instance starts from zero and phase 4 has
   a thin corpus for its first weeks.
4. **Does Kori get write access at all?** Read-only Kori is a much smaller security surface.
   Phase 7 assumes yes and builds confirmation; decide before that phase, not during it.
