import type { NookEventEnvelope, ExtractedEvent } from '../types';
import { hashEmail, stripHtml } from './redact';

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
const SHA256_RE = /^[0-9a-f]{64}$/i;

function extractEmailFromText(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(EMAIL_RE);
  return m ? m[0] : null;
}

export function extractEnvelope(envelope: NookEventEnvelope): Omit<ExtractedEvent, 'facts' | 'quality'> {
  const actorEmailHash =
    envelope.actor?.email ? hashEmail(envelope.actor.email) : null;

  const rawSummary = envelope.event.messageText
    ?? (envelope.event.messageHtml ? stripHtml(envelope.event.messageHtml) : '');

  const title = envelope.event.title ?? '';
  const summary = rawSummary;
  const entityName = envelope.subject.name ?? null;
  const tags = envelope.provider.tags.join(' ');

  const envelopeActor = envelope.actor?.name ?? null;
  const actorName = (envelopeActor && !SHA256_RE.test(envelopeActor))
    ? envelopeActor
    : (extractEmailFromText(summary) ?? extractEmailFromText(title) ?? null);

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
    actor_name: actorName,
    actor_email_hash: actorEmailHash,
    url: envelope.event.url ?? envelope.subject.url,
    title,
    summary,
    searchable_text,
  };
}
