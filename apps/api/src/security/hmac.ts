import { config } from '../config';

const encoder = new TextEncoder();

async function computeHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export type HmacResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyNookSignature(
  rawBody: string,
  headers: { eventId: string; timestamp: string; schemaVersion: string; signature: string },
  secrets: string[],
): Promise<HmacResult> {
  if (secrets.length === 0) {
    return { ok: false, reason: 'no_ingest_secret_configured' };
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(headers.timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > config.ingestMaxSkewSeconds) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  if (headers.schemaVersion !== '1') {
    return { ok: false, reason: 'unsupported_schema_version' };
  }

  const sigHex = headers.signature.replace(/^sha256=/, '');
  const message = `${headers.timestamp}.${headers.eventId}.${rawBody}`;

  for (const secret of secrets) {
    const expected = await computeHmac(secret, message);
    if (timingSafeEqual(expected, sigHex)) return { ok: true };
  }

  return { ok: false, reason: 'invalid_signature' };
}
