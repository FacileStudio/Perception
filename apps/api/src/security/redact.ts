import { createHash } from 'crypto';

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function redactPayload(
  normalized: Record<string, unknown>,
  privacy: { containsPii: boolean; rawPayloadAllowed: boolean },
): Record<string, unknown> {
  if (!privacy.containsPii) return normalized;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'string' && (key.toLowerCase().includes('email') || key.toLowerCase().includes('phone'))) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
