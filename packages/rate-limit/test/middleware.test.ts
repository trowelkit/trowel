import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, createRateLimiter, memoryStore, RateLimitError, type RateLimitContext } from '../src/index.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

/** A request context like Hono's, recording the headers set on the response. */
function contextFor(requestHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  const c: RateLimitContext & { headers: Record<string, string> } = {
    headers,
    req: { header: (name) => requestHeaders[name.toLowerCase()] },
    header: (name, value) => void (headers[name] = value),
  };
  return c;
}

const posts = () => createRateLimiter({ name: 'posts', limit: 2, window: 60, store: memoryStore() });

describe('limiter.middleware', () => {
  it('calls next and sets the rate limit headers', async () => {
    const middleware = posts().middleware();
    const c = contextFor({ 'cf-connecting-ip': '203.0.113.7' });
    const next = vi.fn(async () => {
      // The headers come after the handler, so they land on its response.
      expect(c.headers).toEqual({});
    });
    await middleware(c, next);

    expect(next).toHaveBeenCalledOnce();
    expect(c.headers).toEqual({ 'RateLimit-Limit': '2', 'RateLimit-Remaining': '1', 'RateLimit-Reset': '60' });
  });

  it('throws a RateLimitError without calling next over the limit', async () => {
    const middleware = posts().middleware();
    const next = vi.fn(async () => {});
    const c = () => contextFor({ 'cf-connecting-ip': '203.0.113.7' });
    await middleware(c(), next);
    await middleware(c(), next);
    const error = await middleware(c(), next).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(next).toHaveBeenCalledTimes(2);
    expect((error as RateLimitError).getResponse().headers.get('retry-after')).toBe('60');
  });

  it('counts each client IP separately, and requests without one together', async () => {
    const middleware = posts().middleware();
    const next = async () => {};
    for (const ip of ['198.51.100.1', '198.51.100.1', '198.51.100.2']) {
      await middleware(contextFor({ 'cf-connecting-ip': ip }), next);
    }
    await middleware(contextFor(), next);
    await middleware(contextFor(), next);
    await expect(middleware(contextFor(), next)).rejects.toBeInstanceOf(RateLimitError);
    expect(clientIp(contextFor())).toBe('unknown');
  });

  it('uses a custom key and cost, and skips requests without a key', async () => {
    const limiter = posts();
    const middleware = limiter.middleware({ key: (c) => c.req.header('x-api-key'), cost: 2 });
    const next = vi.fn(async () => {});

    await middleware(contextFor({ 'x-api-key': 'k1' }), next);
    await expect(middleware(contextFor({ 'x-api-key': 'k1' }), next)).rejects.toBeInstanceOf(RateLimitError);
    await middleware(contextFor(), next);
    await middleware(contextFor(), next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(await limiter.peek('k1')).toMatchObject({ remaining: 0 });
  });
});
