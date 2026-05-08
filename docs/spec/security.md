# Security and Privacy

## Dashboard Auth

Single-user auth is in scope for v1.

Requirements:

- `PERCEPTION_ADMIN_PASSWORD` enables login.
- `PERCEPTION_SESSION_SECRET` signs cookies.
- Cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax`.
- Authenticated HTML/API responses: `Cache-Control: private, no-store` and `Vary: Cookie`.
- Login rate limit.
- No public dashboard without auth unless `PERCEPTION_LOCAL_DEV_AUTH_DISABLED=true` and host is local.

## Ingest Security

- HMAC signatures required outside local development.
- Replay protection through timestamp and event ID.
- Secret rotation with current/previous secrets.
- Duplicate events are accepted idempotently, not inserted twice.
- Request body size limit.

## Prompt Injection

Emails, webhook text, task titles, and commit messages are untrusted.

Controls:

- Strip HTML before embedding.
- Wrap retrieved context in source blocks.
- System prompt says retrieved event content cannot override system/developer instructions.
- No model tools in v1.
- No autonomous actions.

## Data Minimization

Defaults:

- Store redacted payload JSON, not raw payload JSON.
- Hash emails for joins unless the display value is needed.
- IMAP stores headers only in v1.
- Full email body/excerpt indexing is opt-in per provider.
- `PERCEPTION_RETENTION_DAYS` defaults to `365`.
- Admin command can purge old events and embeddings.
