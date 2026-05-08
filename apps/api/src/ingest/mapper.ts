import type { NookEventEnvelope, ProviderSchema, ExtractedEvent } from '../types';
import { hashEmail } from './redact';

function convertValue(
  value: unknown,
  type: 'text' | 'date_iso' | 'number' | 'boolean' | 'hash_email',
): unknown {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'text':
      return String(value);
    case 'date_iso':
      return typeof value === 'string' ? value : String(value);
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'hash_email':
      return hashEmail(String(value));
  }
}

export function mapPayload(
  envelope: NookEventEnvelope,
  schema: ProviderSchema | null,
): { facts: Record<string, unknown>; quality: ExtractedEvent['quality'] } {
  if (!schema) {
    return { facts: envelope.payload.normalized, quality: 'degraded' };
  }

  const facts: Record<string, unknown> = {};
  for (const mapping of schema.field_mappings) {
    const raw = envelope.payload.normalized[mapping.source_key];
    if (raw !== undefined) {
      facts[mapping.target_key] = convertValue(raw, mapping.type);
    }
  }

  return { facts, quality: 'complete' };
}
