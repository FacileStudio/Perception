import { createHash } from 'crypto';
import type { EventRow } from '../types';

export function buildEmbeddingInput(
  event: EventRow,
  facts?: Record<string, unknown> | null,
): string {
  const parts: string[] = [];

  if (event.actor_name) parts.push(event.actor_name);
  parts.push(event.event_type);

  const entity = event.entity_name
    ? `${event.entity_name} (${event.entity_type})`
    : event.entity_type;
  parts.push(entity);

  parts.push(`via ${event.provider_type}: ${event.title}. ${event.summary}`);

  if (facts) {
    const values = Object.values(facts)
      .slice(0, 3)
      .map((v) => String(v))
      .join(', ');
    if (values) parts.push(`Key facts: ${values}`);
  }

  return parts.join(' ');
}

export function hashInput(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
