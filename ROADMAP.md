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
| [x] | 3.3 | Hierarchical persistent memory | High | 1.5 |
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

- [x] `memory_episodes` table: `id`, `session_id`, `summary`, `entity_refs` (JSON), `occurred_at`, `embedding` (F32_BLOB 1024)
- [x] Migration for `memory_episodes`
- [x] Post-session extraction worker: after session idle 30 min, run Haiku pass to extract 2-5 durable facts → `memory_episodes`
- [x] Embed memory episodes via Voyage (same pipeline as events)
- [x] Memory retrieval lane: on `full` mode queries, fetch top-3 episodes by vector similarity
- [x] Inject as `[MEMORY]` block after system summary, before event context
- [x] Pruning: episodes older than 90 days with zero retrieval hits → archived

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
| [x] | 4.1 | BOCPD change point detection | Medium | — |
| [x] | 4.2 | Granger causality on event series | Medium | 4.1 |
| [x] | 4.3 | Graph entropy health score | Low | 2.1 |
| [x] | 4.4 | Concept drift tracking | Medium | — |

Note: 4.1 and 4.4 can be built in parallel with Phase 2/3 — no dependencies on the graph or synthesis work.

---

### 4.1 Bayesian Online Change Point Detection (BOCPD)

BOCPD (Adams & MacKay, 2007): maintains a posterior over run-length at every observation. When run-length probability collapses to near-zero, a regime change is detected. Gaussian conjugate prior over inter-arrival times — self-contained TS implementation, no external library.

- [x] Implement BOCPD in TypeScript: running sufficient statistics per entity, conjugate Gaussian update
- [x] `change_points` table: `id`, `entity_id`, `provider_type`, `detected_at`, `run_length_probability`, `pre_mean`, `post_mean`
- [x] Migration for `change_points`
- [x] Worker: update BOCPD state per active entity on every ingest
- [x] Trigger: change point above threshold → emit `perception.change_point` internal event → proactive digest (2.2) picks it up
- [x] Replace hardcoded 2σ threshold in proactive digests with BOCPD signal

---

### 4.2 Granger Causality on Event Co-occurrence

Granger causality: time series X Granger-causes Y if past values of X improve forecasting of Y beyond Y's own history. Implemented as VAR (Vector Auto-Regression) + F-test.

- [x] `event_counts_daily` table: `day`, `series_key`, `cnt`
- [x] Migration + daily aggregation in worker
- [x] Pure TS VAR fitting: OLS via normal equations, BIC lag selection (max 7), Gauss-Jordan inversion
- [x] `causal_links` table: `id`, `cause_series`, `effect_series`, `lag_days`, `f_statistic`, `p_value`, `bic_score`, `sample_size`, `direction`, `detected_at`, `superseded_at`
- [x] Migrations 015 + 016
- [x] Retrieval integration: on `intent: anomaly`, inject top-5 significant causal links as `[CAUSAL_CONTEXT]` block
- [x] Threshold: p < 0.01 with Bonferroni correction, min 60-day history, first-differencing, >50% non-zero filter

---

### 4.3 Graph Entropy Health Score

- [x] `graph_health_snapshots` table: `id`, `computed_at`, `node_count`, `edge_count`, `degree_entropy`, `isolated_node_ratio`, `largest_component_ratio`
- [x] Migration for `graph_health_snapshots`
- [x] Weekly worker: compute degree distribution entropy (`H = -Sigma p(k) log p(k)`) over `entity_relations`
- [x] Dark zone detector: entities with 0 relationships and > N events from same provider → flagged as isolated
- [x] Surface in `GET /stats` response alongside existing snapshots
- [x] Admin UI: "knowledge gaps" section showing isolated entity list

---

### 4.4 Temporal Concept Drift Tracking

ADWIN (Adaptive Windowing): per provider + event type pair, maintain sliding window distribution of field values. When distribution shifts significantly → drift alert.

- [x] Implement ADWIN in TypeScript: sliding window, per-field value distribution tracking
- [x] `concept_drift_alerts` table: `id`, `provider_type`, `field_name`, `detected_at`, `old_distribution` (JSON), `new_distribution` (JSON), `drift_score`
- [x] Migration for `concept_drift_alerts`
- [x] Worker: evaluate per provider+event_type pair on every ingest batch
- [x] On significant drift: set `provider_schemas.confirmed_at = null`, queue schema re-inference job
- [x] Admin UI: drift alerts surfaced with "review ontology" link to affected provider schema

---

## Phase 5 — Agentic & Adaptive

The system acts, learns, and decomposes complex queries.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 5.1 | Multi-agent query decomposition | Medium | 1.2, 2.1 |
| [x] | 5.2 | Write-back to source systems | High | 2.2 |
| [x] | 5.3 | Continuous retrieval eval harness | Medium | 1.5 |
| [x] | 5.4 | Outcome-guided retrieval (RL) | High | 1.5, 5.3 |
| [x] | 5.5 | Resources & multimodal ingestion | Medium | — |

---

### 5.1 Multi-Agent Query Decomposition

- [x] Composite intent detector in planner: returns `isComposite: boolean` + `subqueries: string[]`
- [x] Subagent runner: lightweight wrapper around `buildQueryPlan → retrieveContext → buildContextBlock`, parameterized per sub-query
- [x] Fan-out in `stream.ts`: `Promise.all` over subagents, collect `RetrievalResult[]`
- [x] Merge strategy: deduplicate events by ID, concatenate context blocks with sub-query labels, rank by score across all sub-results
- [x] Token budget: cap merged context at fixed limit, prioritize highest-scoring events
- [x] For >5 sub-queries: two-level hierarchy (orchestrator → intermediate agents → workers)

---

### 5.2 Write-Back to Source Systems

Hard constraint: no autonomous execution without user confirmation.

- [x] `action_proposals` table: `id`, `action_type`, `target_provider`, `target_entity_id`, `payload` (JSON), `confidence`, `status` (proposed/approved/executed/dismissed), `proposed_at`, `resolved_at`
- [x] Migration for `action_proposals`
- [x] Proposal generator: Perception identifies gaps and creates proposals (client silent 45 days → propose Vikunja task)
- [x] UI: actionable proposal cards — one-click approve or dismiss
- [x] Vikunja write adapter: task creation
- [x] Docuseal write adapter: contract annotation (not mutation)
- [x] Charles write adapter: client tag (at-risk, high-velocity)
- [x] Audit: all executed actions logged as events with `provider_type = 'perception-actions'`

---

### 5.3 Continuous Retrieval Eval Harness

- [x] `eval_fixtures` table: `id`, `question`, `expected_event_ids` (JSON), `expected_lanes` (JSON), `intent`, `notes`, `source_message_id`, `created_at`
- [x] `eval_runs` table: `id`, `ran_at`, `fixture_count`, `precision_at_5`, `recall_at_5`, `mrr`, `lane_hit_rates` (JSON), `duration_ms`, `regression_detected`
- [x] `eval_results` table: `id`, `run_id`, `fixture_id`, `retrieved_event_ids` (JSON), `retrieved_lanes` (JSON), `precision_val`, `recall_val`, `reciprocal_rank`, `score`
- [x] Migration 018 for all eval tables
- [x] Eval runner: `POST /admin/eval/run` — runs all fixtures through full retrieval pipeline, compares retrieved top-5 against expected
- [x] Metrics: precision@5, recall@5, MRR (mean reciprocal rank), per-lane hit rate
- [x] Regression gate: score drops >5% vs last run → notification with `type = 'eval_regression'`
- [x] Fixture CRUD: `GET/POST/DELETE /admin/eval/fixtures`
- [x] Run history: `GET /admin/eval/runs`, `GET /admin/eval/runs/:runId` with per-fixture breakdown
- [x] Fixture sourcing: thumbs-up feedback (1.5) promoted via `POST /admin/eval/promote/:messageId`

---

### 5.4 Outcome-Guided Retrieval (Contextual Bandit)

- [x] `retrieval_outcomes` table: `id`, `query_id`, `session_id`, `lane_weights` (JSON), `top_event_ids` (JSON), `outcome_label` (up/down/implicit_negative), `occurred_at`
- [x] Migration for `retrieval_outcomes`
- [x] At each query: record lane weight config used + top events retrieved
- [x] Bandit updater worker (daily): fit updated lane weights from recent outcomes via LinUCB or Thompson sampling
- [x] Exploration: 10% of queries sample from exploration policy instead of current best weights
- [x] `retrieval_weight_versions` table for rollback
- [x] Implicit negative signal: follow-up question within 30s after an answer

---

### 5.5 Resources & Multimodal Ingestion

Expanded beyond the original multimodal scope: user-uploadable document knowledge base with chunking, embedding, and retrieval — plus event attachment auto-extraction as a future thin layer.

- [x] `resources` table: `id`, `title`, `description`, `mime_type`, `file_size`, `source_type` (upload/event_attachment), `source_event_id`, `chunk_count`, `status`, `error`, `uploaded_at`, `updated_at`
- [x] `resource_chunks` table: `id`, `resource_id`, `chunk_index`, `content`, `token_count`, `embedding_status`, `embedding` (F32_BLOB 1024), `input_hash`, `locked_at`, `attempts`, `last_error`
- [x] Migration 017 for both tables
- [x] Recursive character splitter: 1800 char chunks (~450 tokens), 180 char overlap, 4-tier separators (`\n\n`, `\n`, `. `, ` `)
- [x] PDF text extraction via `unpdf` (cross-runtime, serverless PDF.js build)
- [x] Plain text / markdown / CSV / JSON passthrough
- [x] Resource processing pipeline: extract → chunk → insert chunks with pending embedding status
- [x] Resource embedding worker (5s interval): same claim/lock/embed pattern as event embeddings, reuses Voyage pipeline
- [x] Resource retrieval: vector similarity over `resource_chunks`, top 5 by cosine distance
- [x] `[RESOURCE]` context block in LLM prompt — injected between memory episodes and narratives
- [x] Resource metadata in SSE done payload
- [x] REST API: `POST /resources` (multipart upload), `GET /resources`, `GET /resources/:id` (with chunks), `DELETE /resources/:id`
- [x] Auto-create resources from event attachments (Docuseal PDFs, image attachments) — thin layer on top of existing pipeline
- [x] Image OCR adapter: Tesseract WASM or vision model for image attachments

---

## Phase 6 — Frontier

Research-grade capabilities. High effort, unique differentiation.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 6.1 | Counterfactual / what-if simulation | High | 4.2, 5.2 |
| [x] | 6.2 | Topological knowledge gap detection (TDA) | High | 2.1, 4.3 |

---

### 6.1 Counterfactual Simulation

- [x] Counterfactual query parser: detect "what if", "if X had", "suppose", "had we" patterns in planner — new `counterfactual` intent with structured scenario extraction (entity, mutation, timeScope)
- [x] Fact mutation engine: clone relevant fact rows in memory (no DB write), apply delta or substitution — on-the-fly OLS coefficient estimation from `event_counts_daily`
- [x] Structural mode: re-evaluate causal rules from `causal_links` with mutated facts, flag shifted downstream events — BFS propagation through causal DAG up to 3 hops with decay
- [x] Probabilistic mode: sample N replications from causal lag distributions, return outcome distribution — 500-sample Monte Carlo with per-step Gaussian noise from residual variance
- [x] Response format: `[COUNTERFACTUAL scenario=... confidence=... affected_count=...]` block — clearly labeled as simulation, not evidence, with causal chain + affected entities + distribution percentiles

---

### 6.2 Topological Knowledge Gap Detection (TDA)

- [x] Graph export: serialize `entity_relations` as weighted adjacency matrix with Dijkstra shortest paths
- [x] TDA worker (pure TypeScript): compute H0/H1 persistence via Vietoris-Rips filtration — no external sidecar, 500-node cap with degree-based sampling
- [x] `topology_snapshots` table: `id`, `computed_at`, `h0_component_count`, `h1_loop_count`, `max_h0_persistence`, `persistence_pairs` (JSON), `gap_entity_ids` (JSON)
- [x] Migration 025 for `topology_snapshots`
- [x] Admin endpoint: `GET /admin/topology` — latest snapshot + gap entities with names

---

## Phase 7 — Predictive Intelligence

Transform Perception from a system that explains the past into one that forecasts the future. Grounded predictions with calibrated confidence, continuous scoring, and self-improving accuracy. Inspired by superforecaster methodology (Tetlock), Bayesian Linguistic Forecasting (Murphy et al., 2026), and conformal prediction theory.

**Architecture principle:** Predictions are hypotheses with explicit uncertainty bounds, not assertions. Every forecast carries provenance, a resolution criterion, and a calibration-aware confidence score. The system improves by scoring itself honestly.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 7.1 | Forecast question engine | Medium | 5.1 |
| [x] | 7.2 | Bayesian belief state forecaster | High | 7.1, 4.1, 4.2 |
| [x] | 7.3 | Automated resolution oracle | Medium | 7.1 |
| [x] | 7.4 | Calibration and scoring system | Medium | 7.2, 7.3 |
| [x] | 7.5 | Conformal prediction intervals | Medium | 4.1, 7.4 |
| [x] | 7.6 | Ensemble aggregation with track-record weighting | High | 7.2, 7.4 |

---

### 7.1 Forecast Question Engine

Automatically generates well-formed forecasting questions from observed patterns, anomalies, and causal signals — then tracks them to resolution.

- [x] `forecasts` table: `id`, `question` (text), `question_type` (binary | numeric | date), `resolution_criteria` (text), `resolution_source` (JSON — lane + query to check), `base_rate` (float, nullable), `created_at`, `resolves_at`, `resolved_at`, `resolution_value` (float, nullable), `status` (open | resolved | voided | expired)
- [x] Migration for `forecasts`
- [x] Question generator worker (daily): scan recent change points (4.1), causal links (4.2), anomaly notifications (2.2), and concept drift alerts (4.4) — produce 3-10 candidate questions per day
- [x] Question quality gate: LLM critic pass (Haiku) — reject ambiguous, unfalsifiable, or tautological questions; require clear resolution criteria and a bounded time horizon
- [x] Reference class lookup: for each question, query historical events with similar entity/provider/pattern to compute empirical base rate
- [x] Question decomposition: for composite questions, use multi-agent decomposition (5.1) to split into sub-forecasts with independent resolution
- [x] User-created forecasts: `POST /forecasts` endpoint — users can pose their own questions; system validates resolution criteria feasibility
- [x] Admin UI: forecast dashboard with open questions, resolution timeline, and base rate context

Question types and examples:
| Type | Example | Resolution |
|------|---------|------------|
| Binary | "Will client X resume activity within 14 days?" | Event count > 0 in window |
| Numeric | "How many support tickets will provider Y generate next week?" | SQL count at resolves_at |
| Date | "When will the next change point occur for entity Z?" | BOCPD detection timestamp |

---

### 7.2 Bayesian Belief State Forecaster

Iterative agentic forecasting loop inspired by BLF (Murphy et al., 2026). Maintains a structured belief state that updates as new evidence arrives — not a one-shot prediction.

- [x] `forecast_beliefs` table: `id`, `forecast_id`, `step` (int), `probability` (float), `confidence` (low | medium | high), `evidence_for` (text), `evidence_against` (text), `open_questions` (text), `update_reasoning` (text), `created_at`
- [x] Migration 024 for `forecast_beliefs`
- [x] Initial belief: seed with base rate from 7.1 reference class lookup; if no base rate available, start at 0.5 (maximum entropy prior)
- [x] Belief update loop (triggered on relevant new events):
  1. Retrieve new evidence since last update (events, change points, causal links scoped to forecast entities)
  2. Present current belief state + new evidence to LLM
  3. LLM outputs updated belief state (structured JSON: `{p, confidence, evidence_for, evidence_against, open_questions, update_reasoning}`)
  4. Validate: probability clamped to ±0.3 max delta per step; probability bounded [0,1]
  5. Store new belief step; cap at 20 steps per forecast
- [x] Superforecaster prompting: system prompt encodes Tetlock's methodology — outside view first (base rate), then inside view (specific evidence), granular probability updates, consider both sides
- [x] Active information seeking: if belief confidence is "low" after 3 steps, trigger wide search across related entities for disconfirming evidence
- [x] Belief worker (6h interval): processes up to 10 forecasts per run with 2s delay between LLM calls

---

### 7.3 Automated Resolution Oracle

Resolves forecasts programmatically when their time horizon expires — no manual intervention for well-defined questions.

- [x] Resolution engine worker (hourly): scan forecasts where `resolves_at <= now()` and `status = 'open'`
- [x] Resolution strategies by question type:
  - **Binary**: execute `resolution_source` query (SQL count, entity existence check, event pattern match) → resolve yes (1.0) if condition met, no (0.0) otherwise
  - **Numeric**: execute `resolution_source` query → store actual value as `resolution_value`
  - **Date**: check if target event occurred → store actual timestamp or mark unresolved if window expired
- [x] Ambiguity handling: if resolution query returns inconclusive results, expire forecast rather than auto-resolving
- [x] `forecast_resolutions` table: `id`, `forecast_id`, `resolution_method` (auto | manual | voided), `raw_evidence` (JSON — query results that determined outcome), `resolved_by` (system | user_id), `resolved_at`
- [x] Migration 023 for `forecast_resolutions`
- [x] Manual override: `PATCH /forecasts/:id/resolve` — user can resolve, void, or extend; all manual actions recorded in audit trail
- [x] Audit trail: resolution evidence stored verbatim — `GET /forecasts/:id/resolution` endpoint

---

### 7.4 Calibration and Scoring System

Measures how well Perception's confidence maps to reality. A 70% prediction should come true ~70% of the time.

- [x] `calibration_snapshots` table: `id`, `computed_at`, `bin_edges` (JSON — probability bins), `bin_counts` (JSON — forecasts per bin), `bin_actuals` (JSON — fraction resolved true per bin), `brier_score` (float), `log_score` (float), `resolution_score` (float), `reliability_score` (float), `sharpness_score` (float)
- [x] Migration for `calibration_snapshots`
- [x] Brier score computation: `BS = (1/N) * sum((p_i - o_i)^2)` where p_i = predicted probability, o_i = actual outcome (0 or 1)
- [x] Brier decomposition: separate into reliability (calibration error), resolution (discrimination power), and uncertainty (base rate variance) — diagnose *why* score is good or bad
- [x] Log score (information gain): `LS = (1/N) * sum(o_i * log(p_i) + (1-o_i) * log(1-p_i))` — heavily penalizes confident wrong predictions
- [x] Calibration worker (weekly + after every 20 resolutions): recompute scores, generate reliability diagram data
- [x] Isotonic regression recalibration: fit PAV (pool-adjacent-violators) on resolved forecasts; apply monotonic correction to future raw probabilities
- [x] Per-domain calibration: separate scores by entity type, provider, question type — identify blind spots (e.g., "well-calibrated on client activity, overconfident on infrastructure")
- [x] Reliability diagram endpoint: `GET /forecasts/calibration` — returns bin data for frontend plotting
- [x] Admin UI: calibration dashboard with reliability diagram, Brier score trend, per-domain breakdown, and sharpness histogram
- [x] Degradation alert: if Brier score increases >0.05 over rolling 50-forecast window → notification

---

### 7.5 Conformal Prediction Intervals

Distribution-free uncertainty quantification. Wraps point forecasts in prediction intervals with guaranteed coverage — no distributional assumptions required.

- [x] Conformal calibration set: maintain rolling window of last 200 resolved numeric forecasts with their nonconformity scores (`|actual - predicted|`)
- [x] Coverage target: 90% marginal coverage (configurable per question type)
- [x] Split conformal method: compute quantile of calibration residuals at level `ceil((n+1)(1-alpha))/n` — yields prediction interval `[p - q, p + q]`
- [x] Adaptive conformal (ACI): for non-stationary streams, use exponentially weighted quantile that adapts coverage when distribution shifts (connects to BOCPD change points from 4.1)
- [x] `forecast_intervals` table: `id`, `forecast_id`, `belief_step`, `lower_bound` (float), `upper_bound` (float), `coverage_target` (float), `nonconformity_score` (float, post-resolution)
- [x] Migration for `forecast_intervals`
- [x] Coverage monitoring: track empirical coverage rate; if it drifts below target → widen intervals automatically (no manual tuning)
- [x] Surface intervals in forecast UI: show prediction as range, not point — "between 3 and 8 tickets (90% coverage)"
- [x] Binary forecast equivalent: for binary questions, conformal set = `{yes}`, `{no}`, or `{yes, no}` (uncertain) — honest expression of ignorance when evidence is insufficient

---

### 7.6 Ensemble Aggregation with Track-Record Weighting

Multiple forecasting strategies compete. The best-calibrated strategies earn more weight over time — evolutionary pressure toward accuracy.

- [x] `forecast_strategies` table: `id`, `name`, `description`, `strategy_type` (base_rate | causal | pattern | llm_belief | human), `is_active`, `created_at`
- [x] Migration for `forecast_strategies`
- [x] Built-in strategy roster:
  - **Base rate**: pure reference class frequency (no reasoning, just historical rate)
  - **Causal**: Granger links (4.2) + BOCPD signals (4.1) → extrapolate from causal structure
  - **Pattern**: entity narrative (3.2) + community context (3.1) → LLM pattern matching
  - **Full belief**: complete BLF loop from 7.2 (most expensive, most capable)
  - **Human**: user-submitted probability (optional — for comparison)
- [x] `strategy_forecasts` table: `id`, `forecast_id`, `strategy_id`, `probability` (float), `created_at`
- [x] Migration for `strategy_forecasts`
- [x] Per-strategy Brier score tracking: each strategy scored independently on resolved forecasts
- [x] Logit-space aggregation: final probability = `sigmoid(sum(w_i * logit(p_i)))` where w_i = inverse-Brier weight per strategy, normalized
- [x] Shrinkage parameter: when strategies disagree strongly (logit variance > threshold), apply shrinkage toward base rate — reduces overconfidence under uncertainty
- [x] Track-record weight updater (after each resolution): Bayesian update on strategy weights using log-likelihood of observed outcome given strategy's prediction
- [x] Strategy exploration: 10% of forecasts use uniform weights (exploration) to prevent premature convergence on a dominant strategy
- [x] Cold-start: new strategies begin with uniform prior weight; earn differentiated weight only after 30+ scored predictions
- [x] Admin UI: strategy leaderboard — Brier score, weight, forecast count, calibration curve per strategy
- [x] Retire underperformers: if a strategy's rolling Brier score exceeds 0.35 over 50+ forecasts → auto-deactivate, log reason

---

## Phase 8 — Multi-Tenancy & User Management

Workspace separation, proper auth, and team-based data isolation. Every business table gets a `workspace_id`. Auth moves from a shared password to Better Auth with organizations, roles, and invitations.

**Architecture principle:** Row-level isolation with `workspace_id` on all business tables. Auth as a gateway, not an afterthought. Existing data migrates to a default workspace. Single-workspace mode stays functional throughout.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [x] | 8.1 | Better Auth + organization plugin | High | — |
| [x] | 8.2 | Database migration: workspace_id on all tables | High | 8.1 |
| [x] | 8.3 | Scoped DB query wrapper | Medium | 8.2 |
| [x] | 8.4 | Workspace-aware API middleware + route updates | High | 8.1, 8.3 |
| [x] | 8.5 | Workspace-scoped ingest pipeline | Medium | 8.2 |
| [x] | 8.6 | Worker workspace iteration helper | Medium | 8.2 |
| [x] | 8.7 | SvelteKit auth client + workspace routing | High | 8.1 |
| [ ] | 8.8 | Deep workspace scoping in all SQL queries | Very High | 8.4 |
| [ ] | 8.9 | Worker per-workspace execution | High | 8.6, 8.8 |
| [ ] | 8.10 | Team roles & permissions enforcement | Medium | 8.1 |
| [ ] | 8.11 | Workspace admin UI (members, invites, settings) | Medium | 8.7, 8.10 |

---

### 8.1 Better Auth + Organization Plugin

- [x] Install `better-auth` with Kysely + libSQL dialect
- [x] Configure email/password auth, session management, cookie cache
- [x] Enable organization plugin with owner/admin/member roles
- [x] Mount Better Auth handler on Hono at `/auth/*`
- [x] Bootstrap default workspace on first startup
- [x] Migrate existing users to Better Auth's `user` table + default org membership

---

### 8.2 Database Migration: workspace_id on All Tables

- [x] Migration 030: add `workspace_id TEXT NOT NULL DEFAULT 'default'` to all 40+ business tables
- [x] Composite indexes with `workspace_id` as leftmost column on high-traffic tables
- [x] Default workspace bootstrap: create organization, backfill all rows with org ID

---

### 8.3 Scoped DB Query Wrapper

- [x] `scopedDb(workspaceId)` wrapper in `apps/api/src/db/scoped.ts`
- [x] `WORKSPACE_TABLES` set listing all tenant-scoped tables
- [x] `getActiveWorkspaceIds()` and `forEachWorkspace()` helpers for workers

---

### 8.4 Workspace-Aware API Middleware + Route Updates

- [x] `requireWorkspace(c)` middleware: extracts session → active org → workspace context
- [x] `requireAdmin(c)` middleware: same + role check for owner/admin
- [x] Replace `requireSession` with `requireWorkspace` across all 14 route files
- [x] Workspace context (`workspaceId`, `userId`, `role`) available in every route handler

---

### 8.5 Workspace-Scoped Ingest Pipeline

- [x] Workspace resolution for webhooks: `X-Perception-Workspace` header → query param → app_settings → first org
- [x] `processIngestEvent` accepts `workspaceId` parameter
- [x] Events and dynamic_facts INSERTs include `workspace_id`
- [x] Ingest rejections include `workspace_id`

---

### 8.6 Worker Workspace Iteration Helper

- [x] `getActiveWorkspaceIds()`: lists all organizations
- [x] `getDefaultWorkspaceId()`: resolves default workspace
- [x] `forEachWorkspace(fn)`: iterates over all workspaces for worker execution

---

### 8.7 SvelteKit Auth Client + Workspace Routing

- [x] Better Auth Svelte client with organization plugin
- [x] Auth store: session check via Better Auth → fallback to legacy → workspace loading
- [x] Workspace switcher state: `switchWorkspace()` calls `setActive()`
- [x] Login page: email/password sign-in + sign-up (replaces shared password)
- [x] Layout: logout via Better Auth `signOut()`
- [x] Workspaces API endpoints in client API layer

---

### 8.8 Deep Workspace Scoping in All SQL Queries

Every SQL query that reads or writes business data must include `WHERE workspace_id = ?`. This is the largest remaining task — ~60+ files with raw SQL.

- [ ] Events query module: all WHERE clauses include workspace_id
- [ ] Chat retrieval lanes: vector, FTS, SQL, entity, concept, stats, community, narrative, memory, resource, text-to-sql, causal — all scoped
- [ ] Entity resolver: scoped entity lookup and creation
- [ ] Ontology labels: scoped concept lookup
- [ ] Stats computation: scoped aggregation
- [ ] Forecast system: all queries scoped
- [ ] Notification generation: scoped anomaly evaluation

---

### 8.9 Worker Per-Workspace Execution

- [ ] Each worker wraps its `run()` in `forEachWorkspace()` loop
- [ ] Embedding worker: process events per workspace
- [ ] Community/narrative workers: detect and summarize per workspace
- [ ] BOCPD/Granger/TDA workers: compute per workspace
- [ ] Forecast workers: generate/resolve/calibrate per workspace

---

### 8.10 Team Roles & Permissions Enforcement

- [ ] `owner`: full access + workspace settings + member management
- [ ] `admin`: read/write + approve proposals + manage forecasts
- [ ] `member`: read/write + chat (no destructive operations)
- [ ] Role checks on: delete events, approve proposals, manage workspace settings, invite members
- [ ] Superadmin concept for cross-workspace operations

---

### 8.11 Workspace Admin UI

- [ ] Workspace settings page: name, slug, webhook keys
- [ ] Member list with role badges and remove/change-role actions
- [ ] Invitation form: email + role → Better Auth invitation flow
- [ ] Workspace switcher dropdown in sidebar
- [ ] Workspace creation flow for new teams

---

## Phase 9 — Hardening & Production Readiness

The system grew fast through 8 phases. Before expanding the surface area, make what exists reliable, observable, and testable. No new features — just trust.

**Architecture principle:** A prediction engine nobody can debug is a liability, not a feature. Hardening is the difference between a prototype and a product.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [ ] | 9.1 | Worker lifecycle manager | Medium | — |
| [ ] | 9.2 | Structured logging & observability | Medium | 9.1 |
| [ ] | 9.3 | Math module test suite | High | — |
| [ ] | 9.4 | Retrieval & integration test suite | Medium | 5.3 |
| [ ] | 9.5 | Automated backup & recovery | Medium | — |
| [ ] | 9.6 | Graceful shutdown & startup ordering | Low | 9.1 |
| [ ] | 9.7 | CI pipeline & quality gate | Medium | 9.3, 9.4 |

---

### 9.1 Worker Lifecycle Manager

10+ background workers (BOCPD, Granger, communities, narratives, beliefs, resolution, calibration, TDA, drift, digests, embedding, eval, bandit, resource embedding) run as intervals with no coordination or health tracking.

- [ ] `worker_heartbeats` table: `worker_name`, `last_beat_at`, `status` (running | idle | failed), `last_error`, `run_count`, `avg_duration_ms`
- [ ] Migration for `worker_heartbeats`
- [ ] Worker registry: central `WorkerManager` class — registers all workers with name, interval, handler, and timeout
- [ ] Heartbeat protocol: each worker updates its row on start, completion, and failure — includes duration and error if any
- [ ] Dead worker detection: if `last_beat_at` older than 3x interval → notification with `type = 'worker_stall'`
- [ ] Admin endpoint: `GET /admin/workers` — list all registered workers with status, last run, next scheduled, error count
- [ ] Admin UI: worker health dashboard on settings page — status badges, last error preview, manual trigger button

---

### 9.2 Structured Logging & Observability

Replace `console.log` scatter with structured, queryable logs.

- [ ] Structured logger: thin wrapper producing JSON lines — `{ ts, level, worker, msg, duration_ms, error?, meta? }`
- [ ] Log levels: `debug`, `info`, `warn`, `error` — configurable per worker via env
- [ ] Request logging middleware: Hono middleware logging `method`, `path`, `status`, `duration_ms` per request
- [ ] Worker run logging: automatic log entry on worker start, completion (with duration), and failure (with error)
- [ ] Metrics endpoint: `GET /admin/metrics` — worker run counts, error rates, p50/p95 durations, active sessions, event ingest rate, embedding queue depth
- [ ] Log rotation: daily rotation with configurable retention (default 14 days) when writing to file

---

### 9.3 Math Module Test Suite

Pure math modules (BOCPD, Granger, conformal, Brier, ADWIN, Louvain, TDA, VAR) are the most testable and most dangerous to get wrong.

- [ ] BOCPD tests: known change point sequences (step function, ramp, plateau) — verify detection within 3 observations of true change point
- [ ] Granger causality tests: synthetic VAR(1) with known coefficients — verify recovered lag, direction, and F-statistic bounds
- [ ] Conformal prediction tests: verify empirical coverage on synthetic calibration set matches target (90% ± 3% over 500 samples)
- [ ] Brier score tests: perfect calibration (score = 0), random calibration (score ≈ 0.25), adversarial overconfidence — verify decomposition sums
- [ ] ADWIN tests: stationary stream (no drift), abrupt shift, gradual drift — verify detection timing and false positive rate
- [ ] Louvain community detection tests: known community structure (planted partition model) — verify modularity and membership
- [ ] TDA/persistence tests: known topology (circle = 1 H1 feature, two clusters = 2 H0 features) — verify persistence pairs
- [ ] VAR fitting tests: OLS normal equations on small known matrices — verify coefficient recovery to 1e-6 tolerance
- [ ] Property-based tests: BOCPD probability sums to 1.0 at each step, Brier score bounded [0, 1], conformal intervals monotonically widen with lower alpha

---

### 9.4 Retrieval & Integration Test Suite

End-to-end retrieval quality beyond the existing eval harness — focused on lane interaction and edge cases.

- [ ] Fixture dataset: 50+ synthetic events covering all provider types, entity configurations, and edge cases (empty facts, multi-entity, degraded quality)
- [ ] Lane isolation tests: verify each lane (vector, FTS, SQL, entity, concept, stats, community, narrative, memory, resource, text-to-sql, causal) returns expected results independently
- [ ] Lane merge tests: verify deduplication, score combination, and context budget enforcement across lanes
- [ ] Intent routing tests: verify planner maps queries to correct intents and lane weight overrides
- [ ] Corrective RAG tests: verify re-plan triggers on sparse context and improves coverage
- [ ] Chat mode tests: verify `full` / `history` / `light` mode classification on 30+ query examples
- [ ] Regression snapshots: store retrieval outputs as snapshots — diff against baseline on changes

---

### 9.5 Automated Backup & Recovery

libSQL on a single node with no backup is one disk failure from total loss.

- [ ] Scheduled backup: daily SQLite `.backup` command to timestamped file in configurable backup directory
- [ ] Backup rotation: keep last 7 daily + 4 weekly backups — prune older automatically
- [ ] Backup verification: after each backup, open the copy and run `PRAGMA integrity_check` — alert on failure
- [ ] Recovery documentation: step-by-step restore procedure in `docs/ops/backup-recovery.md`
- [ ] Offsite sync: optional rsync/rclone to remote storage (S3-compatible or SSH target) — configurable via env
- [ ] Backup status endpoint: `GET /admin/backup` — last backup time, size, integrity status
- [ ] Startup integrity check: `PRAGMA integrity_check` on boot — warn in logs if database is damaged

---

### 9.6 Graceful Shutdown & Startup Ordering

Bun process with 10+ interval workers needs clean shutdown to avoid data corruption and orphaned state.

- [ ] Signal handlers: `SIGTERM` and `SIGINT` trigger orderly shutdown — stop accepting new requests, drain in-flight workers
- [ ] Worker drain: each registered worker gets a `stop()` signal — current run completes, no new runs start
- [ ] Shutdown timeout: if workers don't complete within 30s, force exit with error log
- [ ] Startup ordering: migrations run first, then embedding workers, then compute workers (BOCPD/Granger depend on embeddings existing), then HTTP server
- [ ] Health endpoint semantics: `GET /health` returns 503 during shutdown drain — allows load balancer to stop routing

---

### 9.7 CI Pipeline & Quality Gate

Automated quality checks that prevent regression.

- [ ] GitHub Actions workflow: `typecheck` → `lint` → `test` → `build` on every push and PR
- [ ] Fix lint setup: install `prettier-plugin-svelte`, resolve existing lint errors so pipeline starts green
- [ ] Test coverage reporting: track coverage percentage, fail if math modules drop below 80%
- [ ] Build verification: both API and client Docker images build successfully
- [ ] Eval regression gate: run eval harness in CI with fixture dataset — fail if precision@5 drops >5% vs baseline
- [ ] Branch protection: require CI pass before merge to main

---

## Phase 10 — Entity Resolution & Adaptive Ontology

Deepen entity resolution from exact matching to fuzzy resolution, and move from hardcoded type enums to capability-based classification. Makes Perception truly provider-agnostic and self-improving.

**Architecture principle:** Bad merges are worse than duplicates. Duplicates are annoying; bad merges poison answers. Conservative matching with user review beats aggressive auto-merging.

| Status | # | Task | Effort | Depends On |
|--------|---|------|--------|------------|
| [ ] | 10.1 | Fuzzy entity resolver | High | — |
| [ ] | 10.2 | Entity merge/split operations | Medium | 10.1 |
| [ ] | 10.3 | Entity review queue | Medium | 10.1, 10.2 |
| [ ] | 10.4 | Capability-based ontology migration | High | — |
| [ ] | 10.5 | Ontology inference worker | High | 10.4 |
| [ ] | 10.6 | Cross-provider entity linking | Medium | 10.1, 10.4 |

---

### 10.1 Fuzzy Entity Resolver

Move beyond exact name/ID matching to similarity-based entity linking with confidence scoring.

- [ ] Blocking strategy: group candidate pairs by shared capability, provider, or first 3 characters of normalized name — avoid O(n²) all-pairs comparison
- [ ] String similarity scoring: Jaro-Winkler distance (best for names) with configurable threshold (default 0.88)
- [ ] Domain similarity: extract email domains and website domains — same domain + compatible capabilities = high confidence link
- [ ] Multi-signal scoring: weighted combination of name similarity (0.4), domain match (0.3), shared event co-occurrence (0.2), capability overlap (0.1) → single confidence score
- [ ] `entity_merge_candidates` table: `id`, `entity_a_id`, `entity_b_id`, `confidence`, `signals` (JSON — which signals contributed), `status` (pending | confirmed | rejected), `created_at`, `resolved_at`
- [ ] Migration for `entity_merge_candidates`
- [ ] Candidate generation worker (daily): scan new entities since last run, generate candidates above 0.70 threshold
- [ ] Auto-merge gate: only auto-merge when confidence >= 0.95 AND no conflicting domains AND same capability set — everything else goes to review queue
- [ ] Negative signal tracking: conflicting domains, incompatible capabilities, different provider-scoped IDs for same provider → penalize or block merge

---

### 10.2 Entity Merge/Split Operations

Reversible entity manipulation with full audit trail.

- [ ] Merge operation: given two entity IDs, merge B into A — reassign all `event_entities`, `entity_relations`, `entity_aliases`, `entity_narratives` from B to A, mark B as `status = 'merged'` with pointer to A
- [ ] Split operation: given an entity ID and a set of event IDs, create new entity from subset — move specified `event_entities` and regenerate aliases from remaining events
- [ ] `entity_audit_log` table: `id`, `action` (merge | split | confirm | reject | rename), `primary_entity_id`, `secondary_entity_id`, `details` (JSON), `performed_by` (user | system), `performed_at`
- [ ] Migration for `entity_audit_log`
- [ ] Merge/split API: `POST /entities/:id/merge`, `POST /entities/:id/split` — require explicit confirmation payload
- [ ] Cascade updates: after merge/split, mark affected entity narratives as stale, recompute community membership, update causal links referencing merged entity
- [ ] Undo support: merge creates a reversible snapshot — `POST /entities/:id/undo-merge` restores from audit log within 7 days

---

### 10.3 Entity Review Queue

Human-in-the-loop interface for entity corrections — tentative matches, ambiguous merges, and confidence below threshold.

- [ ] Review queue API: `GET /entities/review` — paginated list of pending merge candidates, sorted by confidence descending
- [ ] Review actions: `POST /entities/review/:id/confirm`, `POST /entities/review/:id/reject` — both record decision in audit log
- [ ] Bulk operations: `POST /entities/review/bulk` — confirm or reject multiple candidates in one request
- [ ] Review UI page: `/entities/review` — side-by-side entity comparison cards showing name, aliases, provider sources, event count, capabilities, shared events, and confidence breakdown
- [ ] Decision feedback: confirmed merges become positive training examples for future candidate scoring; rejections become negative examples
- [ ] Review notifications: when review queue exceeds 20 pending items → notification with `type = 'entity_review_backlog'`
- [ ] Auto-escalation: candidates pending > 14 days without review → increase visibility in dashboard

---

### 10.4 Capability-Based Ontology Migration

Replace hardcoded `entity_type` string enums with a capability system grounded in `ontology_concepts`.

- [ ] `ontology_capabilities` table: `id`, `name` (unique slug like `commercial_account`, `document`, `person`), `description`, `parent_capability_id` (nullable — hierarchical), `is_primitive` (boolean), `created_at`
- [ ] Seed capability set: ~15 primitive capabilities covering current entity types — `organization`, `commercial_account`, `person`, `contact`, `document`, `financial_record`, `contract`, `project`, `service`, `repository`, `work_item`, `deployment`, `status`, `amount`, `deadline`
- [ ] `concept_capabilities` join table: `concept_id`, `capability_id` — many-to-many between ontology concepts and capabilities
- [ ] Migration for both tables + seed data
- [ ] Capability inheritance: `commercial_account` inherits from `organization` — capability checks walk the hierarchy
- [ ] Entity capability resolver: `entity.capabilities` derived from `type_concept → concept_capabilities → ontology_capabilities` chain
- [ ] Retrieval migration: replace all `entity_type === 'client'` checks with `entity.capabilities.includes('commercial_account')` throughout retrieval lanes
- [ ] Stats migration: update stats aggregation to group by capability instead of raw entity type
- [ ] Backward compatibility: keep `entity_type` column populated from primary capability for display purposes

---

### 10.5 Ontology Inference Worker

Automatically generate ontology concepts when Perception encounters unknown provider/event shapes — with structured proposals, confidence gates, and review integration.

- [ ] Unknown shape detector: trigger inference when — unknown provider+event_type pair, unknown subject type, new payload key hash, or repeated `degraded` events for same shape (5+ in 24h)
- [ ] `ontology_inference_jobs` table: `id`, `provider_type`, `event_type`, `subject_type`, `sample_count`, `sample_keys` (JSON), `sample_values` (JSON), `status` (pending | processing | completed | failed), `proposals` (JSON), `created_at`, `completed_at`
- [ ] Migration for `ontology_inference_jobs`
- [ ] Inference worker: for each pending job, call Haiku with structured output — produce concept proposals with `kind`, `label`, `description`, `capabilities[]`, and `confidence`
- [ ] Deduplication pass: before creating concepts, check existing ontology for label/capability overlap — prefer reuse over creation, create aliases when appropriate
- [ ] Confidence gates: `>= 0.92` → auto-confirm and use; `0.75–0.91` → tentative (use with lower rank, disclose uncertainty); `< 0.75` → draft only (store, don't use in retrieval or stats)
- [ ] Review integration: medium-confidence concepts and new primitive capabilities → queued for review (9.3)
- [ ] Concept promotion: concepts used in 20+ events without rejection → auto-promote from tentative to confirmed
- [ ] Admin UI: ontology explorer page — concept tree with capability inheritance, confidence indicators, and event count per concept

---

### 10.6 Cross-Provider Entity Linking

Link the same real-world entity across different SaaS providers when identifiers don't match.

- [ ] Provider identity signals: email domain (Charles → email → Docuseal), project/repo name similarity, shared human names in actor fields, temporal co-occurrence of events about same entity
- [ ] Cross-provider candidate generation: for each new entity, compare against entities from other providers using blocking by capability + one of the identity signals
- [ ] Link confidence model: weighted combination of domain match (strongest), name similarity, temporal proximity, and capability compatibility
- [ ] `entity_provider_links` table: `id`, `entity_id`, `provider_type`, `provider_entity_id`, `provider_name`, `link_confidence`, `link_method` (domain | name | temporal | manual), `confirmed`, `created_at`
- [ ] Migration for `entity_provider_links`
- [ ] Provider link enrichment: when entity is accessed, show all provider appearances — "This entity appears in Charles as 'Acme Corp', in Docuseal as 'ACME SAS', in email as 'acme.fr'"
- [ ] Retrieval expansion: when an entity is identified in a query, automatically include events from linked provider entities — weighted by link confidence

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
                                          │
Phase 7 (Predictive)                      │
  7.1 Forecast question engine ──────(5.1)
  7.2 Bayesian belief forecaster ─(7.1,4.1,4.2)
  7.3 Resolution oracle ─────────────(7.1)
  7.4 Calibration & scoring ─────(7.2,7.3)
  7.5 Conformal intervals ───────(4.1,7.4)
  7.6 Ensemble aggregation ──────(7.2,7.4)
                                          │
Phase 8 (Multi-Tenancy)                    │
  8.1 Better Auth + org plugin ─────────────┤
  8.2 workspace_id migration ──────────(8.1)│
  8.3 Scoped DB wrapper ──────────────(8.2)│
  8.4 Route middleware ────────────(8.1,8.3)│
  8.5 Workspace-scoped ingest ─────────(8.2)│
  8.6 Worker workspace helper ─────────(8.2)│
  8.7 SvelteKit auth client ───────────(8.1)│
  8.8 Deep SQL scoping ───────────────(8.4)│
  8.9 Worker per-ws execution ────(8.6,8.8)│
  8.10 Roles & permissions ────────────(8.1)│
  8.11 Workspace admin UI ──────(8.7,8.10)
                                          │
Phase 9 (Hardening)                       │
  9.1 Worker lifecycle manager ───────────┤
  9.2 Structured logging ────────────(9.1)│
  9.3 Math test suite ────────────────────┤
  9.4 Retrieval test suite ──────────(5.3)│
  9.5 Automated backup ──────────────────-┤
  9.6 Graceful shutdown ─────────────(9.1)│
  9.7 CI pipeline ───────────────(9.3,9.4)
                                          │
Phase 10 (Entity Resolution)              │
  10.1 Fuzzy entity resolver ─────────────┤
  10.2 Entity merge/split ──────────(10.1)│
  10.3 Entity review queue ───(10.1,10.2)│
  10.4 Capability ontology migration ─────┤
  10.5 Ontology inference worker ───(10.4)│
  10.6 Cross-provider linking ─(10.1,10.4)
```

---

## Execution Notes

**Parallelism within phases:** Tasks within the same phase that don't share dependencies can be built concurrently. Phase 1 is almost entirely parallelizable (1.1-1.5 are independent). Phase 4 tasks are independent of Phase 3 — they can run in parallel once Phase 2 ships.

**Incremental value:** Every task ships independently. No big-bang phase gates. Ship 1.1 alone and retrieval improves the same day.

**Math tasks (Phase 4) can start early:** 4.1 (BOCPD) and 4.4 (concept drift) have no dependencies on Phases 2-3. They can be built as soon as Phase 1 ships, in parallel with Phase 2 work. 4.3 (graph entropy) needs 2.1 only.

**Phase 7 internal parallelism:** 7.1 (question engine) and 7.3 (resolution oracle) can be built together — resolution is the other end of the question lifecycle. 7.5 (conformal) and 7.6 (ensemble) both need 7.4 but are independent of each other. The critical path is: 7.1 → 7.2 → 7.4 → (7.5 | 7.6). The system produces value at 7.1 alone (structured forecast tracking), becomes predictive at 7.2, and becomes *trustworthy* at 7.4+.

**Phase 8 ships incrementally:** 8.1-8.7 (auth + migration + middleware) are the foundation — shipped as a single commit. 8.8 (deep SQL scoping) is the largest remaining task (~60+ files). 8.9-8.11 (workers, roles, admin UI) follow once scoping is complete. The system works in single-workspace mode immediately.

**Phase 9 is almost fully parallelizable:** 9.1 (worker manager) gates 9.2 (logging) and 9.6 (shutdown), but 9.3 (math tests), 9.4 (retrieval tests), and 9.5 (backup) are independent of each other and can run in parallel from day one. 9.7 (CI) gates on tests being written first. Critical path: (9.1 | 9.3 | 9.4 | 9.5) → 9.7.

**Phase 10 has two independent tracks:** 10.1-10.3 (fuzzy resolution + review) and 10.4-10.5 (capability ontology + inference) can be built in parallel. 10.6 (cross-provider linking) needs both tracks. The entity track is user-facing immediately (review queue drives quality); the ontology track is infrastructure that pays off when new providers appear.

**Token cost profile:**
- Phase 1: minimal (embedding input change is free, intent classification uses existing Haiku call)
- Phase 2: one additional Haiku call for corrective re-plan, only when triggered
- Phase 3: community/narrative generation = batch Haiku calls nightly, not per-query
- Phase 4: zero LLM cost (pure math)
- Phase 5: Text-to-SQL adds one Haiku call per qualifying query; multi-agent fans out existing pipeline
- Phase 6: counterfactual uses existing Granger data, minimal new LLM cost
- Phase 7: belief updates = 1 Haiku call per step (capped at 20/forecast); question generation = daily batch; calibration/conformal = pure math; ensemble = pure math. Heaviest cost is 7.2 belief loop but amortized over forecast lifetime (days/weeks), not per-query
- Phase 8: zero LLM cost (auth, migration, middleware — pure infrastructure)
- Phase 9: zero LLM cost (infrastructure, tests, logging)
- Phase 10: ontology inference = 1 Haiku call per unknown shape (rare after initial learning); fuzzy matching and capability resolution = pure computation

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
- BLF — Murphy et al. (arXiv 2604.18576, 2026): agentic forecasting via sequential Bayesian updating of linguistic beliefs; matches superforecasters on ForecastBench
- Superforecasting — Tetlock (2015): outside view, base rates, reference class forecasting, granular Bayesian updates, question decomposition
- Conformal Prediction for Time Series — arXiv 2509.02844 (NeurIPS 2025): distribution-free coverage guarantees under change points via CPTC algorithm
- Adaptive Conformal Anomaly Detection — ICLR 2026: weighted quantile conformal bounds with adaptive parameter learning from foundation model predictions
- Automated Forecasting Question Generation — arXiv 2601.22444 (2026): LLM-powered pipeline achieving 96% verifiable question rate, 95% resolution accuracy
- Wisdom of the Silicon Crowd — Science Advances (2024): LLM ensemble forecasting rivals human crowd accuracy via median/mean aggregation
- ForecastBench — forecastbench.org (2025): LLMs improving 0.020 Brier/year, parity with non-expert humans projected June 2026
- Brier Score Decomposition — reliability + resolution + uncertainty; diagnostic for calibration vs. discrimination
- Isotonic Regression / PAV — PNAS (2021): CORP reliability diagrams with finite-sample optimality guarantees
- Platt Scaling with Hierarchical Priors — BLF (2026): per-source intercept offsets avoiding over-shrinkage on skewed base rates
- Reference Class Forecasting — Kahneman & Tversky; Flyvbjerg (2006): anchor on base rates before adjusting with case-specific evidence
