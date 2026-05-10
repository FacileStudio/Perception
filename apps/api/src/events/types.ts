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
