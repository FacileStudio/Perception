# Confidence and Review

Parent: [[../auto-labeling]]
Related: [[ontology]], [[workflow]], [[retrieval-integration]], [[evaluation]]

## Confidence Gates

| Confidence | State | Behavior |
|---:|---|---|
| `>= 0.92` | confirmed or auto-usable | use in retrieval; allow grounded answers |
| `0.75 - 0.91` | tentative | use with lower rank; disclose uncertainty when central |
| `< 0.75` | draft | store only; do not power stats or broad traversal |

High confidence is not permanent truth. It is permission to use while preserving traceability.

## Review Queue Triggers

Queue review when:

- new primitive capability is proposed
- relation concept is medium confidence
- same label has conflicting capabilities
- same entity name maps to different domains
- provider schema drifts
- concept is used often but remains unconfirmed
- generated label conflicts with a confirmed concept

## Review Actions

- confirm concept
- rename concept
- merge concepts
- split concept
- add/remove capability
- confirm/reject relation
- mark superseded

Review decisions become training examples for future matching.

## Stats Rules

Stats must use only:

- confirmed concepts, or
- high-confidence concepts explicitly marked safe for the target stat

Never let degraded or draft concepts produce official business metrics. Fake precision is the fanciest kind of wrong.

## Failure Modes

### Label Explosion

Symptom: `client`, `customer`, `account`, `customer_company`, and `commercial_org` all become separate concepts.

Fix:

- concept aliases
- embedding/description clustering
- prefer reuse over creation
- review popular unconfirmed concepts

### Bad Merges

Symptom: two distinct clients/entities collapse into one.

Fix:

- conservative thresholds
- block cross-capability merges
- penalize conflicting domains/source IDs
- keep split operation cheap

### Semantic Drift

Symptom: provider changes payload meaning while keys stay similar.

Fix:

- sample key hashes
- value distribution checks
- schema/concept versioning
- re-inference jobs

### Capability Soup

Symptom: capabilities become as messy as labels.

Fix:

- small seed list
- review new primitive capabilities
- map uncertain capability to broader parent, like `money` -> `amount`

## Answer Wording

When tentative evidence matters:

```text
I found a likely Acme payment issue: Stripe invoice Invoice #2026-004 is open for EUR 1,200 and due 2026-06-01. The Acme match is based on the acme.fr billing domain, so it is high-confidence but not manually confirmed yet.
```

Uncertainty should be visible only when it changes trust in the answer. Do not dump ontology anxiety into every response.
