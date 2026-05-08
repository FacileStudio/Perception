# Retrieval and Entity Resolver Overview

Parent: [[../retrieval-and-entity-resolver]]
Related: [[retrieval]], [[entity-resolver]], [[phases]], [[../auto-labeling/overview]]

Retrieval answers: which evidence should Claude see?

Entity resolution answers: which real-world thing is this event about?

Perception needs both. Retrieval without entities depends on spelling. Entity resolution without retrieval is a tidy graph nobody uses.

## Target Flow

```text
message
  -> planner
  -> entity mention extraction
  -> canonical entity lookup
  -> retrieval lanes
  -> merge/rank/dedupe
  -> context budget
  -> grounded answer
```

Retrieval lanes:

- entity
- SQL facts
- stats
- FTS
- vector

Entity resolution should reuse [[../auto-labeling/ontology]] concepts and capabilities.
