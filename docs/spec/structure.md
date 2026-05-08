# Project Structure

```text
Perception/
|-- apps/
|   |-- api/
|   |   |-- src/
|   |   |   |-- server.ts
|   |   |   |-- routes/
|   |   |   |   |-- ingest.ts
|   |   |   |   |-- chat.ts
|   |   |   |   |-- events.ts
|   |   |   |   |-- schemas.ts
|   |   |   |   `-- auth.ts
|   |   |   |-- db/
|   |   |   |   |-- client.ts
|   |   |   |   |-- migrations.ts
|   |   |   |   `-- schema.sql
|   |   |   |-- ingest/
|   |   |   |   |-- envelope.ts
|   |   |   |   |-- mapper.ts
|   |   |   |   `-- redact.ts
|   |   |   |-- schema-registry/
|   |   |   |   |-- lookup.ts
|   |   |   |   |-- infer.ts
|   |   |   |   `-- worker.ts
|   |   |   |-- embeddings/
|   |   |   |   |-- voyage.ts
|   |   |   |   |-- input.ts
|   |   |   |   `-- worker.ts
|   |   |   |-- chat/
|   |   |   |   |-- planner.ts
|   |   |   |   |-- retrieve.ts
|   |   |   |   |-- prompt.ts
|   |   |   |   `-- stream.ts
|   |   |   |-- stats/
|   |   |   |   |-- compute.ts
|   |   |   |   `-- snapshots.ts
|   |   |   |-- security/
|   |   |   |   |-- hmac.ts
|   |   |   |   |-- session.ts
|   |   |   |   `-- redact.ts
|   |   |   `-- types.ts
|   |   |-- tests/
|   |   `-- package.json
|   `-- client/
|       |-- src/
|       |-- static/
|       |-- package.json
|       |-- svelte.config.js
|       `-- vite.config.ts
|-- diagrams/
|-- spec/
|-- OVERVIEW.md
|-- COSTS.md
|-- SPEC.md
|-- package.json
`-- mise.toml
```

## Key modules

**`ingest/envelope.ts`** — Layer 1 extraction. Reads directly from `NookEventEnvelope` fields. No schema lookup. Pure deterministic mapping.

**`ingest/mapper.ts`** — Layer 2 extraction. Applies `InferredFieldMapping[]` from a resolved `ProviderSchema` to `payload.normalized`. Produces `dynamic_facts` row. Falls back to raw dump on missing schema.

**`ingest/redact.ts`** — Strips PII from payload before storage according to privacy flags on the envelope.

**`schema-registry/lookup.ts`** — Resolves `ProviderSchema` by `(provider_type, event_type)`. Handles wildcard fallback and drift detection.

**`schema-registry/infer.ts`** — Builds the inference prompt and calls Claude. Validates and normalizes the returned `InferredFieldMapping[]`. Never called on the hot ingest path.

**`schema-registry/worker.ts`** — Background worker that processes inference jobs and re-processes affected `dynamic_facts` rows after a schema is stored.

**`routes/schemas.ts`** — Admin API for listing, inspecting, and confirming provider schemas. The only surface where a human interacts with inferred schemas.
