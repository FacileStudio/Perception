# Perception

> A context brain for your business. Ingests all signals flowing through Nook — tasks, contracts, deployments, client activity, emails — and lets you ask questions, get summaries, and reason about what's happening and what's coming.

---

## What it is

Nook is a relay. Perception is the **memory and reasoning layer** built on top of it.

Every event that flows through Nook carries real business meaning:
- A Vikunja event → something was assigned, completed, or is overdue
- A Docuseal event → a contract was sent, signed, or declined
- A Charles event → a client did something, a deal changed
- A Dokploy or Git event → work shipped
- An IMAP event → an email arrived with context, a request, information

Perception accumulates all of this and answers questions like:

- *"What do I have to do today?"*
- *"Which contracts are still waiting for a signature?"*
- *"What shipped this week?"*
- *"What's been happening with this client?"*
- *"Based on the last month, what's likely to need attention next week?"*
- *"Summarize the last 7 days."*

The primary interface is a **chat**. Not a dashboard full of graphs.

---

## Architecture

| Diagram | File | Description |
|---|---|---|
| System overview | `architecture.d2` | All components and data flows |
| Ingest pipeline | `ingest-pipeline.d2` | Event → extraction → storage → embedding |
| Chat pipeline | `chat-pipeline.d2` | Question → RAG + SQL + stats → Claude → stream |
| Data model | `data-model.d2` | libSQL table schemas |

---

## Data sources

Each Nook provider contributes a different slice of context:

| Provider | What it means |
|---|---|
| `vikunja` | Tasks, todos, deadlines, project activity |
| `charles` | CRM: clients, deals, contacts, changes |
| `docuseal` | Contracts: sent, signed, declined, pending |
| `dokploy` | Deployments: what went live, when, status |
| `git` | Code: what was committed and pushed |
| `imap` | Emails: content, sender, subject, thread context |
| `uptime-kuma` | Service health: downtime, recovery |
| `sablier` | Scheduling / operational events |

The raw `EventLogEntry` from Nook is the ingest format, but Perception extracts semantic meaning from it — not just logs it.

---

## Layers

### 1. Ingestion + semantic extraction

- `POST /ingest` — receives Nook's `EventLogEntry`, validates secret
- For each event: extract a **semantic text summary** based on provider type
  - e.g. Vikunja: `"Task 'Write proposal' assigned to saravenpi, due 2026-05-10"`
  - e.g. Docuseal: `"Contract 'NDA – Acme Corp' signed by john@acme.com"`
  - e.g. IMAP: `"Email from alice@client.com: 'Re: project kickoff' — [body excerpt]"`
- Store raw event + semantic summary in libSQL
- Async: embed the semantic summary → store vector in same row

### 2. Memory store (libSQL)

Single database, two key tables:

```sql
events (
  id, timestamp, source, provider_type, provider_name,
  raw_payload JSON,
  summary TEXT,          -- human-readable semantic extraction
  embedding FLOAT32(1536)
)

chat_messages (
  id, session_id, role, content, timestamp
)
```

No delivery status tracking. No error rates. We don't care about Nook's plumbing.

### 3. Chat interface (primary UX)

- `POST /chat` — natural language question
- Pipeline:
  1. Embed the question
  2. `SELECT ... ORDER BY vector_distance_cos(embedding, ?) LIMIT 20`
  3. Also run targeted SQL for structured queries (e.g. tasks due today = filter by provider_type + date)
  4. Merge retrieved context → build Claude prompt
  5. Stream response via Vercel AI SDK `streamText()`
- Claude has access to a system prompt that describes what each provider means
- Session history stored in `chat_messages`, passed as conversation context

### 4. Statistical signals

Raw SQL aggregations + `simple-statistics` (pure JS, zero native bindings) compute objective signals that ground the LLM's reasoning. The LLM never counts or calculates — it reads pre-computed facts.

Signals computed per query or on a rolling schedule:

| Signal | Method |
|---|---|
| Task backlog velocity | Created vs completed per week → delta trend via `linearRegression()` |
| Contract pipeline health | Unsigned contracts + age; signing rate over time |
| Client activity cadence | Event frequency per Charles entity; detect silence (no activity in N days) |
| Workload patterns | Day-of-week / hour-of-day event density → when things tend to happen |
| Anomaly detection | Rolling mean ± 2× std dev → flag unusual spikes or drops |
| Cross-provider correlation | Do deploys correlate with task completions? (`sampleCorrelation()`) |

These are computed in `stats.ts` and injected into the chat prompt as a structured block:

```
[Statistical context]
Task velocity: +4 created, +1 completed this week. Backlog growing for 3 consecutive weeks.
Contracts: 2 unsigned (oldest: 14 days). Signing rate down 30% vs last month.
Client "Acme": last activity 18 days ago (usual cadence: every 4–5 days). Anomaly.
Deployment frequency: stable. No correlation with task completion rate.
```

Claude reads this as ground truth and reasons forward. The stats are the anchor; the LLM is the narrator.

### 5. Hybrid chat pipeline

Every chat query runs three lanes in parallel, then merges:

1. **RAG** — vector similarity search for semantic/contextual questions
2. **SQL** — structured filters for precise factual questions (due dates, counts)
3. **Stats** — pre-computed signals for trend and prediction questions

The merged context is injected into Claude's prompt. Claude decides what's relevant to the answer.

---

## Project structure

```
Perception/
├── apps/
│   ├── api/                  # Bun + Hono
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── ingest.ts         # POST /ingest
│   │   │   ├── extract.ts        # semantic summary per provider type
│   │   │   ├── embed.ts          # embedding pipeline
│   │   │   ├── chat.ts           # hybrid chat handler (RAG + SQL + stats)
│   │   │   ├── stats.ts          # statistical signals (simple-statistics)
│   │   │   ├── db.ts             # libSQL setup + migrations
│   │   │   └── types.ts
│   │   └── package.json
│   └── client/               # SvelteKit + muse
│       ├── src/routes/
│       │   ├── +page.svelte      # chat (primary view)
│       │   └── context/
│       │       └── +page.svelte  # recent events feed, searchable
│       └── package.json
├── architecture.d2
├── architecture.png
├── ingest-pipeline.d2
├── ingest-pipeline.png
├── chat-pipeline.d2
├── chat-pipeline.png
├── data-model.d2
├── data-model.png
└── package.json
```

The dashboard is **chat-first**. The event feed is a secondary view for browsing raw context.

### Component library rules

- Use `@facile/lib` (muse) first — check `lib/src/lib/index.ts` before building anything
- For components not covered by muse, use **shadcn-svelte** (Svelte 5 compatible)
- Never build a component from scratch if muse or shadcn-svelte already has it

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| API framework | Hono |
| Database | libSQL — events (relational + vector), chat history |
| Embeddings | Vercel AI SDK → Anthropic embedding model |
| LLM | Vercel AI SDK `streamText()` → claude-sonnet-4-6 |
| Statistics | `simple-statistics` — pure JS, Bun-compatible |
| Dashboard | SvelteKit + muse + shadcn-svelte |

### RAG approach

Events are short structured records. No document chunking needed. The full retrieval pipeline is explicit:

```
embed(question) → vector_distance_cos() in libSQL → top-K summaries → streamText()
```

For structured questions, SQL runs alongside or instead of vector search. The chat handler merges both.

---

## Key design decisions

- **Semantic extraction matters more than raw storage** — a Vikunja event stored as `"task_updated"` is useless. A summary `"Task X is now overdue"` is retrievable and meaningful.
- **Chat is the primary UX** — not graphs. The dashboard is mostly a chat window with a context feed.
- **Email content is first-class** — IMAP events carry body excerpts and are embedded like any other event.
- **No delivery metadata** — we strip Nook's `deliveries[]` array on ingest. Perception doesn't care how Nook routed the event.
- **Stats anchor predictions, LLM narrates them** — `simple-statistics` computes objective signals (trends, anomalies, velocity). Claude reads those as facts and reasons forward. Neither alone is enough: stats without language are unreadable; LLM without numbers hallucinates.

---

## Not in scope (v1)

- Auth on the dashboard
- Multiple users / sessions
- Proactive alerts or push notifications
- Ingesting from sources other than Nook
