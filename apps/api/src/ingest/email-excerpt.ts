import { hashEmail } from './redact';

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

export function extractEmailExcerpt(text: string): string {
  let lines = text.split('\n');

  lines = lines.filter(line => !line.trimStart().startsWith('>'));

  const sigIndex = lines.findIndex(line => /^--\s?$/.test(line));
  if (sigIndex !== -1) {
    lines = lines.slice(0, sigIndex);
  }

  let cleaned = lines.join('\n').trim();

  cleaned = cleaned.replace(EMAIL_RE, (match) => hashEmail(match));

  if (cleaned.length > 500) {
    cleaned = cleaned.slice(0, 500).trimEnd();
  }

  return cleaned;
}
