# Retrieval Integration

Parent: [[../auto-labeling]]
Related: [[overview]], [[ontology]], [[workflow]], [[confidence-review]], [[../retrieval-entity/overview]]

## Rule

Retrieval should use capabilities and confidence, not raw generated labels.

Generated label:

```text
invoice_billed_to_organization
```

Retrieval meaning:

```text
financial_record related to organization through billing_relation
```

## Query Flow

```text
message
  -> planner
  -> mention extraction
  -> concept/capability lookup
  -> entity lookup
  -> relation expansion
  -> retrieval lanes
  -> confidence-aware ranking
  -> context budget
  -> grounded answer
```

## Ranking Signals

Boost:

- confirmed concept
- high-confidence generated concept
- exact entity match
- matching capability
- structured fact match
- source quality `complete`

Penalize:

- draft concept
- tentative relation when relation is central
- degraded source quality
- long relation chain
- conflicting capabilities

## Entity Graph Use

Entity graph retrieval should support:

- local questions: "What happened with Acme?"
- relational questions: "Which contracts belong to this client?"
- global questions: "Which clients need attention?"

For global questions, use summaries and relation groups rather than dumping raw events. This follows the GraphRAG lesson: broad sensemaking needs graph/community summaries, not just nearest-neighbor chunks.

## Context Budget

Default:

- collect up to 40 candidates
- rank and dedupe
- inject 5-8 evidence blocks
- include stats blocks separately
- include entity summaries when available

Evidence blocks must carry:

- source event IDs
- concept IDs
- confidence
- quality
- relation path when graph-expanded

## Trace Output

Every retrieval run should optionally expose:

```json
{
  "query_plan": {
    "intent": "entity_timeline",
    "capabilities": ["commercial_account"],
    "entities": ["entity_acme"],
    "lanes": ["entity", "sql", "fts", "vector"]
  },
  "candidates": [
    {
      "event_id": "evt_123",
      "lanes": ["entity", "sql"],
      "concepts": ["invoice", "payment_status"],
      "confidence": 0.91,
      "final_score": 1.24
    }
  ]
}
```

Trace mode is developer/admin only. Users need good answers, not the crime scene unless they ask.
