# Perception — API

Every HTTP route the Go binary registers, generated from `apps/api/modules/`.

A live OpenAPI 3.1 specification is served at `GET /docs/openapi.json`, with an interactive
Scalar UI served at `GET /docs` — the same structure as every other Facile backend. A test walks
the live router and asserts that every registered route is documented.

Authentication uses bearer session tokens or cookies managed by `porte`. Ingest uses HMAC-SHA256
signatures in `x-antenne-*` headers.

## Health

`/health` and `/ready` are mounted twice, bare and under `/api`. `/ready` confirms database connectivity.

## Ingest

```
POST /api/ingest
```

Ingests structured events from Antenne or other suite services. Requires valid HMAC signature in `x-antenne-signature-256`.

| Header | Type | Description |
|---|---|---|
| `x-antenne-event-id` | string | Unique event ID |
| `x-antenne-timestamp` | string | Unix timestamp in seconds |
| `x-antenne-schema-version` | string | Ingest schema version (1) |
| `x-antenne-signature-256` | string | `sha256=<hex hmac>` signature |

## Events

### List events

```
GET /api/events
```

Returns paginated events matching filters.

| Query Param | Type | Description |
|---|---|---|
| `provider` | string | Filter by provider name |
| `event_type` | string | Filter by event type |
| `limit` | int | Results page size (default 50) |
| `cursor` | string | Pagination cursor |

### Get event

```
GET /api/events/{id}
```

Retrieves a single event by ID.

## Authentication

Auth routes are served by `porte`:

| Method | Path | Summary |
|---|---|---|
| `GET` | `/api/auth/config` | Describe enabled auth methods |
| `POST` | `/api/auth/login` | Email/password login |
| `POST` | `/api/auth/logout` | Revoke session and clear cookies |
| `GET` | `/api/auth/oidc` | Start OIDC login flow |
| `GET` | `/api/auth/oidc/callback` | Complete OIDC callback |
| `POST` | `/api/auth/oidc/exchange` | Exchange CLI login code |
| `POST` | `/api/auth/sync-profile` | Refresh OIDC profile |
| `POST` | `/api/auth/backchannel-logout` | Provider backchannel logout |
| `GET` | `/api/auth/me` | Current authenticated user profile |
| `PUT` | `/api/auth/password` | Change password and rotate session |
