# Auto-Labeling Evaluation

Parent: [[../auto-labeling]]
Related: [[workflow]], [[confidence-review]], [[retrieval-integration]], [[references]]

## Required Eval Sets

Create fixture datasets for:

- first-seen provider shape
- repeated provider shape
- schema drift
- duplicate labels
- same name, different entity
- same entity, different provider labels
- tentative relation
- rejected concept

## Metrics

Ontology metrics:

- concept reuse rate
- duplicate concept rate
- bad merge rate
- correct capability rate
- review queue precision
- schema drift detection rate

Retrieval metrics:

- `hit_at_5`
- `hit_at_10`
- wrong-source rate
- context precision
- context recall
- answer faithfulness
- empty-context rate

Operational metrics:

- inference latency
- inference cost
- number of degraded events waiting for inference
- review backlog
- concepts by state

## Acceptance Criteria

Before using auto-labels in normal retrieval:

- unknown data is ingested and searchable before inference completes
- high-confidence field-role inference maps obvious status/date/amount/name fields correctly
- concept reuse beats concept creation for known semantics
- medium-confidence relations stay tentative
- draft concepts do not power stats
- trace output explains concept creation/reuse

Before using auto-labels in stats:

- concept is confirmed, or
- stat explicitly allows high-confidence unconfirmed concepts, and
- eval fixture proves expected fields map correctly

## Manual Review Sampling

Sample for review:

- all new primitive capabilities
- all relation types under `0.92`
- top 10 most-used unconfirmed concepts weekly
- all conflicts with confirmed concepts
- all schema drift events for identity/status/date fields

Small review, high leverage. Do not build a giant ontology back office unless the system earns the pain.
