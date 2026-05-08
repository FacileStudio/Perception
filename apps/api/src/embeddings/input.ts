import { createHash } from 'crypto';
import type { EventRow } from '../types';

export function buildEmbeddingInput(event: EventRow): string {
  return `[${event.provider_type}] [${event.event_type}] ${event.title}. ${event.summary}. Entity: ${event.entity_name ?? event.entity_type}. Status: ${event.status ?? 'unknown'}. ${event.occurred_at}`;
}

export function hashInput(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
