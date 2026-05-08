# Ingestion Pipeline

Endpoint: `POST /ingest`

## Flow

1. Read raw request body once.
2. Verify HMAC, timestamp, and event ID.
3. Parse `NookEventEnvelope`.
4. Reject duplicate event IDs idempotently.
5. Redact payload according to provider privacy rules.
6. Extract envelope fields (deterministic, no schema lookup).
7. Look up `provider_schemas` by `(provider_type, event_type_pattern)`.
   - **Schema found, confirmed**: apply field mappings → insert mapped JSON into `dynamic_facts` → `quality = "complete"`.
   - **Schema found, unconfirmed**: apply field mappings → insert mapped JSON into `dynamic_facts` → `quality = "partial"`.
   - **Schema found, needs_review**: apply existing mappings → insert mapped JSON into `dynamic_facts` → `quality = "partial"` → enqueue schema re-inference for new keys only.
   - **No schema**: dump raw `payload.normalized` into `dynamic_facts` → `quality = "degraded"` → enqueue full schema inference.
8. Insert `events`, fact row, FTS row, and pending `event_embeddings` row in one transaction.
9. Return `202 Accepted`.
10. Background workers run asynchronously.

---

## Embedding Worker

1. Claim pending/error rows with retry budget.
2. Build embedding input from provider, event type, title, summary, entity, status, dates, and tags.
3. Call Voyage with `input_type = "document"`.
4. Store vector with `vector32(?)`.
5. Mark `status = "ready"` or `status = "error"` with `last_error`.

Never fire-and-forget without state. Silent missing embeddings are the worst kind of clean-looking failure.

---

## Schema Inference Worker

Runs in parallel with the embedding worker. Triggered when an event has `quality = "degraded"` or when a schema has `needs_review = 1`.

1. Claim pending inference jobs (one per `provider_type + event_type`).
2. Load the `payload.normalized` sample from `dynamic_facts` or the flagged event.
3. Build inference prompt:
   - Provider type and event type.
   - Full `payload.normalized` sample.
   - `InferredFieldMapping` type definition and role enum as the target contract.
   - Existing schema mappings if updating (for drift cases).
4. Call Claude. Request `InferredFieldMapping[]` as structured JSON output.
5. Validate output — reject mappings that reference non-existent columns.
6. Compute `sample_keys_hash` from sorted top-level keys.
7. Upsert `provider_schemas` row with `confirmed_at = null`, `needs_review = 0`.
8. Reprocess affected `dynamic_facts` rows: apply new schema mappings, update `facts_json` with mapped output, upgrade `quality` to `"partial"` on the parent `events` row.
9. Mark job complete or `"error"` with `last_error`.

Schema inference runs at most once per `(provider_type, event_type)` combination until a new drift is detected. Do not re-infer on every event.
