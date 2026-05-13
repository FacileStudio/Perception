# Nook Contract

Nook delivers events via a dedicated `perception` delivery target (`type: "perception"` in Nook settings). This target is implemented and stable in `../Nook`.

## Event Envelope

Nook sends this shape as a JSON body:

```ts
type NookEventEnvelope = {
  schemaVersion: 1;
  id: string;
  occurredAt: string;
  emittedAt: string;
  source: "webhook" | "website" | "imap" | "system" | "test";
  provider: {
    id: string | null;
    type: "uptime-kuma" | "docuseal" | "dokploy" | "git" | "vikunja" | "charles" | "sablier" | "imap" | "website" | "system";
    name: string;
    tags: string[];
  };
  event: {
    type: string;
    title: string | null;
    messageHtml: string | null;
    messageText: string | null;
    url: string | null;
  };
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
  subject: {
    type: "task" | "contract" | "client" | "deployment" | "repository" | "email" | "service" | "schedule" | "system" | "unknown";
    id: string | null;
    name: string | null;
    url: string | null;
  };
  payload: {
    normalized: Record<string, unknown>;
    raw: unknown | null;
  };
  privacy: {
    containsPii: boolean;
    rawPayloadAllowed: boolean;
  };
};
```

Notes:

- `id` is stable across Nook retries — derived from source event ID or a deterministic hash.
- `occurredAt` is when the source event happened. `emittedAt` is when Nook sent it.
- `messageText` is always plain text. No HTML parsing needed.
- `payload.normalized` contains provider-specific structured fields with stable names.
- `payload.raw` is `null` unless `includeRawPayload` is enabled on the Perception target.
- IMAP events contain headers only in v1. Full body excerpts are opt-in later.

## Ingest Authentication

Nook signs every request with HMAC-SHA256. Perception must validate these headers:

- `x-nook-event-id`: same as envelope `id`
- `x-nook-timestamp`: Unix seconds
- `x-nook-schema-version`: `1`
- `x-nook-signature-256`: `sha256=<hex>`

Signature payload:

```text
<timestamp>.<event_id>.<raw_body>
```

Verification:

- HMAC-SHA256 with the workspace's `ingest_secret` setting.
- Use constant-time compare.
- Reject timestamps older than 5 minutes.
- Reject duplicate event IDs.
- Store rejected requests in `ingest_rejections` without raw body unless debug mode is enabled.
