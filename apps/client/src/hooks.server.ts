import type { Handle } from '@sveltejs/kit';

const API_UPSTREAM = process.env.API_UPSTREAM ?? 'http://api:8787';

const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

export const handle: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/')) {
    return resolve(event);
  }

  const path = event.url.pathname.slice(4);
  const url = `${API_UPSTREAM}${path}${event.url.search}`;

  const headers = new Headers();
  for (const [key, value] of event.request.headers) {
    if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  }

  const res = await fetch(url, {
    method: event.request.method,
    headers,
    body: event.request.body,
    redirect: 'manual',
    // @ts-expect-error duplex needed for streaming request body
    duplex: 'half',
  });

  const responseHeaders = new Headers();
  for (const [key, value] of res.headers) {
    if (!HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
};
