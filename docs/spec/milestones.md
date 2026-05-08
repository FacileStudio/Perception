# Implementation Milestones

1. Scaffold Bun/Hono API, migrations, config loading, health/ready routes.
2. Implement ingest auth, idempotency, redaction, and event/fact inserts.
3. Implement provider extractors with fixtures from Nook payloads.
4. Implement Voyage embeddings worker with retry/backfill.
5. Implement retrieval lanes and chat streaming.
6. Implement SvelteKit chat and context feed with auth.
7. Add stats snapshots.
8. Add Dockerfile/deploy docs/backups.
9. Run retrieval evals on fixture questions and tune ranking.

---

## Acceptance Criteria

Build is ready when:

- Migrations create all core, fact, embedding, chat, and stats tables.
- Duplicate ingest events do not duplicate facts or stats.
- Failed embeddings are visible and retryable.
- Chat answers cite source event IDs and timestamps.
- Structured questions use SQL/facts, not LLM counting.
- Dashboard requires auth outside local development.
- PII defaults are conservative.
- Tests cover HMAC verification, replay rejection, extraction fixtures, embedding job state, and chat retrieval merging.

Minimum commands once implemented:

```sh
bun test
bun run typecheck
bun run lint
bun run build
```
