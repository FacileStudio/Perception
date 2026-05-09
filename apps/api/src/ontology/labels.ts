import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import type {
  ExtractedEvent,
  InferredFieldMapping,
  NookEventEnvelope,
  OntologyConceptKind,
  ProviderSchema,
} from '../types';
import { normalizeLabel } from './query';

type ConceptSeed = {
  kind: OntologyConceptKind;
  label: string;
  description: string;
  capabilities: string[];
  examples: string[];
  confidence: number;
  source: string;
};

export type EventLabeling = {
  entityConceptId: string;
  eventConceptIds: string[];
  fieldConceptIds: string[];
  relationConceptId: string;
  entityCapabilities: string[];
  eventCapabilities: string[];
};

const FIELD_ROLE_CAPABILITIES: Record<InferredFieldMapping['role'], string[]> = {
  status: ['status'],
  id: ['identity'],
  name: ['name'],
  date: ['date'],
  url: ['url'],
  count: ['amount'],
  other: [],
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

const ENTITY_TYPE_KEYWORDS = [
  'task', 'submission', 'contract', 'deployment', 'service', 'monitor',
  'client', 'invoice', 'payment', 'document', 'form', 'issue', 'alert',
  'repository', 'branch', 'commit', 'release', 'build', 'pipeline',
  'organization', 'account', 'contact', 'person', 'user',
];

function inferEntityTypeFromEventType(eventType: string): string | null {
  const parts = eventType.toLowerCase().split(/[._\-\s]+/);
  for (const part of parts) {
    if (ENTITY_TYPE_KEYWORDS.includes(part)) return part;
  }
  return null;
}

function capabilitiesForEntity(label: string, context: string): string[] {
  const text = `${label} ${context}`;
  const capabilities = ['identity'];

  if (includesAny(text, ['client', 'customer', 'account', 'company', 'organization', 'organisation', 'org'])) {
    capabilities.push('organization', 'commercial_account', 'can_have_projects', 'can_have_contracts', 'can_have_contacts');
  }
  if (includesAny(text, ['person', 'contact', 'signer', 'user', 'actor', 'assignee'])) {
    capabilities.push('person');
  }
  if (includesAny(text, ['contract', 'document', 'docuseal', 'form', 'submission', 'signature', 'agreement', 'email', 'message', 'mail'])) {
    capabilities.push('document');
  }
  if (includesAny(text, ['service', 'website', 'endpoint', 'monitor', 'deployment', 'deploy', 'app'])) {
    capabilities.push('service');
  }
  if (includesAny(text, ['task', 'ticket', 'issue', 'todo', 'work_item'])) {
    capabilities.push('work_item');
  }
  if (includesAny(text, ['repo', 'repository', 'branch', 'commit', 'pull_request', 'pr'])) {
    capabilities.push('source_code');
  }
  if (includesAny(text, ['invoice', 'payment', 'charge', 'billing', 'subscription'])) {
    capabilities.push('financial_record');
  }

  return uniq(capabilities);
}

function capabilitiesForEvent(label: string, context: string): string[] {
  const text = `${label} ${context}`;
  const capabilities: string[] = [];

  if (includesAny(text, ['status', 'state', 'completed', 'done', 'closed', 'opened', 'failed', 'succeeded'])) {
    capabilities.push('state_transition', 'status');
  }
  if (includesAny(text, ['due', 'deadline', 'expired', 'overdue'])) {
    capabilities.push('deadline', 'date');
  }
  if (includesAny(text, ['invoice', 'payment', 'charge', 'billing', 'paid'])) {
    capabilities.push('financial_record', 'money');
  }
  if (includesAny(text, ['deploy', 'deployment', 'build', 'release'])) {
    capabilities.push('service');
  }
  if (includesAny(text, ['contract', 'document', 'signature', 'form', 'submission'])) {
    capabilities.push('document');
  }

  return uniq(capabilities.length > 0 ? capabilities : ['identity']);
}

function capabilitiesForField(mapping: InferredFieldMapping): string[] {
  const base = [...FIELD_ROLE_CAPABILITIES[mapping.role]];
  const target = normalizeLabel(mapping.target_key);

  if (includesAny(target, ['amount', 'total', 'price', 'cost', 'currency', 'fee'])) {
    base.push('amount', 'money');
  }
  if (includesAny(target, ['due', 'deadline', 'expires', 'expiry'])) {
    base.push('date', 'deadline');
  }
  if (includesAny(target, ['email', 'person', 'contact', 'assignee', 'signer'])) {
    base.push('person');
  }
  if (includesAny(target, ['company', 'client', 'customer', 'account', 'organization'])) {
    base.push('organization', 'commercial_account');
  }

  return uniq(base.length > 0 ? base : ['identity']);
}

function stateForConfidence(confidence: number): 'draft' | 'tentative' | 'confirmed' {
  if (confidence >= 0.9) return 'confirmed';
  if (confidence >= 0.65) return 'tentative';
  return 'draft';
}

function conceptId(kind: OntologyConceptKind, label: string): string {
  return `concept_${kind}_${normalizeLabel(label)}`;
}

async function ensureConcept(seed: ConceptSeed): Promise<string> {
  const id = conceptId(seed.kind, seed.label);
  const now = new Date().toISOString();
  const state = stateForConfidence(seed.confidence);

  await db.execute({
    sql: `INSERT INTO ontology_concepts (
      id, kind, label, description, capabilities_json, examples_json, confidence,
      state, source, created_at, updated_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      description = excluded.description,
      capabilities_json = excluded.capabilities_json,
      examples_json = excluded.examples_json,
      confidence = max(ontology_concepts.confidence, excluded.confidence),
      state = CASE
        WHEN ontology_concepts.state = 'confirmed' THEN ontology_concepts.state
        ELSE excluded.state
      END,
      updated_at = excluded.updated_at,
      confirmed_at = coalesce(ontology_concepts.confirmed_at, excluded.confirmed_at)`,
    args: [
      id,
      seed.kind,
      normalizeLabel(seed.label),
      seed.description,
      JSON.stringify(uniq(seed.capabilities)),
      JSON.stringify(uniq(seed.examples)),
      seed.confidence,
      state,
      seed.source,
      now,
      now,
      state === 'confirmed' ? now : null,
    ],
  });

  for (const example of seed.examples) {
    const alias = normalizeLabel(example);
    if (!alias || alias === normalizeLabel(seed.label)) continue;
    await db.execute({
      sql: `INSERT OR IGNORE INTO ontology_concept_aliases (
        id, concept_id, alias, source, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), id, alias, seed.source, seed.confidence, now],
    });
  }

  return id;
}

function entitySeed(envelope: NookEventEnvelope, extracted: Omit<ExtractedEvent, 'facts' | 'quality'>): ConceptSeed {
  const rawType = extracted.entity_type || envelope.subject.type || '';
  const isUnknown = !rawType || rawType.toLowerCase() === 'unknown';
  const inferredType = isUnknown ? inferEntityTypeFromEventType(envelope.event.type) : null;
  const label = normalizeLabel(inferredType ?? (rawType || 'unknown_entity'));
  const context = [
    envelope.provider.type,
    envelope.provider.name,
    envelope.provider.tags.join(' '),
    envelope.event.type,
    extracted.title,
    extracted.summary,
  ].join(' ');

  return {
    kind: 'entity_type',
    label,
    description: `Entity type inferred from ${envelope.provider.type} ${envelope.event.type}`,
    capabilities: capabilitiesForEntity(label, normalizeLabel(context)),
    examples: [envelope.subject.type, envelope.subject.name ?? ''].filter(Boolean),
    confidence: extracted.entity_id || extracted.entity_name ? 0.86 : 0.62,
    source: 'ingest:auto',
  };
}

function eventSeed(envelope: NookEventEnvelope, extracted: Omit<ExtractedEvent, 'facts' | 'quality'>): ConceptSeed {
  const label = normalizeLabel(envelope.event.type || extracted.event_type || 'unknown_event');
  const context = [
    envelope.provider.type,
    envelope.provider.name,
    envelope.provider.tags.join(' '),
    extracted.title,
    extracted.summary,
  ].join(' ');

  return {
    kind: 'event_category',
    label,
    description: `Event category inferred from ${envelope.provider.type} payload`,
    capabilities: capabilitiesForEvent(label, normalizeLabel(context)),
    examples: [envelope.event.type, extracted.title].filter(Boolean),
    confidence: 0.82,
    source: 'ingest:auto',
  };
}

function fieldSeeds(schema: ProviderSchema | null): ConceptSeed[] {
  if (!schema) return [];
  return schema.field_mappings.map((mapping) => ({
    kind: 'field_role',
    label: normalizeLabel(mapping.target_key),
    description: `Field role inferred from ${schema.provider_type} ${schema.event_type_pattern ?? '*'}`,
    capabilities: capabilitiesForField(mapping),
    examples: [mapping.source_key, mapping.target_key],
    confidence: mapping.confidence,
    source: schema.confirmed_at ? 'schema:confirmed' : 'schema:inferred',
  }));
}

function relationSeed(entityCapabilities: string[], eventCapabilities: string[]): ConceptSeed {
  const label = entityCapabilities.includes('commercial_account') && eventCapabilities.includes('financial_record')
    ? 'billing_relation'
    : 'about_entity';

  return {
    kind: 'relation_type',
    label,
    description: 'Relation between ingested event and canonical entity',
    capabilities: [label],
    examples: [],
    confidence: label === 'billing_relation' ? 0.82 : 0.72,
    source: 'ingest:auto',
  };
}

export async function labelEvent(
  envelope: NookEventEnvelope,
  extracted: Omit<ExtractedEvent, 'facts' | 'quality'>,
  schema: ProviderSchema | null,
): Promise<EventLabeling> {
  const entity = entitySeed(envelope, extracted);
  const event = eventSeed(envelope, extracted);
  const entityConceptId = await ensureConcept(entity);
  const eventConceptId = await ensureConcept(event);

  const fieldConceptIds: string[] = [];
  for (const seed of fieldSeeds(schema)) {
    fieldConceptIds.push(await ensureConcept(seed));
  }

  const relation = relationSeed(entity.capabilities, event.capabilities);
  const relationConceptId = await ensureConcept(relation);

  return {
    entityConceptId,
    eventConceptIds: [eventConceptId],
    fieldConceptIds,
    relationConceptId,
    entityCapabilities: entity.capabilities,
    eventCapabilities: event.capabilities,
  };
}
