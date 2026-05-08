export type NookEventEnvelope = {
  schemaVersion: 1;
  id: string;
  occurredAt: string;
  emittedAt: string;
  source: "webhook" | "website" | "imap" | "system" | "test";
  provider: {
    id: string | null;
    type: string;
    name: string;
    tags: string[];
  };
  event: {
    type: string;
    title: string | null;
    messageHtml: string | null;
    messageText: string | null;
    url: string | null;
  };
  actor: { id: string | null; name: string | null; email: string | null } | null;
  subject: {
    type: string;
    id: string | null;
    name: string | null;
    url: string | null;
  };
  payload: { normalized: Record<string, unknown>; raw: unknown | null };
  privacy: { containsPii: boolean; rawPayloadAllowed: boolean };
};

export type InferredFieldMapping = {
  source_key: string;
  target_key: string;
  type: "text" | "date_iso" | "number" | "boolean" | "hash_email";
  role: "status" | "id" | "name" | "date" | "url" | "count" | "other";
  confidence: number;
};

export type ProviderSchema = {
  id: string;
  provider_type: string;
  event_type_pattern: string | null;
  field_mappings: InferredFieldMapping[];
  searchable_text_template: string | null;
  sample_keys_hash: string;
  needs_review: boolean;
  inferred_at: string;
  confirmed_at: string | null;
  inferred_by: string | null;
};

export type ExtractedEvent = {
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_name: string | null;
  actor_email_hash: string | null;
  url: string | null;
  title: string;
  summary: string;
  searchable_text: string;
  facts: Record<string, unknown> | null;
  quality: "complete" | "partial" | "degraded";
};

export type ChatRequest = { session_id?: string; message: string };
export type ChatSource = { event_id: string; provider_name: string; occurred_at: string; title: string; score: number };
export type ChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  created_at: string;
};
export type ChatSessionSummary = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};
export type ChatSessionDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageRecord[];
};

export type EventRow = {
  id: string;
  schema_version: number;
  source: string;
  provider_id: string | null;
  provider_type: string;
  provider_name: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_name: string | null;
  actor_email_hash: string | null;
  status: string | null;
  due_at: string | null;
  completed_at: string | null;
  occurred_at: string;
  emitted_at: string;
  ingested_at: string;
  url: string | null;
  title: string;
  summary: string;
  searchable_text: string;
  payload_redacted_json: string;
  payload_hash: string;
  quality: "complete" | "partial" | "degraded";
};

export type EmbeddingStatus = "pending" | "ready" | "error" | "locked";

export type StatsSnapshot = {
  id: string;
  kind: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  source_count: number;
  min_sample_met: boolean;
  data: Record<string, unknown>;
};

export type OntologyConceptKind = "entity_type" | "field_role" | "relation_type" | "event_category";
export type OntologyConceptState = "draft" | "tentative" | "confirmed" | "rejected" | "superseded";

export type OntologyConcept = {
  id: string;
  kind: OntologyConceptKind;
  label: string;
  description: string;
  capabilities: string[];
  examples: string[];
  confidence: number;
  state: OntologyConceptState;
  source: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
};
