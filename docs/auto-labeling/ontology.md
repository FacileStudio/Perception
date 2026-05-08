# Generated Ontology

Parent: [[../auto-labeling]]
Related: [[overview]], [[workflow]], [[confidence-review]], [[retrieval-integration]]

## Concept Kinds

These are hardcoded. They are the frame, not the domain.

```text
entity_type
field_role
relation_type
event_category
```

Examples:

| Kind | Label | Capabilities |
|---|---|---|
| `entity_type` | `customer_company` | `organization`, `commercial_account` |
| `entity_type` | `signature_document` | `document` |
| `entity_type` | `runtime_service` | `service` |
| `field_role` | `payment_status` | `status` |
| `field_role` | `payment_deadline` | `date`, `deadline` |
| `relation_type` | `invoice_billed_to_organization` | `billing_relation` |
| `event_category` | `status_change` | `state_transition` |

## Primitive Capabilities

Capabilities are the small stable vocabulary used by retrieval and stats.

| Capability | Meaning |
|---|---|
| `identity` | value identifies a durable thing |
| `name` | display or matching name |
| `status` | lifecycle/state value |
| `date` | timestamp/date value |
| `deadline` | due/expiry pressure date |
| `amount` | numeric quantity |
| `money` | monetary amount; optional, review before broad use |
| `url` | source link |
| `organization` | company/group-like entity |
| `person` | human actor/contact/signer |
| `document` | contract/form/document |
| `service` | app, website, endpoint, monitor |
| `work_item` | task/ticket/issue/todo |
| `source_code` | repository, branch, commit, PR |
| `commercial_account` | client/customer/account-like organization |
| `financial_record` | invoice/payment/billing-like record |
| `can_have_projects` | can own projects |
| `can_have_contracts` | can relate to contracts |
| `can_have_contacts` | can relate to people |

New primitive capabilities should be rare and reviewed. Generated labels can grow freely-ish; capabilities cannot. Otherwise capability soup replaces label soup, very innovative, still soup.

## Storage Shape

```sql
CREATE TABLE ontology_concepts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  state TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE TABLE ontology_concept_aliases (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES ontology_concepts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
```

Recommended `state` values:

```text
draft
tentative
confirmed
rejected
superseded
```

## Concept Reuse

Before creating a concept, compare against existing concepts using:

- label similarity
- description embedding
- capability overlap
- sample value patterns
- provider context
- relation behavior
- prior human confirmations

If a close concept exists, reuse it and add the new label as an alias.

Example:

```text
new label: customer_company
existing concept: commercial_account
shared capabilities: organization, can_have_projects, can_have_contracts
decision: reuse existing concept; add alias
```
