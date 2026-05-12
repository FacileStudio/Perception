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

  try {
    const headers = new Headers();
    for (const [key, value] of event.request.headers) {
      if (!HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    }

    const method = event.request.method;
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const body = hasBody ? await event.request.arrayBuffer() : null;

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
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
  } catch (err) {
    console.error(`[proxy] ${event.request.method} ${path} FAILED:`, err);
    return new Response(JSON.stringify({ error: 'proxy_error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
