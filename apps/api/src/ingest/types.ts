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
  attachments?: Array<{
    name: string;
    mime_type: string;
    url: string;
    size?: number;
  }>;
  payload: { normalized: Record<string, unknown>; raw: unknown | null };
  privacy: { containsPii: boolean; rawPayloadAllowed: boolean };
};

export type InferredFieldMapping = {
  source_key: string;
  target_key: string;
  type: "text" | "date_iso" | "number" | "boolean" | "hash_email";
  role: "status" | "id" | "name" | "actor" | "date" | "url" | "count" | "other";
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
