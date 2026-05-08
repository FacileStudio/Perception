# Entity Resolver

Parent: [[../retrieval-and-entity-resolver]]
Related: [[overview]], [[retrieval]], [[../auto-labeling/ontology]], [[../auto-labeling/confidence-review]]

## Goal

Create canonical business entities from messy provider data.

First useful entities:

- customer/account organization
- project
- contract/document
- person/contact
- service
- repository
- work item

The labels should come from [[../auto-labeling/ontology]]. The resolver should operate on capabilities and aliases.

## Storage Shape

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type_concept_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  provider_type TEXT,
  confidence REAL NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE event_entities (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_concept_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (event_id, entity_id, relation_concept_id)
);

CREATE TABLE entity_relations (
  from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_concept_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_entity_id, to_entity_id, relation_concept_id)
);
```

## Matching Rules

Auto-link:

- same provider-scoped ID
- same verified domain for organization-like entities
- same normalized repository URL
- confirmed alias

Tentative:

- same normalized name only
- similar names with weak context
- relation inferred from partial schema

Block or penalize:

- different known domains
- different incompatible capabilities
- generic consumer email domains for company identity
- raw ID equality across providers

Bad merges are worse than duplicates. Duplicates are annoying; bad merges poison answers.
