# Perception — API

Every HTTP route registered by the Go backend, generated from `apps/api/modules`.

The live interactive reference is served at `GET /docs` (Scalar UI) and the OpenAPI 3.1 schema is served at `GET /docs/openapi.json`. The drift test in `apps/api/apiref_test.go` verifies that every mounted route appears in the documentation registry.

## Conventions

- All application API endpoints are mounted under the `/api` route group.
- Session authentication uses either bearer tokens in the `Authorization` header (`Authorization: Bearer <token>`) or `HttpOnly` cookies managed by `porte`.
- Ingest requests are unauthenticated at the session layer and authenticated via HMAC-SHA256 signatures in `x-antenne-*` headers.
- Request and response payloads use JSON formatting with standard UTF-8 encoding.
- Errors are returned as JSON objects with `status`, `code`, and `message` fields.

## System

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | public | Liveness probe; returns `{"status":"ok"}` without touching dependencies |
| `GET` | `/ready` | public | Readiness probe; validates PostgreSQL connection and embedding worker health |
| `GET` | `/api/health` | public | Alias for `/health` |
| `GET` | `/api/ready` | public | Alias for `/ready` |
| `GET` | `/docs` | public | Interactive Scalar documentation interface |
| `GET` | `/docs/openapi.json` | public | OpenAPI 3.1 specification document |
| `GET` | `/*` | public | SvelteKit static single-page application fallback |

## Ingest

```text
POST /api/ingest
```

Accepts and stores an HMAC-signed event envelope from Antenne. Re-sending an event with the same ID acts as an idempotent update.

| Header | Required | Description |
|---|---|---|
| `X-Antenne-Event-Id` | yes | Unique event identifier string |
| `X-Antenne-Timestamp` | yes | Unix timestamp in seconds |
| `X-Antenne-Signature-256` | yes | HMAC-SHA256 signature in `sha256=<hex>` format |
| `X-Antenne-Schema-Version` | no | Schema version (must be `1` when present) |

Responses:
- `202 Accepted`: Returns `Response` with `accepted`, `duplicate`, and `quality` status.
- `400 Bad Request`: Missing headers, malformed JSON body, or unsupported schema.
- `401 Unauthorized`: Invalid signature or timestamp skew exceeding `INGEST_MAX_SKEW_SECONDS`.
- `413 Payload Too Large`: Request body exceeds 4 MiB.
- `500 Internal Server Error`: Server misconfiguration or database error.

```text
GET /api/ingest/rejections
```

Lists recent refused ingest deliveries (newest first, capped at 50 rows) for debugging emitter misconfigurations.

- Auth: Session cookie or bearer token required.
- Response: `200 OK` with a JSON array of `IngestRejection` records.

## Events

```text
GET /api/events
```

Lists events ordered by occurred timestamp descending. Supports filtering and cursor-based pagination.

| Query parameter | Type | Description |
|---|---|---|
| `provider` | string | Filter by Antenne provider type |
| `type` | string | Filter by event type string |
| `entity` | string | Substring search on entity name |
| `actor` | string | Exact match on actor email address |
| `quality` | string | Filter by quality level: `complete`, `partial`, `degraded` |
| `since` | string | Filter events on or after RFC-3339 timestamp or `YYYY-MM-DD` date |
| `until` | string | Filter events on or before RFC-3339 timestamp or `YYYY-MM-DD` date |
| `limit` | integer | Maximum events to return per page (default `50`, maximum `200`) |
| `cursor` | string | Opaque pagination cursor returned by previous page |

Responses:
- `200 OK`: Returns `Page` with `events` array and `next_cursor` (if more results exist).
- `400 Bad Request`: Invalid pagination cursor.
- `401 Unauthorized`: Missing or invalid session authentication.

```text
GET /api/events/{id}
```

Retrieves a single event record by ID in full detail, including raw payload if permitted.

- Auth: Session cookie or bearer token required.
- Responses: `200 OK` with full `Event` schema, `404 Not Found` if missing.

## Embeddings

```text
GET /api/embeddings/status
```

Reports vector embeddings status, Voyage worker backlog metrics, coverage percentage, and degradation state.

- Auth: Session cookie or bearer token required.
- Response: `200 OK` with `StatusResponse` (`enabled`, `model`, `pending`, `ready`, `error`, `total_events`, `coverage`, `oldest_pending_age`, `stall_threshold`, `degraded`).

## Authentication

Routes mounted by the `porte` authentication package:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/config` | public | Reports authentication modes (`sso_only`, `oidc_enabled`) |
| `POST` | `/api/auth/register` | public | Registers the initial local user account; closed thereafter |
| `POST` | `/api/auth/login` | public | Authenticates with email and password |
| `POST` | `/api/auth/logout` | session | Terminates the current session and clears cookies |
| `GET` | `/api/auth/me` | session | Returns the authenticated user profile |
| `GET` | `/api/auth/oidc` | public | Initiates PKCE OpenID Connect login redirect flow |
| `GET` | `/api/auth/oidc/callback` | public | Handles OpenID Connect authorization code callback |
| `POST` | `/api/auth/oidc/exchange` | public | Exchanges one-time code for CLI bearer token |
| `POST` | `/api/auth/backchannel-logout` | signed token | Processes back-channel logout notification from identity provider |
