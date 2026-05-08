# Project Structure

```text
Perception/
|-- apps/
|   |-- api/
|   |   |-- src/
|   |   |   |-- server.ts
|   |   |   |-- routes/
|   |   |   |   |-- ingest.ts
|   |   |   |   |-- chat.ts
|   |   |   |   |-- events.ts
|   |   |   |   `-- auth.ts
|   |   |   |-- db/
|   |   |   |   |-- client.ts
|   |   |   |   |-- migrations.ts
|   |   |   |   `-- schema.sql
|   |   |   |-- extractors/
|   |   |   |   |-- index.ts
|   |   |   |   |-- vikunja.ts
|   |   |   |   |-- docuseal.ts
|   |   |   |   |-- charles.ts
|   |   |   |   |-- dokploy.ts
|   |   |   |   |-- git.ts
|   |   |   |   |-- uptime-kuma.ts
|   |   |   |   |-- imap.ts
|   |   |   |   `-- sablier.ts
|   |   |   |-- embeddings/
|   |   |   |   |-- voyage.ts
|   |   |   |   |-- input.ts
|   |   |   |   `-- worker.ts
|   |   |   |-- chat/
|   |   |   |   |-- planner.ts
|   |   |   |   |-- retrieve.ts
|   |   |   |   |-- prompt.ts
|   |   |   |   `-- stream.ts
|   |   |   |-- stats/
|   |   |   |   |-- compute.ts
|   |   |   |   `-- snapshots.ts
|   |   |   |-- security/
|   |   |   |   |-- hmac.ts
|   |   |   |   |-- session.ts
|   |   |   |   `-- redact.ts
|   |   |   `-- types.ts
|   |   |-- tests/
|   |   `-- package.json
|   `-- client/
|       |-- src/
|       |-- static/
|       |-- package.json
|       |-- svelte.config.js
|       `-- vite.config.ts
|-- apps/
|-- diagrams/
|-- spec/
|-- OVERVIEW.md
|-- COSTS.md
|-- SPEC.md
|-- package.json
`-- mise.toml
```
