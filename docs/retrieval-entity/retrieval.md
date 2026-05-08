# Retrieval

Parent: [[../retrieval-and-entity-resolver]]
Related: [[overview]], [[entity-resolver]], [[../auto-labeling/retrieval-integration]]

## Evaluation First

Create fixture questions with expected source IDs before tuning.

```ts
type RetrievalEvalCase = {
  id: string;
  question: string;
  expected_event_ids: string[];
  expected_entity_ids?: string[];
  required_lanes?: Array<"entity" | "sql" | "stats" | "fts" | "vector">;
  forbidden_event_ids?: string[];
};
```

Metrics:

- `hit_at_5`
- `hit_at_10`
- wrong-source rate
- empty-context rate
- lane contribution
- latency
- prompt context tokens

## Planner Intents

| Intent | Preferred lanes |
|---|---|
| `recent_activity` | SQL recent events, stats, FTS |
| `entity_timeline` | entity, SQL, vector |
| `open_items` | SQL, stats |
| `metric_summary` | stats, SQL |
| `incident_analysis` | SQL, entity, FTS |
| `semantic_search` | vector, FTS |
| `conversation_followup` | history only or narrowed retrieval |

## Ranking

```text
score =
  lane_weight
  + entity_match_boost
  + exact_term_boost
  + structured_fact_boost
  + quality_boost
  + recency_boost_when_requested
  + source_trust_boost
  - stale_penalty
  - duplicate_penalty
```

Rule: structured facts and confirmed entity matches outrank vector similarity for factual questions.

## Context Budget

Default:

- collect up to 40 candidates
- inject 5-8 evidence blocks
- include stats separately
- include entity summaries when available

## Trace Mode

Trace output should show planner intent, lanes, matched concepts, boosts, penalties, and final scores. Developer/admin only.
