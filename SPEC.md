# Perception — Spec Index

Status: ready to build
Last reviewed: 2026-05-08

Key decisions locked in:

1. Embeddings use Voyage AI — Anthropic does not provide embedding models.
2. Nook delivers structured `NookEventEnvelope` payloads to a dedicated `perception` delivery target. The contract is implemented and stable.
3. Storage normalizes facts into provider-specific tables. No raw-event-only designs that promise precise SQL but can't deliver it.

---

## Spec Files

| File | Contents |
|---|---|
| [spec/scope.md](spec/scope.md) | Product goal and V1 scope |
| [spec/stack.md](spec/stack.md) | Stack decisions and references |
| [spec/nook-contract.md](spec/nook-contract.md) | Event envelope shape, HMAC auth |
| [spec/extractors.md](spec/extractors.md) | Provider extraction contract and fact targets |
| [spec/storage.md](spec/storage.md) | Full SQL schema — core, fact, and operational tables |
| [spec/ingest.md](spec/ingest.md) | Ingestion pipeline and embedding worker |
| [spec/chat.md](spec/chat.md) | Retrieval lanes, ranking, and chat streaming |
| [spec/stats.md](spec/stats.md) | Statistical signals and output requirements |
| [spec/security.md](spec/security.md) | Auth, ingest security, prompt injection, PII |
| [spec/api.md](spec/api.md) | Full API surface |
| [spec/frontend.md](spec/frontend.md) | SvelteKit routes and design rules |
| [spec/structure.md](spec/structure.md) | Project directory layout |
| [spec/environment.md](spec/environment.md) | All environment variables |
| [spec/milestones.md](spec/milestones.md) | Build milestones and acceptance criteria |
| [spec/open-questions.md](spec/open-questions.md) | Unresolved decisions and recommended defaults |

## Diagrams

Source files and rendered PNGs live in [`diagrams/`](diagrams/). PNGs are generated artifacts — edit the `.d2` sources.
