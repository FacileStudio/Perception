# Perception — Cost Breakdown

> Estimates based on typical Facile operational volume. All prices as of May 2026.

---

## Voyage AI — Embeddings

Model: `voyage-4-lite`
Price: **$0.02 / 1M tokens**

| Volume | Tokens/event (est.) | Monthly cost |
|---|---|---|
| 1k events/mo | ~300 | ~$0.01 |
| 10k events/mo | ~300 | ~$0.06 |
| 100k events/mo | ~300 | ~$0.60 |

Backfill on first deploy adds a one-time spike. Retry failures are cheap — same token count, rare.

---

## Anthropic — Chat (Claude Sonnet 4.6)

Price: **$3.00 / 1M input tokens · $15.00 / 1M output tokens**

A typical chat turn sends ~2k–6k tokens of context (retrieved events + system prompt) and produces ~300–600 tokens of output.

| Usage | Turns/day | Monthly cost (est.) |
|---|---|---|
| Light | 5 | ~$1–2 |
| Active | 20 | ~$4–8 |
| Heavy | 50 | ~$10–20 |

Single-user tool — heavy usage is still cheap.

---

## Infrastructure

| Component | Option | Monthly cost |
|---|---|---|
| libSQL (local on la ruche) | File on disk | $0 |
| Turso Cloud (if migrated) | Free tier: 500MB, 1B rows read/mo | $0–$29 |
| Hosting (la ruche) | Already running | $0 marginal |

Local libSQL is the v1 default. Turso Cloud only if remote sync becomes useful.

---

## Total Estimate

| Scenario | Monthly |
|---|---|
| Idle / low usage | < $1 |
| Normal Facile operations | ~$5–10 |
| Heavy chat + high event volume | ~$20–30 |

No surprise bills. This is not a cost-sensitive system at Facile's scale.
