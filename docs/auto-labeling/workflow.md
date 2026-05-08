# Unknown Data Workflow

Parent: [[../auto-labeling]]
Related: [[overview]], [[ontology]], [[confidence-review]], [[retrieval-integration]], [[evaluation]]

This page is the implementation reference for a provider/event shape Perception has never seen.

## Example Event

```json
{
  "provider_type": "stripe",
  "event_type": "invoice.payment_failed",
  "subject": {
    "type": "invoice",
    "id": "in_123",
    "name": "Invoice #2026-004"
  },
  "payload": {
    "customer_name": "Acme SAS",
    "customer_email": "billing@acme.fr",
    "amount_due": 120000,
    "currency": "eur",
    "status": "open",
    "due_date": "2026-06-01"
  }
}
```

## Step 1: Store First

Save the raw event and dynamic facts before ontology inference completes.

Initial quality:

- `degraded` when no schema exists
- `partial` when envelope fields or inferred schema give safe mappings
- `complete` only after confirmed schema/concepts

Ingest must not block on the label worker.

## Step 2: Detect Unknown Shape

Create an ontology inference job when Perception sees:

- unknown provider/event pair
- unknown subject type
- new payload key hash
- known schema with drift
- repeated degraded events for same shape

Job input should include provider context, sample keys, value samples, event titles/summaries, and existing nearby concepts.

```json
{
  "provider_type": "stripe",
  "event_type": "invoice.payment_failed",
  "subject_type": "invoice",
  "sample_count": 12,
  "sample_keys": ["customer_name", "customer_email", "amount_due", "currency", "status", "due_date"],
  "sample_values": {
    "amount_due": [120000, 45000],
    "currency": ["eur"],
    "status": ["open", "failed", "paid"],
    "due_date": ["2026-06-01"]
  }
}
```

## Step 3: Generate Structured Proposals

Use structured output, not freeform prose. Output must validate before touching ontology tables.

```json
{
  "concepts": [
    {
      "kind": "entity_type",
      "label": "invoice",
      "description": "A billing document requesting payment from a customer.",
      "capabilities": ["document", "financial_record", "can_have_deadline"],
      "confidence": 0.94
    },
    {
      "kind": "field_role",
      "label": "payment_status",
      "source_key": "status",
      "capabilities": ["status"],
      "confidence": 0.91
    },
    {
      "kind": "field_role",
      "label": "amount_due",
      "source_key": "amount_due",
      "capabilities": ["amount", "money"],
      "confidence": 0.96
    },
    {
      "kind": "relation_type",
      "label": "invoice_billed_to_organization",
      "from_capabilities": ["financial_record"],
      "to_capabilities": ["organization"],
      "capabilities": ["billing_relation"],
      "confidence": 0.88
    }
  ]
}
```

## Step 4: Compare Before Create

Decision table:

| Proposal | Existing ontology result | Decision |
|---|---|---|
| `invoice` | no financial document concept | create tentative/confirmed by confidence |
| `payment_status` | generic `status` exists | create field role using `status` capability |
| `amount_due` | `amount` exists; `money` may not | use `amount`; mark `money` for review if new |
| `invoice_billed_to_organization` | plausible relation, unconfirmed | create tentative relation |

Do not create duplicate concepts when an alias is enough.

## Step 5: Extract Entities and Relations

Use concepts to link durable objects:

- invoice entity from `stripe:invoice:in_123`
- organization from `customer_name` / `customer_email` domain
- existing Acme entity if `acme.fr` already maps to it
- tentative invoice-to-Acme billing relation

```json
{
  "entities": [
    {
      "type_concept": "invoice",
      "source_id": "stripe:invoice:in_123",
      "name": "Invoice #2026-004",
      "capabilities": ["document", "financial_record", "can_have_deadline"]
    },
    {
      "type_concept": "customer_company",
      "matched_by": "domain",
      "domain": "acme.fr",
      "canonical_name": "Acme",
      "capabilities": ["organization", "commercial_account"]
    }
  ],
  "relations": [
    {
      "from": "invoice:in_123",
      "to": "organization:acme",
      "relation_concept": "invoice_billed_to_organization",
      "confidence": 0.88,
      "state": "tentative"
    }
  ]
}
```

## Step 6: Use Carefully

Question:

```text
What payment issues do we have with Acme?
```

Retrieval can use:

- Acme organization entity
- linked invoice entity
- `status`
- `amount`
- `deadline`
- tentative billing relation

If the Acme relation is tentative, the answer should say so when it matters.

## Step 7: Promote Over Time

Confirm concepts by:

- human review
- repeated high-confidence events
- agreement across providers
- stable schema over time

Confirmed concepts become future examples for inference. This is how Perception learns without growing a landfill of near-duplicate labels.
