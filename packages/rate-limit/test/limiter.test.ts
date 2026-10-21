import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter, memoryStore, RateLimitError } from '../src/index.ts';

const START = Date.parse('2026-01-01T00:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

function limiter(limit = 3, window = 60) {
  return createRateLimiter({ name: 'test', limit, window, store: memoryStore() });
}

describe('createRateLimiter', () => {
  it('validates its options', () => {
    const store = memoryStore();
    expect(() => createRateLimiter({ name: '', limit: 1, window: 1, store })).toThrow('needs a name');
    expect(() => createRateLimiter({ name: 'x', limit: 0, window: 1, store })).toThrow('limit must be a positive integer');
    expect(() => createRateLimiter({ name: 'x', limit: 1.5, window: 1, store })).toThrow('limit must be a positive integer');
    expect(() => createRateLimiter({ name: 'x', limit: 1, window: -1, store })).toThrow('window must be a positive number');
  });

  it('allows hits up to the limit within a window', async () => {
    const posts = limiter(3, 60);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await posts.hit('alice'));

    expect(results.map((r) => [r.allowed, r.remaining])).toEqual([
      [true, 2],
      [true, 1],
      [true, 0],
      [false, 0],
    ]);
    expect(results[0]).toMatchObject({ limit: 3, reset: 60, resetAt: START + 60_000 });
  });

  it('keeps the window fixed from the first hit', async () => {
    const posts = limiter(3, 60);
    await posts.hit('alice');
    vi.setSystemTime(START + 45_500);
    expect(await posts.hit('alice')).toMatchObject({ remaining: 1, reset: 15, resetAt: START + 60_000 });
  });

  it('opens a new window after the old one ends', async () => {
    const posts = limiter(1, 60);
    await posts.hit('alice');
    expect((await posts.hit('alice')).allowed).toBe(false);

    vi.setSystemTime(START + 60_000);
    expect(await posts.hit('alice')).toMatchObject({ allowed: true, remaining: 0, resetAt: START + 120_000 });
  });

  it('counts keys separately', async () => {
    const posts = limiter(1);
    await posts.hit('alice');
    expect((await posts.hit('bob')).allowed).toBe(true);
  });

  it('keeps limiters that share a store apart by name', async () => {
    const store = memoryStore();
    const a = createRateLimiter({ name: 'a', limit: 1, window: 60, store });
    const b = createRateLimiter({ name: 'b', limit: 1, window: 60, store });
    await a.hit('alice');
    expect((await b.hit('alice')).allowed).toBe(true);
  });

  it('counts a cost', async () => {
    const exports = limiter(10);
    expect(await exports.hit('alice', 4)).toMatchObject({ allowed: true, remaining: 6 });
    expect(await exports.hit('alice', 7)).toMatchObject({ allowed: false, remaining: 0 });
    await expect(exports.hit('alice', 0)).rejects.toThrow('cost must be a positive integer');
  });

  it('peeks without counting', async () => {
    const posts = limiter(2);
    expect(await posts.peek('alice')).toEqual({ allowed: true, limit: 2, remaining: 2, reset: 0, resetAt: 0 });
    await posts.hit('alice');
    await posts.hit('alice');
    expect(await posts.peek('alice')).toMatchObject({ allowed: false, remaining: 0, reset: 60 });
    expect(await posts.peek('alice')).toMatchObject({ remaining: 0 });
  });

  it('resets a key', async () => {
    const posts = limiter(1);
    await posts.hit('alice');
    await posts.reset('alice');
    expect((await posts.hit('alice')).allowed).toBe(true);
  });

  it('throws a RateLimitError from enforce when over the limit', async () => {
    const posts = limiter(1, 30);
    await posts.enforce('alice');
    const error = await posts.enforce('alice').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ status: 429, retryAfter: 30, name: 'RateLimitError' });
  });
});

describe('RateLimitError', () => {
  it('turns into a 429 response with the rate limit headers', async () => {
    const posts = limiter(1, 30);
    await posts.hit('alice');
    vi.setSystemTime(START + 10_000);
    const error = (await posts.enforce('alice').catch((e: unknown) => e)) as RateLimitError;
    const response = error.getResponse();

    expect(response.status).toBe(429);
    expect(await response.text()).toBe('Too Many Requests');
    expect(Object.fromEntries(response.headers)).toEqual({
      'content-type': 'text/plain; charset=utf-8',
      'ratelimit-limit': '1',
      'ratelimit-remaining': '0',
      'ratelimit-reset': '20',
      'retry-after': '20',
    });
  });
});
