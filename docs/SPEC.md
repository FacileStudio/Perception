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
| [spec/scope.md](docs/spec/scope.md) | Product goal and V1 scope |
| [spec/stack.md](docs/spec/stack.md) | Stack decisions and references |
| [spec/nook-contract.md](docs/spec/nook-contract.md) | Event envelope shape, HMAC auth |
| [spec/extractors.md](docs/spec/extractors.md) | Provider extraction contract and fact targets |
| [spec/storage.md](docs/spec/storage.md) | Full SQL schema — core, fact, and operational tables |
| [spec/ingest.md](docs/spec/ingest.md) | Ingestion pipeline and embedding worker |
| [spec/chat.md](docs/spec/chat.md) | Retrieval lanes, ranking, and chat streaming |
| [spec/stats.md](docs/spec/stats.md) | Statistical signals and output requirements |
| [spec/security.md](docs/spec/security.md) | Auth, ingest security, prompt injection, PII |
| [spec/api.md](docs/spec/api.md) | Full API surface |
| [spec/frontend.md](docs/spec/frontend.md) | SvelteKit routes and design rules |
| [spec/structure.md](docs/spec/structure.md) | Project directory layout |
| [spec/environment.md](docs/spec/environment.md) | All environment variables |
| [spec/milestones.md](docs/spec/milestones.md) | Build milestones and acceptance criteria |
| [spec/open-questions.md](docs/spec/open-questions.md) | Unresolved decisions and recommended defaults |

## Intelligence Specs

| File | Contents |
|---|---|
| [auto-labeling.md](docs/auto-labeling.md) | Generated ontology, capabilities, unknown-data workflow, confidence gates, retrieval integration |
| [retrieval-and-entity-resolver.md](docs/retrieval-and-entity-resolver.md) | Retrieval evals, entity resolver, relation graph, phased implementation |

## Diagrams

Source files and rendered PNGs live in [`docs/diagrams/`](docs/diagrams/). PNGs are generated artifacts — edit the `.d2` sources.
