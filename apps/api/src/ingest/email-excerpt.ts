import EmailReplyParser from 'email-reply-parser';
import { hashEmail } from './redact';

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const parser = new EmailReplyParser();

export function extractEmailExcerpt(text: string): string {
  let cleaned = parser.parseReply(text);

  const sigIndex = cleaned.split('\n').findIndex(line => /^--\s?$/.test(line));
  if (sigIndex !== -1) {
    cleaned = cleaned.split('\n').slice(0, sigIndex).join('\n');
  }

  cleaned = cleaned.trim();
  cleaned = cleaned.replace(EMAIL_RE, (match) => hashEmail(match));

  if (cleaned.length > 500) {
    cleaned = cleaned.slice(0, 500).trimEnd();
  }

  return cleaned;
}
