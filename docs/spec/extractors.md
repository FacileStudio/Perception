# Extraction Contract

Perception is fully provider-agnostic. It has no knowledge of vikunja, dokploy, ardoise, or any other provider. All provider understanding lives in `provider_schemas`, inferred at runtime from data.

Extraction runs in two layers on every ingest.

---

## Layer 1 — Envelope Extraction

Deterministic. Always runs. No schema lookup. Reads directly from `NookEventEnvelope` fields, which Nook has already normalized.

| `NookEventEnvelope` path | `events` column |
|---|---|
| `event.type` | `event_type` |
| `subject.type` | `entity_type` |
| `subject.id` | `entity_id` |
| `subject.name` | `entity_name` |
| `actor.name` | `actor_name` |
| `actor.email` | `actor_email_hash` (SHA-256) |
| `event.url ?? subject.url` | `url` |
| `event.title` | `title` |
| `event.messageText` | `summary` |
| `provider.tags` | appended to `searchable_text` |

---

## Layer 2 — Schema-Driven Payload Mapping

Maps `payload.normalized` into `dynamic_facts` using a `ProviderSchema` record from `provider_schemas`.

### Field mapping type

```ts
type InferredFieldMapping = {
  source_key: string;
  target_key: string;
  type: "text" | "date_iso" | "number" | "boolean" | "hash_email";
  role: "status" | "id" | "name" | "date" | "url" | "count" | "other";
  confidence: number;
};
```

`role` is how the query and stats layers understand the field semantically without knowing what provider it came from.

### Schema lookup

Match `provider_schemas` by `(provider_type, event_type_pattern)`. `event_type_pattern = null` is a wildcard. Exact match wins over wildcard.

- **Schema found, confirmed** → apply mappings → `dynamic_facts` → `quality = "complete"`
- **Schema found, unconfirmed** → apply mappings → `dynamic_facts` → `quality = "partial"`
- **Schema found, needs_review** → apply existing mappings → `dynamic_facts` → `quality = "partial"` → enqueue inference for new keys only
- **No schema** → dump raw `payload.normalized` into `dynamic_facts` → `quality = "degraded"` → enqueue full inference

### Drift detection

Each schema row stores `sample_keys_hash` — a hash of the sorted top-level keys of the `payload.normalized` sample used for inference. On every ingest, compute the hash of incoming keys. If it diverges, set `needs_review = 1` on the schema row and enqueue a partial re-inference. Do not silently apply stale mappings to unknown fields.

---

## Extracted event output

```ts
type ExtractedEvent = {
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_name: string | null;
  actor_email: string | null;
  url: string | null;
  title: string;
  summary: string;
  searchable_text: string;
  facts: Record<string, unknown> | null;
  quality: "complete" | "partial" | "degraded";
};
```

`quality` rules:
- `complete` — confirmed schema, all expected keys mapped
- `partial` — inferred schema, not yet confirmed
- `degraded` — no schema, raw dump only

---

## Cold Start

Perception ships with zero provider schemas. The first event from any provider triggers schema inference. Until inference completes, events are stored with `quality = "degraded"` — they are still searchable and embeddable. Nothing is lost.
