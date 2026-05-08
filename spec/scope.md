# Product Goal and V1 Scope

## Product Goal

Perception answers operational questions from real business events:

- What needs attention today?
- Which contracts are unsigned or aging?
- What shipped this week?
- What happened with a client recently?
- Which clients went quiet?
- Are tasks, deployments, emails, and contracts moving in a healthy direction?
- Summarize the last 7 days with source-backed facts.

The primary UX is chat. The secondary UX is a searchable context feed for auditing what the answer used.

This is not a graph dashboard. Dashboards age into decorative furniture. Chat plus inspectable evidence is the point.

---

## V1 Scope

### In Scope

- Ingest events from Nook only.
- Store normalized events, redacted payloads, provider-specific facts, embeddings, chat messages, and stats snapshots.
- Answer questions through a single-user authenticated chat UI.
- Browse/search recent events.
- Retry failed embeddings.
- Show source references in answers.
- Support local/private deployment first, with production-safe auth and secrets.

### Out of Scope

- Multi-tenant organizations.
- Proactive alerts from Perception itself.
- Writing back to source systems.
- Full email body indexing by default.
- Fine-tuned models.
- External reranking service in v1, unless retrieval evals show it is needed.
- Public unauthenticated dashboard.
