import { afterEach, describe, expect, test } from 'bun:test';
import { handle } from './hooks.server';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('api proxy handle', () => {
  test('strips content-encoding and content-length from the upstream response', async () => {
    globalThis.fetch = (async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': '11',
        },
      })) as typeof fetch;

    const request = new Request('http://client.test/api/events');
    const response = await handle({
      event: { url: new URL(request.url), request } as never,
      resolve: (() => {
        throw new Error('resolve should not be called for /api/ paths');
      }) as never,
    });

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('{"ok":true}');
  });
});
