# Perception Roadmap

Unified plan. Merges FUTURE.md, FUTURE2.md, FUTURE3.md into a single dependency-ordered execution plan.

**Current state:** Perception ingests structured events from Nook via HMAC-signed webhooks, normalizes them into a hybrid retrieval system (vector + FTS + SQL + entity + concept + stats lanes), resolves entities with an evolving ontology, and answers grounded operational questions via streaming chat with Claude. Stack: Bun + Hono + libSQL + Voyage AI + SvelteKit 5.

**Architecture principle:** The LLM is the reasoning and communication layer on top of a quantitative foundation. Every phase strengthens the foundation before expanding the reasoning surface.

---

## Phase 1 — Retrieval Quality

No new tables. No new workers. Just make what exists significantly better.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 1.1 | Richer embedding documents | Low | — |
| [x] | 1.2 | Intent classification in query planner | Low | — |
| [x] | 1.3 | Event quality uplift worker | Medium | — |
| [x] | 1.4 | Email body excerpts | Medium | — |
| [x] | 1.5 | Retrieval quality feedback loop | Medium | — |

---

### 1.1 Richer Embedding Documents

- [x] Expand `apps/api/src/embeddings/input.ts` text builder to: `{actor_name} {event_type} {entity_name} ({entity_type}) via {provider_type}: {title}. {summary}. Key facts: {top 3 dynamic_facts values}.`
- [x] Re-embed all existing events (reset embedding status to `pending` for all rows)

Natural language sentence, not a keyword dump. Validated via Phase 5.3 eval harness when available.

---

### 1.2 Intent Classification in Query Planner

- [x] Add `intent` field to `QueryPlan` type in `apps/api/src/chat/planner.ts`
- [x] Update Haiku prompt to output one of: `lookup | trend | status_check | comparison | anomaly | narrative`
- [x] Gate lane execution per intent in `retrieve.ts` (skip irrelevant lanes)
- [x] Apply intent-specific lane weight overrides in `mergeAndRank`

| Intent | Lane Weights | Behavior |
|--------|-------------|----------|
| `lookup` | Entity↑ FTS↑ Vector↓ | Maximize entity/fact precision |
| `trend` | Stats↑ SQL↑ Vector↓ FTS↓ | Weight stats snapshots heavily |
| `status_check` | Stats↑ Entity↑ | Latest state, not history |
| `comparison` | SQL↑ Stats↑ | Dual time windows (see 2.4) |
| `anomaly` | Stats↑ SQL↑ Entity↑ | Deviation detection |
| `narrative` | Vector↑ Entity↑ FTS↑ | Broad context assembly |

---

### 1.3 Event Quality Uplift Worker

- [x] Build background worker (nightly + on-schema-confirmation trigger)
- [x] Query: events with `quality = 'degraded'` or `'partial'` matching a confirmed `provider_schemas` row
- [x] Re-run `mapPayload` with confirmed schema, update `dynamic_facts`
- [x] Reset embedding status to `pending` for re-embedded events

Silent quality improvement over time. Zero user-facing work.

---

### 1.4 Email Body Excerpts

- [x] Upgrade IMAP extractor: fetch first 500 chars of `text/plain` part
- [x] Redaction pass: strip quoted history (lines starting with `>`), strip signatures (after `-- \n`)
- [x] PII pass: hash email addresses in excerpt text before storage
- [x] Index result in `event_fts.searchable_text` — no new table needed

---

### 1.5 Retrieval Quality Feedback Loop

- [x] Add `feedback` column to `chat_messages`: `null | 'up' | 'down'`
- [x] Migration for the new column
- [x] `PATCH /chat/messages/:id/feedback` endpoint
- [x] Frontend: thumbs up/down buttons on assistant messages
- [x] Verify retrieval lane contribution is tracked per message via `sources`

Implicit signal (Phase 2): follow-up question within 30s = probable insufficient context. Data here becomes the training signal for outcome-guided retrieval in Phase 5.

---

## Phase 2 — Structural Intelligence

Build the entity graph, temporal comparison, and proactive alerting.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 2.1 | Cross-entity relationship graph | High | — |
| [x] | 2.2 | Proactive digests | Medium | 1.2 |
| [x] | 2.3 | Self-correcting retrieval (Corrective RAG) | Medium | 1.2, 1.5 |
| [x] | 2.4 | Temporal diff queries | Medium | 1.2 |

---

### 2.1 Cross-Entity Relationship Graph

`entity_relations` already exists (migration 003). Current population: rule-based capability matching during ingest (10+ rules). What's missing: post-hoc inference and graph traversal at query time.

- [x] Batch worker: find entities sharing names/IDs across providers, create relations with `source = 'name_similarity'` or `source = 'shared_external_id'`
- [x] Graph traversal lane in `retrieve.ts`: given an entity match, walk 1-2 hops in `entity_relations`, pull all connected entity events
- [x] Wire traversal lane to `intent = 'narrative'` when a single entity is detected in the query plan

---

### 2.2 Proactive Digests

- [x] Anomaly evaluator: entity velocity spike (current > mean + 2σ), service health degradation (>30% shift to error states), client silence (zero activity for 2+ weeks), actor absence (1+ week)
- [x] `notifications` table: `id`, `type`, `severity`, `title`, `message`, `entity_id`, `entity_name`, `metadata_json`, `created_at`, `read_at`
- [x] Migration for `notifications`
- [x] Scheduled worker (daily): evaluate anomalies, deduplicate, insert notifications
- [x] Webhook delivery adapter (POST to configurable URL with structured payload)
- [x] Dedicated `/notifications` page with read/unread filtering and mark-as-read
- [x] Unread badge count in sidebar navigation

---

### 2.3 Self-Correcting Retrieval (Corrective RAG)

- [x] Context quality scorer: takes `RetrievalResult`, returns confidence score (avg event quality + score distribution + lane diversity + entity coverage ratio)
- [x] Re-plan logic: if score below threshold, generate relaxed `QueryPlan` (drop provider filters, widen time window 2x, force `requiresSqlFacts: true`)
- [x] Wrap `retrieveContext` in corrective shell in `retrieve.ts` — one retry max
- [x] When correction triggered, prepend note to answer: "Context was sparse — widened search."

---

### 2.4 Temporal Diff Queries

- [x] Add optional `compareWindow: { from, to }` to `QueryPlan` type
- [x] `sqlLane`: accept two windows, return delta-annotated results
- [x] `statsLane`: accept two windows, return delta-annotated results
- [x] Prompt builder: surface deltas as `[COMPARISON current=... previous=... delta=...]` block
- [x] Planner: populate `compareWindow` when `intent = 'comparison'` and user specifies two time references

---

## Phase 3 — Knowledge Synthesis

Pre-compute understanding. Stop assembling answers from fragments every time.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 3.1 | GraphRAG community summaries | Medium | 2.1 |
| [x] | 3.2 | Per-entity narrative synthesis | Medium | 3.1 |
| [ ] | 3.3 | Hierarchical persistent memory | High | 1.5 |
| [x] | 3.4 | Text-to-SQL lane | Medium | 1.2 |

---

### 3.1 GraphRAG — Community Summaries

- [x] `entity_communities` table: `id`, `member_entity_ids` (JSON), `summary`, `generated_at`, `stale`
- [x] Migration for `entity_communities`
- [x] Louvain community detection worker (6h interval + 3min startup delay): export graph as adjacency list, detect communities in pure TS
- [x] Community summary generation: Claude Haiku call per community with member entity names, types, recent event titles
- [x] Staleness: mark community stale when any member entity has new events since `generated_at`
- [x] Community retrieval lane in `retrieve.ts`: on `narrative` or `lookup` intent, query by entity overlap with seed entities
- [x] Inject community summary as `[COMMUNITY_SUMMARY]` context block

---

### 3.2 Per-Entity Narrative Synthesis

- [x] `entity_narratives` table: `entity_id` (PK), `narrative_text`, `source_event_count`, `generated_at`, `staleness_score`
- [x] Migration for `entity_narratives`
- [x] Staleness scoring: `staleness_score = new_events_since_generation / source_event_count`; regenerate when > 0.3
- [x] Narrative generation worker (6h interval): top 50 entities by event count, regenerate when stale
- [x] Narrative retrieval: for `intent: lookup | narrative` with entity match, inject as `[ENTITY_NARRATIVE]` highest-priority context block
- [x] Admin endpoint: `GET /entities/:id/narrative`
- [x] Surface narrative on entity detail page, chat message indicators, and sources panel

---

### 3.3 Hierarchical Persistent Memory

- [ ] `memory_episodes` table: `id`, `session_id`, `summary`, `entity_refs` (JSON), `occurred_at`, `embedding` (F32_BLOB 1024)
- [ ] Migration for `memory_episodes`
- [ ] Post-session extraction worker: after session idle 30 min, run Haiku pass to extract 2-5 durable facts → `memory_episodes`
- [ ] Embed memory episodes via Voyage (same pipeline as events)
- [ ] Memory retrieval lane: on `full` mode queries, fetch top-3 episodes by vector similarity
- [ ] Inject as `[MEMORY]` block after system summary, before event context
- [ ] Pruning: episodes older than 90 days with zero retrieval hits → archived

---

### 3.4 Text-to-SQL Lane

- [x] Schema description serializer: CREATE TABLE representation of key tables with FK relationships, hardcoded for stability
- [x] SQL generation in `text-to-sql.ts`: for `intent: lookup | comparison | trend` + `requiresSqlFacts: true`, call Haiku to produce a read-only SELECT
- [x] Safety layer: regex-validate before execution, reject non-SELECT/DDL/PRAGMA/ATTACH, enforce LIMIT 100 cap
- [x] `textToSqlLane` in `retrieve.ts`: execute generated SQL, surface as `[SQL_RESULT]` context block
- [x] Five few-shot examples covering counts, entity lookup, relations, temporal, and actor aggregation
- [x] Fallback: if generated SQL fails or returns empty, return null silently — existing lanes still provide context

---

## Phase 4 — Mathematical Modeling

Pure math. No LLM calls. No token cost. Deterministic, testable, fast.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [ ] | 4.1 | BOCPD change point detection | Medium | — |
| [ ] | 4.2 | Granger causality on event series | Medium | 4.1 |
| [ ] | 4.3 | Graph entropy health score | Low | 2.1 |
| [ ] | 4.4 | Concept drift tracking | Medium | — |

Note: 4.1 and 4.4 can be built in parallel with Phase 2/3 — no dependencies on the graph or synthesis work.

---

### 4.1 Bayesian Online Change Point Detection (BOCPD)

BOCPD (Adams & MacKay, 2007): maintains a posterior over run-length at every observation. When run-length probability collapses to near-zero, a regime change is detected. Gaussian conjugate prior over inter-arrival times — self-contained TS implementation, no external library.

- [ ] Implement BOCPD in TypeScript: running sufficient statistics per entity, conjugate Gaussian update
- [ ] `change_points` table: `id`, `entity_id`, `provider_type`, `detected_at`, `run_length_probability`, `pre_mean`, `post_mean`
- [ ] Migration for `change_points`
- [ ] Worker: update BOCPD state per active entity on every ingest
- [ ] Trigger: change point above threshold → emit `perception.change_point` internal event → proactive digest (2.2) picks it up
- [ ] Replace hardcoded 2σ threshold in proactive digests with BOCPD signal

---

### 4.2 Granger Causality on Event Co-occurrence

Granger causality: time series X Granger-causes Y if past values of X improve forecasting of Y beyond Y's own history. Implemented as VAR (Vector Auto-Regression) + F-test.

- [ ] `event_counts_daily` table: `date`, `entity_type`, `provider_type`, `count`
- [ ] Migration + daily aggregation worker
- [ ] VAR fitting worker: for series pairs with 30+ data points, fit VAR(p), compute Granger F-test
- [ ] `causal_links` table: `id`, `cause_series`, `effect_series`, `lag_days`, `f_statistic`, `p_value`, `computed_at`
- [ ] Migration for `causal_links`
- [ ] Retrieval integration: on `intent: anomaly`, inject top-k significant causal links as `[CAUSAL_CONTEXT]` block
- [ ] Threshold: p < 0.05, min lag 1 day, min 30-sample history

---

### 4.3 Graph Entropy Health Score

- [ ] `graph_health_snapshots` table: `id`, `computed_at`, `node_count`, `edge_count`, `degree_entropy`, `isolated_node_ratio`, `largest_component_ratio`
- [ ] Migration for `graph_health_snapshots`
- [ ] Weekly worker: compute degree distribution entropy (`H = -Sigma p(k) log p(k)`) over `entity_relations`
- [ ] Dark zone detector: entities with 0 relationships and > N events from same provider → flagged as isolated
- [ ] Surface in `GET /stats` response alongside existing snapshots
- [ ] Admin UI: "knowledge gaps" section showing isolated entity list

---

### 4.4 Temporal Concept Drift Tracking

ADWIN (Adaptive Windowing): per provider + event type pair, maintain sliding window distribution of field values. When distribution shifts significantly → drift alert.

- [ ] Implement ADWIN in TypeScript: sliding window, per-field value distribution tracking
- [ ] `concept_drift_alerts` table: `id`, `provider_type`, `field_name`, `detected_at`, `old_distribution` (JSON), `new_distribution` (JSON), `drift_score`
- [ ] Migration for `concept_drift_alerts`
- [ ] Worker: evaluate per provider+event_type pair on every ingest batch
- [ ] On significant drift: set `provider_schemas.confirmed_at = null`, queue schema re-inference job
- [ ] Admin UI: drift alerts surfaced with "review ontology" link to affected provider schema

---

## Phase 5 — Agentic & Adaptive

The system acts, learns, and decomposes complex queries.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [ ] | 5.1 | Multi-agent query decomposition | Medium | 1.2, 2.1 |
| [ ] | 5.2 | Write-back to source systems | High | 2.2 |
| [ ] | 5.3 | Continuous retrieval eval harness | Medium | 1.5 |
| [ ] | 5.4 | Outcome-guided retrieval (RL) | High | 1.5, 5.3 |
| [ ] | 5.5 | Multimodal ingestion | Medium | — |

---

### 5.1 Multi-Agent Query Decomposition

- [ ] Composite intent detector in planner: returns `isComposite: boolean` + `subqueries: string[]`
- [ ] Subagent runner: lightweight wrapper around `buildQueryPlan → retrieveContext → buildContextBlock`, parameterized per sub-query
- [ ] Fan-out in `stream.ts`: `Promise.all` over subagents, collect `RetrievalResult[]`
- [ ] Merge strategy: deduplicate events by ID, concatenate context blocks with sub-query labels, rank by score across all sub-results
- [ ] Token budget: cap merged context at fixed limit, prioritize highest-scoring events
- [ ] For >5 sub-queries: two-level hierarchy (orchestrator → intermediate agents → workers)

---

### 5.2 Write-Back to Source Systems

Hard constraint: no autonomous execution without user confirmation.

- [ ] `action_proposals` table: `id`, `action_type`, `target_provider`, `target_entity_id`, `payload` (JSON), `confidence`, `status` (proposed/approved/executed/dismissed), `proposed_at`, `resolved_at`
- [ ] Migration for `action_proposals`
- [ ] Proposal generator: Perception identifies gaps and creates proposals (client silent 45 days → propose Vikunja task)
- [ ] UI: actionable proposal cards — one-click approve or dismiss
- [ ] Vikunja write adapter: task creation
- [ ] Docuseal write adapter: contract annotation (not mutation)
- [ ] Charles write adapter: client tag (at-risk, high-velocity)
- [ ] Audit: all executed actions logged as events with `provider_type = 'perception-actions'`

---

### 5.3 Continuous Retrieval Eval Harness

- [ ] `eval_fixtures` table: `id`, `question`, `expected_event_ids` (JSON), `expected_lanes` (JSON), `intent`, `notes`
- [ ] Migration for `eval_fixtures`
- [ ] Eval runner: `POST /admin/eval/run` — runs all fixtures, compares retrieved top-5 against expected
- [ ] Metrics: precision@5, recall@5, MRR (mean reciprocal rank), per-lane hit rate
- [ ] Regression gate: score drops >5% vs last run → admin alert
- [ ] Fixture sourcing: thumbs-up feedback (1.5) optionally promoted to eval fixture

---

### 5.4 Outcome-Guided Retrieval (Contextual Bandit)

- [ ] `retrieval_outcomes` table: `id`, `query_id`, `session_id`, `lane_weights` (JSON), `top_event_ids` (JSON), `outcome_label` (up/down/implicit_negative), `occurred_at`
- [ ] Migration for `retrieval_outcomes`
- [ ] At each query: record lane weight config used + top events retrieved
- [ ] Bandit updater worker (daily): fit updated lane weights from recent outcomes via LinUCB or Thompson sampling
- [ ] Exploration: 10% of queries sample from exploration policy instead of current best weights
- [ ] `retrieval_weight_versions` table for rollback
- [ ] Implicit negative signal: follow-up question within 30s after an answer

---

### 5.5 Multimodal Ingestion

- [ ] PDF text extraction at ingest time (`pdfjs-dist` in Bun): extract text from Docuseal contract PDFs
- [ ] Index extracted PDF text in `event_fts.searchable_text`
- [ ] Image OCR adapter: when `payload.attachments` contains image MIME types, run OCR (Tesseract WASM or vision model)
- [ ] Index OCR text in `event_fts.searchable_text`
- [ ] No new retrieval lane needed — feeds into existing FTS

---

## Phase 6 — Frontier

Research-grade capabilities. High effort, unique differentiation.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [ ] | 6.1 | Counterfactual / what-if simulation | High | 4.2, 5.2 |
| [ ] | 6.2 | Topological knowledge gap detection (TDA) | High | 2.1, 4.3 |

---

### 6.1 Counterfactual Simulation

- [ ] Counterfactual query parser: detect "what if", "if X had", "suppose", "had we" patterns in planner
- [ ] Fact mutation engine: clone relevant fact rows in memory (no DB write), apply delta or substitution
- [ ] Structural mode: re-evaluate causal rules from `causal_links` with mutated facts, flag shifted downstream events
- [ ] Probabilistic mode: sample N replications from causal lag distributions, return outcome distribution
- [ ] Response format: `[COUNTERFACTUAL scenario=... probability=... outcome=...]` block — clearly labeled as simulation, not evidence

---

### 6.2 Topological Knowledge Gap Detection (TDA)

- [ ] Graph export: serialize `entity_relations` as weighted adjacency matrix
- [ ] TDA worker (Python sidecar or WASM build): compute H0/H1 persistence via Vietoris-Rips filtration using `gudhi` or `ripser`
- [ ] `topology_snapshots` table: `id`, `computed_at`, `h0_component_count`, `h1_loop_count`, `max_h0_persistence`, `gap_entity_ids` (JSON)
- [ ] Migration for `topology_snapshots`
- [ ] Admin UI: "knowledge gaps" section — entity clusters that have never connected to the main component

---

## Dependency Graph

```
Phase 1 (Foundation)
  1.1 Richer embeddings ─────────────────────────────────────────┐
  1.2 Intent classification ──┬──────────────────────────────────┤
  1.3 Event quality uplift    │                                  │
  1.4 Email body excerpts     │                                  │
  1.5 Feedback loop ──────────┼────────────────────┐             │
                              │                    │             │
Phase 2 (Structure)           │                    │             │
  2.1 Entity graph ───────────┼───────────┐        │             │
  2.2 Proactive digests       │           │        │             │
  2.3 Corrective RAG ─────────┘           │        │             │
  2.4 Temporal diffs                      │        │             │
                                          │        │             │
Phase 3 (Synthesis)                       │        │             │
  3.1 GraphRAG communities ───────────────┘        │             │
  3.2 Entity narratives ──────────────────(3.1)    │             │
  3.3 Hierarchical memory ─────────────────────────┘             │
  3.4 Text-to-SQL ───────────────────────────────────────────────┘
                                          │
Phase 4 (Math)                            │
  4.1 BOCPD ──────────────────────────────┤
  4.2 Granger causality ──────────────(4.1)
  4.3 Graph entropy ──────────────────(2.1)
  4.4 Concept drift                       │
                                          │
Phase 5 (Agentic)                         │
  5.1 Multi-agent decomposition           │
  5.2 Write-back ─────────────────────────┤
  5.3 Eval harness ───────────────────(1.5)
  5.4 Outcome-guided RL ──────────(1.5,5.3)
  5.5 Multimodal ingestion                │
                                          │
Phase 6 (Frontier)                        │
  6.1 Counterfactual sim ─────────(4.2,5.2)
  6.2 TDA gap detection ──────────(2.1,4.3)
```

---

## Execution Notes

**Parallelism within phases:** Tasks within the same phase that don't share dependencies can be built concurrently. Phase 1 is almost entirely parallelizable (1.1-1.5 are independent). Phase 4 tasks are independent of Phase 3 — they can run in parallel once Phase 2 ships.

**Incremental value:** Every task ships independently. No big-bang phase gates. Ship 1.1 alone and retrieval improves the same day.

**Math tasks (Phase 4) can start early:** 4.1 (BOCPD) and 4.4 (concept drift) have no dependencies on Phases 2-3. They can be built as soon as Phase 1 ships, in parallel with Phase 2 work. 4.3 (graph entropy) needs 2.1 only.

**Token cost profile:**
- Phase 1: minimal (embedding input change is free, intent classification uses existing Haiku call)
- Phase 2: one additional Haiku call for corrective re-plan, only when triggered
- Phase 3: community/narrative generation = batch Haiku calls nightly, not per-query
- Phase 4: zero LLM cost (pure math)
- Phase 5: Text-to-SQL adds one Haiku call per qualifying query; multi-agent fans out existing pipeline
- Phase 6: counterfactual uses existing Granger data, minimal new LLM cost

---

## Research Sources

- GraphRAG — Microsoft Research (2024-2025): community detection + LLM summaries over knowledge graphs
- Self-RAG / Corrective RAG — arXiv 2310.11511: evaluate-then-retry retrieval pattern
- Mem0 / Memori — persistent memory architectures for LLM agents
- BOCPD — Adams & MacKay 2007: Bayesian online change point detection
- Granger Causality — VAR-based causal inference on time series
- Shannon / Von Neumann Graph Entropy — information-theoretic graph health metrics
- Task-Decoupled Planning — arXiv 2604.11378: 82% token reduction via query decomposition
- Anthropic Multi-Agent Research System — orchestrator-worker pattern
- Enterprise Text-to-SQL — schema-aware grounding prevents accuracy collapse
- ADWIN — adaptive windowing for concept drift detection
- Persistent Homology / TDA — topological features for structural gap detection
