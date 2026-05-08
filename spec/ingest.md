# Ingestion Pipeline

Endpoint: `POST /ingest`

## Flow

1. Read raw request body once.
2. Verify HMAC, timestamp, and event ID.
3. Parse `NookEventEnvelope`.
4. Reject duplicate event IDs idempotently.
5. Redact payload according to provider privacy rules.
6. Run deterministic provider extractor.
7. Insert `events`, provider fact row, FTS row, and pending `event_embeddings` row in one transaction.
8. Return `202 Accepted`.
9. Background worker embeds pending rows.

## Embedding Worker

1. Claim pending/error rows with retry budget.
2. Build embedding input from provider, event type, title, summary, entity, status, dates, and tags.
3. Call Voyage with `input_type = "document"`.
4. Store vector with `vector32(?)`.
5. Mark `status = "ready"` or `status = "error"` with `last_error`.

Never fire-and-forget without state. Silent missing embeddings are the worst kind of clean-looking failure.
