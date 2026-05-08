# Stack Decisions

| Area | Decision | Reason |
|---|---|---|
| Runtime | Bun | Matches Facile preference and Nook. Hono officially supports Bun. |
| API | Hono | Small server, clean middleware, native Bun deployment path. |
| Database | libSQL via `@libsql/client` | SQLite-compatible relational store plus native vector search. |
| Embeddings | Voyage AI `voyage-4-lite`, 1024 dimensions | Optimized for latency/cost with 32k context and selectable 1024/512/256/2048 dimensions. |
| Embedding access | Voyage official TypeScript client or direct REST | Avoid relying on an AI SDK community provider for a core storage contract. |
| LLM | Anthropic Claude Sonnet 4.6 via `@ai-sdk/anthropic` and AI SDK `streamText()` | Best speed/intelligence balance; AI SDK supports streaming text generation. |
| Frontend | SvelteKit + muse | Matches Facile UI rules and Svelte-only constraint for Facile tools. |
| Stats | `simple-statistics` over normalized fact tables | Fine for small/medium operational datasets; never make the LLM count by vibes. |
| Retrieval | Hybrid: vector + lexical FTS + SQL facts + stats | Combining semantic and lexical retrieval; SQL handles exact operational questions. |

## References

- Anthropic embeddings: https://platform.claude.com/docs/en/build-with-claude/embeddings
- Anthropic model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic model IDs: https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- Voyage embeddings: https://docs.voyageai.com/docs/embeddings
- Turso/libSQL vectors: https://docs.turso.tech/features/ai-and-embeddings
- AI SDK embeddings: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
- AI SDK `streamText`: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
- Hono on Bun: https://hono.dev/docs/getting-started/bun
- SvelteKit structure/routing: https://svelte.dev/docs/kit/project-structure and https://svelte.dev/docs/kit/routing
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
