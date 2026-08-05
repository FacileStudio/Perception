# Perception — API

Every HTTP route the Hono app mounts, grouped by router. Generated from
`apps/api/src/server.ts` and `apps/api/src/routes/`.

Perception serves its own machine-readable spec, and that spec is the authority when the two
disagree:

- `GET /docs` — Scalar reference
- `GET /docs/openapi.json` — the OpenAPI document

Paths below are as the API sees them. From a browser, everything is reached through the client's
proxy under `/api/…` — `GET /events` in the API is `GET /api/events` from the front end. `/docs`
is the exception: the client proxies it verbatim, so the reference lives at `/docs` on the public
root, exactly as it does on every other Facile app.

## Authentication

Two mechanisms, for two different callers.

**Ingest** uses HMAC only, no session. See the ingest section below.

**Everything else** uses a session cookie, resolved by `getWorkspaceContext`, which tries the
`better-auth` session first and falls back to the legacy `sessions` table. It produces a
`WorkspaceContext` of `{userId, userName, userEmail, workspaceId, workspaceSlug, role}`. The active
workspace comes from the `perception_workspace` cookie, or the session's active organization.

Guards:

| Guard | Used by | Failure |
|---|---|---|
| `requireWorkspace` | Every domain router | `401 {"error":"unauthorized"}` |
| `requireAdmin` | Every `/admin` route | `401 {"error":"unauthorized"}` |

With `PERCEPTION_LOCAL_DEV_AUTH_DISABLED=true`, both guards return a fixed `Dev User` context in
the `default` workspace. Development only.

CORS allows exactly `http://localhost:3000`, `http://localhost:5173` and `CLIENT_ORIGIN`, with
credentials. Requests from any other origin fail before they reach a handler.

## Health and metadata

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/health` | none | `{ok, ready, startupError?, authError?}`. Always `200`, even after a failed migration |
| GET | `/ready` | none | `503` until bootstrap finishes, then runs `SELECT 1`. `503 {"error":"db_unavailable"}` if the database is down |
| GET | `/docs` | none | Scalar API reference, reachable at `/docs` on the public root |
| GET | `/docs/openapi.json` | none | OpenAPI document |

Use `/ready` for alerting. `/health` returning `200` means the process is alive and nothing else.

## Authentication routes

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/auth/config` | none | `{sso_only, oidc_enabled}`. `oidc_enabled` requires issuer, client id, secret and redirect URL all set |
| GET | `/auth/status` | optional | `{authenticated, user}`. `user.source` is `local` or `oidc` |
| POST | `/auth/login` | none | Body `{"password": "…"}` against `PERCEPTION_ADMIN_PASSWORD`. `403 password_login_disabled` when `SSO_ONLY=true`, `401 unauthorized` on a bad password |
| POST | `/auth/logout` | session | Destroys the session |
| GET | `/auth/oidc` | none | Starts the OIDC flow. Registered only when `OIDC_ISSUER` and `OIDC_CLIENT_ID` are set. `503 oidc_unavailable` on failure |
| GET | `/auth/oidc/callback` | none | Completes the flow, upserts the user by email, redirects to `<OIDC_SUCCESS_URL>/chat`, or `/login?error=oidc_failed` |
| POST | `/auth/sync-profile` | session | Refreshes name and avatar from the OIDC userinfo endpoint. Returns `{synced: false}` for non-OIDC users and when called within five minutes of the last sync |
| GET, POST | `/auth/*` | varies | Catch-all handled by `better-auth`. Paths containing `/sign-up` or `/sign-in/email` return `403 sso_only_mode` when `SSO_ONLY=true` |

## Ingest

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/ingest` | HMAC | Accepts one Nook event envelope |

Headers:

| Header | Required | Purpose |
|---|---|---|
| `x-perception-workspace` | yes | Target workspace id. `400` when missing or unknown |
| `x-nook-event-id` | yes | Envelope id, part of the signed message |
| `x-nook-timestamp` | yes | Unix seconds. Beyond `PERCEPTION_INGEST_MAX_SKEW_SECONDS` (default 300) it is rejected |
| `x-nook-schema-version` | yes | Must be exactly `1` |
| `x-nook-signature-256` | yes | `sha256=<hex>`, HMAC-SHA256 over `<timestamp>.<event_id>.<raw_body>` |

The key is the per-workspace `ingest_secret` setting. Verification takes a list of secrets and
compares in constant time, so rotation means keeping the old value in the list until every sender
has moved.

Responses:

| Status | Body | When |
|---|---|---|
| 202 | `{ok: true}` | Accepted and processed |
| 202 | `{ok: true, duplicate: true}` | The envelope id already exists; nothing reprocessed |
| 400 | `{error: "Missing x-perception-workspace header"}` | No workspace header |
| 400 | `{error: "Workspace not found"}` | Unknown workspace id |
| 400 | `{error: "invalid_json"}` | Body is not JSON |
| 400 | `{error: "unsupported_schema_version"}` | Envelope `schemaVersion` is not `1` |
| 401 | `{error: "unauthorized", reason}` | HMAC failed |

Rejection reasons: `no_ingest_secret_configured`, `timestamp_out_of_range`,
`unsupported_schema_version`, `invalid_signature`. Every rejection is also recorded in
`ingest_rejections` with a hashed source IP and a hashed body, which is the first place to look
when Nook says it delivered and Perception shows nothing.

Body limit: 1 MB.

## Chat

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/chat` | workspace | Sends a message and streams a grounded answer |
| GET | `/chat/sessions` | workspace | List chat sessions |
| GET | `/chat/sessions/:sessionId` | workspace | One session with its messages |
| DELETE | `/chat/sessions/:sessionId` | workspace | Delete a session |
| PATCH | `/chat/messages/:messageId/feedback` | workspace | Label an answer good or bad |

Feedback is not cosmetic. It labels the `retrieval_outcomes` row recorded for that message, and the
bandit worker refits per-intent lane weights from those labels daily. Not sending feedback means
retrieval never improves.

## Events

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/events` | workspace | List events, filtered and paged |
| GET | `/events/:id` | workspace | One event with its extracted facts |
| DELETE | `/events/:id` | workspace | Delete an event |

Each event carries a `quality` of `complete`, `partial` or `degraded` — see
[architecture.md](architecture.md).

## Schemas

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/schemas` | workspace | Inferred provider schemas |
| GET | `/schemas/jobs` | workspace | Schema inference jobs and their status |
| GET | `/schemas/:id` | workspace | One schema with its field mappings |
| POST | `/schemas/:id/confirm` | workspace | Confirm a schema |
| POST | `/schemas/:id/reject` | workspace | Reject a schema |

Confirming a schema promotes matching events from `partial` to `complete` and lets the uplift
worker re-extract the `degraded` ones behind it.

## Entities

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/entities/graph` | workspace | The entity relation graph |
| GET | `/entities/communities` | workspace | Detected communities with summaries |
| GET | `/entities/narratives` | workspace | Generated per-entity narratives |
| GET | `/entities/path` | workspace | Shortest path between two entities |
| GET | `/entities/match-candidates` | workspace | Pending merge candidates |
| POST | `/entities/match-candidates/generate` | workspace | Regenerate candidates |
| POST | `/entities/match-candidates/:id/resolve` | workspace | Accept or reject a candidate |
| POST | `/entities/relations/resolve-all` | workspace | Resolve every pending relation |
| GET | `/entities/:id/narrative` | workspace | One entity's narrative |
| GET | `/entities/:id/community` | workspace | The community an entity belongs to |
| GET | `/entities/:id/neighbors` | workspace | Directly related entities |
| POST | `/entities/:id/merge` | workspace | Merge another entity into this one |
| POST | `/entities/:id/split` | workspace | Split a previously merged entity |

Merges are recorded in `entity_merge_log`, which is what makes a split possible later.

## Resources

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/resources` | workspace | Upload a document. Chunked, embedded and retrievable alongside events |
| GET | `/resources` | workspace | List resources |
| GET | `/resources/:id` | workspace | Resource metadata and chunks |
| GET | `/resources/:id/file` | workspace | Download the original file |
| DELETE | `/resources/:id` | workspace | Delete a resource and its chunks |

Body limit: 50 MB. Uploads pass through the client proxy, which is why the client image sets
`BODY_SIZE_LIMIT=Infinity`.

## Stats

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/stats` | workspace | Event counts, provider breakdown, activity over time |
| GET | `/stats/intelligence` | workspace | Derived signals — change points, drift, causal links, graph health |

## Forecasts

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/forecasts` | workspace | List forecasts |
| POST | `/forecasts` | workspace | Create a forecast question |
| GET | `/forecasts/:id` | workspace | One forecast |
| PATCH | `/forecasts/:id/resolve` | workspace | Resolve it by hand |
| PATCH | `/forecasts/:id/extend` | workspace | Extend the horizon |
| DELETE | `/forecasts/:id` | workspace | Delete it |
| GET | `/forecasts/:id/resolution` | workspace | How it resolved |
| GET | `/forecasts/:id/beliefs` | workspace | Bayesian belief history |
| GET | `/forecasts/:id/intervals` | workspace | Conformal prediction intervals |
| GET | `/forecasts/:id/ensemble` | workspace | Per-strategy ensemble breakdown |
| GET | `/forecasts/calibration` | workspace | Current calibration scores |
| GET | `/forecasts/calibration/history` | workspace | Calibration over time |
| GET | `/forecasts/conformal/state` | workspace | Conformal calibration state |
| GET | `/forecasts/strategies` | workspace | Strategies and their track records |

The forecast router is imported dynamically and mounted inside a `try`. A load failure logs
`forecast routes failed to load` and the rest of the API starts without it — so a missing
`/forecasts` is a startup log question, not a routing one.

## Notifications and proposals

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/notifications` | workspace | List notifications |
| GET | `/notifications/unread-count` | workspace | Unread badge count |
| PATCH | `/notifications/:id/read` | workspace | Mark one read |
| PATCH | `/notifications/read-all` | workspace | Mark all read |
| GET | `/proposals` | workspace | Action proposals generated from detected gaps |
| POST | `/proposals` | workspace | Create a proposal by hand |
| PATCH | `/proposals/:id/approve` | workspace | Approve |
| PATCH | `/proposals/:id/dismiss` | workspace | Dismiss |

## Settings

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/settings` | workspace | Effective settings plus, per key, whether it came from the workspace, the database or a default. API keys are masked |
| PUT | `/settings` | workspace | Write workspace-level overrides. Keys outside the allowed list are ignored silently |
| GET | `/settings/usage` | workspace | Token usage and estimated spend |

Allowed keys: `anthropic_api_key`, `voyage_api_key`, `llm_model`, `embedding_model`,
`embedding_dimensions`, `retention_days`, `store_raw_payloads`, `email_body_indexing`,
`notification_webhook_url`. `ingest_secret` is deliberately not among them — it is set through the
workspace settings routes.

## Users and workspaces

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/users/me` | workspace | The current user and role |
| GET | `/users` | workspace | Users in the workspace |
| GET | `/workspaces` | workspace | Workspaces the caller belongs to |
| POST | `/workspaces` | workspace | Create a workspace |
| POST | `/workspaces/switch` | workspace | Switch the active workspace, setting the `perception_workspace` cookie |
| PATCH | `/workspaces/:id` | workspace | Rename a workspace |
| GET | `/workspaces/:id/settings` | workspace | Workspace-scoped settings, including `ingest_secret` |
| PUT | `/workspaces/:id/settings` | workspace | Update them |
| GET | `/workspaces/:id/members` | workspace | Members |
| POST | `/workspaces/:id/invite` | workspace | Invite someone |
| PATCH | `/workspaces/:id/members/:memberId/role` | workspace | Change a role |
| DELETE | `/workspaces/:id/members/:memberId` | workspace | Remove a member |
| GET | `/workspaces/:id/stats` | workspace | Per-workspace counts |

## Admin

Every route below requires `requireAdmin`.

| Method | Path | What it does |
|---|---|---|
| GET | `/admin/workers` | Every worker's status, last run and the global paused flag |
| PUT | `/admin/workers/paused` | Body `{"paused": bool}`. Pauses or resumes all workers |
| GET | `/admin/workers/:name/history` | Run history for one worker |
| POST | `/admin/workers/:name/run` | Run one worker immediately |
| GET | `/admin/embedding-stats` | Embedding coverage and failure counts |
| POST | `/admin/embedding-jobs/retry` | Retry failed embedding jobs |
| POST | `/admin/backfill-embeddings` | Enqueue events that have no embedding |
| POST | `/admin/reembed-all` | Re-embed everything. Needed after changing `embedding_dimensions` |
| POST | `/admin/reinfer-schemas` | Requeue schema inference for every provider |
| POST | `/admin/reprocess-entities` | Rebuild actor entity links |
| GET | `/admin/graph-health` | Latest graph entropy and connectivity snapshot |
| GET | `/admin/topology` | Latest topological persistence snapshot |
| GET | `/admin/drift-alerts` | Concept drift alerts per provider |
| POST | `/admin/eval/run` | Run the retrieval evaluation over stored fixtures |
| GET | `/admin/eval/runs` | Past evaluation runs |
| GET | `/admin/eval/runs/:runId` | Results of one run |
| GET | `/admin/eval/fixtures` | Evaluation fixtures |
| POST | `/admin/eval/fixtures` | Create a fixture |
| DELETE | `/admin/eval/fixtures/:id` | Delete a fixture |
| POST | `/admin/eval/promote/:messageId` | Promote a real chat message into a fixture |

`reembed-all` is the expensive one — it re-embeds every event and every resource chunk through
Voyage. Check the cost table in [deployment.md](deployment.md) before running it on a large
instance.

## SDK

`apps/api/src/sdk.ts` ships a typed client over these endpoints:

```ts
import { createPerceptionClient } from './sdk'

const client = createPerceptionClient({
  baseUrl: 'https://perception.facile.studio',
  token: 'my-api-token',
})

const { events } = await client.events.list({ limit: 10 })
const { communities } = await client.entities.communities()
const { forecast } = await client.forecasts.get('forecast-id')
const stream = await client.chat.send('What happened last week?')
```

For sending events from outside the suite, use
[perception-js](https://github.com/FacileStudio/perception-js) instead — it handles the HMAC
signing and the envelope shape:

```ts
import { ingest } from 'perception-js'

ingest('subscription.upgraded', { from: 'free', to: 'pro' }, {
  actor: { id: userId, email },
  subject: { type: 'organization', id: orgId, name: orgName },
})
```

Install with `bun add github:FacileStudio/perception-js`.
