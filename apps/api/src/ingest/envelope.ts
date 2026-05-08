import type { NookEventEnvelope, ExtractedEvent } from '../types';
import { hashEmail, stripHtml } from './redact';

export function extractEnvelope(envelope: NookEventEnvelope): Omit<ExtractedEvent, 'facts' | 'quality'> {
  const actorEmailHash =
    envelope.actor?.email ? hashEmail(envelope.actor.email) : null;

  const rawSummary = envelope.event.messageText
    ?? (envelope.event.messageHtml ? stripHtml(envelope.event.messageHtml) : '');

  const title = envelope.event.title ?? '';
  const summary = rawSummary;
  const entityName = envelope.subject.name ?? null;
  const tags = envelope.provider.tags.join(' ');

  const parts = [
    title,
    summary,
    entityName ?? '',
    envelope.provider.name,
    envelope.provider.type,
    envelope.event.type,
    tags,
  ].filter(Boolean);

  const searchable_text = parts.join(' ').replace(/\s+/g, ' ').trim();

  return {
    event_type: envelope.event.type,
    entity_type: envelope.subject.type,
    entity_id: envelope.subject.id,
    entity_name: entityName,
    actor_name: envelope.actor?.name ?? null,
    actor_email_hash: actorEmailHash,
    url: envelope.event.url ?? envelope.subject.url,
    title,
    summary,
    searchable_text,
  };
}
