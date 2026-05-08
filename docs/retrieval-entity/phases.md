# Implementation Phases

Parent: [[../retrieval-and-entity-resolver]]
Related: [[overview]], [[retrieval]], [[entity-resolver]]

## Phase 1: Measure Retrieval

Deliver:

- fixture event dataset
- eval case format
- retrieval test runner
- lane metrics
- trace output

Success:

- broad recency asks return recent events
- exact entity/provider/date asks find expected sources
- stats asks do not answer from fuzzy text alone

## Phase 2: Exact Entity Resolver

Deliver:

- `entities`
- `entity_aliases`
- `event_entities`
- deterministic normalizers
- exact alias matching
- entity retrieval lane

Success:

- provider IDs link consistently
- domains link consistently
- canonical entity queries pull events despite spelling differences

## Phase 3: Fuzzy Resolver

Deliver:

- same-capability candidate scoring
- confidence thresholds
- tentative links
- conflict detection

Success:

- obvious aliases merge
- risky matches remain tentative/separate
- cross-capability merges are blocked

## Phase 4: Relations

Deliver:

- `entity_relations`
- relation extraction from facts/concepts
- relation-aware retrieval expansion

Success:

- client/account questions pull related documents, tasks, emails, deployments, and services
- expansion is capped and traceable

## Phase 5: Summaries

Deliver:

- entity summaries
- source-backed summary records
- summary retrieval lane
- refresh policy

Success:

- common entity questions use fewer raw events
- answers distinguish current state from historical noise

## Phase 6: Review

Deliver:

- review queue
- merge/split/confirm/reject operations
- audit log

Success:

- bad matches can be corrected without DB surgery
- future ingests respect confirmed decisions
