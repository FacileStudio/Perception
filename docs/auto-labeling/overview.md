# Auto-Labeling Overview

Parent: [[../auto-labeling]]
Related: [[ontology]], [[workflow]], [[confidence-review]], [[retrieval-integration]], [[references]]

## Goal

Perception should adapt to unknown providers without requiring a new hardcoded enum every time a source invents a different word for the same business object.

Auto-labeling means:

- infer semantic labels from observed data
- store labels as ontology concepts
- attach stable capabilities
- assign confidence
- reuse existing concepts when possible
- require review for risky changes

It does **not** mean letting an LLM invent production semantics and blindly trusting them. That path has charts, confidence scores, and sadness.

## Architecture

Use three layers:

1. **Raw observations**: what the source said.
2. **Generated concepts**: what Perception thinks it means.
3. **Stable capabilities**: how code decides behavior.

Example:

```json
{
  "label": "customer_company",
  "kind": "entity_type",
  "capabilities": ["organization", "commercial_account"],
  "confidence": 0.91
}
```

The label can change or be aliased. The capabilities are the stable bridge into retrieval, stats, and entity resolution.

## Why Hybrid Wins

| Option | Adaptability | Reliability | Debuggability | Verdict |
|---|---:|---:|---:|---|
| Full hardcoded labels | Low | High | High | Fine MVP, rigid later |
| Full auto-labeling | High | Low | Low | Research toy with production teeth |
| Auto-labeling + hardcoded fallbacks | High | High | Medium/high | Best fit |

## Implementation Rule

Code should avoid checks like:

```ts
entity.type === "client"
```

Prefer capability checks:

```ts
entity.capabilities.includes("commercial_account")
```

Labels are for meaning and display. Capabilities are for behavior.
