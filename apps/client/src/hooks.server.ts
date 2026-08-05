import type { Handle } from '@sveltejs/kit';

const API_UPSTREAM = process.env.API_UPSTREAM ?? 'http://api:8787';

const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  ...HOP_HEADERS,
  'content-encoding',
  'content-length',
]);

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  const isApi = pathname.startsWith('/api/');
  const isDocs = pathname === '/docs' || pathname.startsWith('/docs/');

  if (!isApi && !isDocs) {
    return resolve(event);
  }

  const path = isApi ? pathname.slice(4) : pathname;
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

    const init: RequestInit & { duplex?: 'half' } = { method, headers, redirect: 'manual' };
    if (hasBody) {
      init.body = event.request.body;
      init.duplex = 'half';
    }

    const res = await fetch(url, init);

    const responseHeaders = new Headers();
    for (const [key, value] of res.headers) {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.append(key, value);
      }
    }

    const setCookies = res.headers.getSetCookie?.();
    if (setCookies) {
      responseHeaders.delete('set-cookie');
      for (const cookie of setCookies) {
        responseHeaders.append('set-cookie', cookie);
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
