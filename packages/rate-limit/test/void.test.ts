import { authContext } from 'void/auth';
import type * as Durable from 'void/durable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRateLimiter,
  durableStore,
  rateLimitState,
  userOrIp,
  type RateLimitNamespace,
  type RateLimitWindow,
} from '../src/void.ts';

const START = Date.parse('2026-01-01T00:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

/** One object's context, the way Void's Durable State passes it to methods. */
function objectContext() {
  const alarms: (number | null)[] = [];
  const context = {
    state: structuredClone(rateLimitState.initialState) as RateLimitWindow,
    setAlarm: async (time: number | Date) => void alarms.push(Number(time)),
    deleteAlarm: async () => void alarms.push(null),
  };
  return { context: context as never as Parameters<typeof rateLimitState.methods.hit>[0], alarms, raw: context };
}

/** Objects by name, like `RateLimiter.get(name)`, calling the state's methods directly. */
function fakeNamespace() {
  const objects = new Map<string, ReturnType<typeof objectContext>>();
  const object = (name: string) => objects.get(name) ?? objects.set(name, objectContext()).get(name)!;
  const namespace: RateLimitNamespace = {
    get: (name) => {
      const { context } = object(name);
      return {
        hit: async (windowMs, cost) => structuredClone(await rateLimitState.methods.hit(context, windowMs, cost)),
        peek: async () => structuredClone(rateLimitState.methods.peek(context)),
        reset: () => rateLimitState.methods.reset(context),
      };
    },
  };
  return { namespace, object };
}

describe('rateLimitState', () => {
  it('opens a window on the first hit and sets an alarm for its end', async () => {
    const { context, alarms, raw } = objectContext();
    expect(await rateLimitState.methods.hit(context, 60_000, 1)).toEqual({ count: 1, resetAt: START + 60_000 });
    vi.setSystemTime(START + 1000);
    expect(await rateLimitState.methods.hit(context, 60_000, 2)).toEqual({ count: 3, resetAt: START + 60_000 });
    expect(alarms).toEqual([START + 60_000]);
    expect(raw.state).toEqual({ count: 3, resetAt: START + 60_000 });
  });

  it('is cleared by the alarm', async () => {
    const { context, raw } = objectContext();
    await rateLimitState.methods.hit(context, 60_000, 1);
    vi.setSystemTime(START + 60_000);
    rateLimitState.alarm(context);
    expect(raw.state).toEqual({ count: 0, resetAt: 0 });
  });

  it('opens a new window if a hit arrives before the alarm has run', async () => {
    const { context, alarms } = objectContext();
    await rateLimitState.methods.hit(context, 60_000, 1);
    vi.setSystemTime(START + 60_000);
    expect(await rateLimitState.methods.hit(context, 60_000, 1)).toEqual({ count: 1, resetAt: START + 120_000 });
    expect(alarms).toEqual([START + 60_000, START + 120_000]);
  });

  it('resets and cancels the alarm', async () => {
    const { context, alarms, raw } = objectContext();
    await rateLimitState.methods.hit(context, 60_000, 1);
    await rateLimitState.methods.reset(context);
    expect(raw.state).toEqual({ count: 0, resetAt: 0 });
    expect(alarms).toEqual([START + 60_000, null]);
  });

  it('fits defineDurableState and durableStore', () => {
    // Checked by `tsc` only; never called, since void/durable needs the Workers runtime.
    // The example app checks the stub's method types, with the Workers types loaded.
    const typeOnly = (defineDurableState: typeof Durable.defineDurableState) => {
      const RateLimiter = defineDurableState(rateLimitState);
      return durableStore(RateLimiter);
    };
    void typeOnly;
  });
});

describe('durableStore', () => {
  it('keeps one object per key', async () => {
    const { namespace, object } = fakeNamespace();
    const posts = createRateLimiter({ name: 'posts', limit: 2, window: 60, store: durableStore(namespace) });

    await posts.hit('alice');
    await posts.hit('alice');
    expect(await posts.hit('alice')).toMatchObject({ allowed: false, remaining: 0, reset: 60 });
    expect(await posts.hit('bob')).toMatchObject({ allowed: true, remaining: 1 });
    expect(object('posts:alice').raw.state).toEqual({ count: 3, resetAt: START + 60_000 });

    expect(await posts.peek('alice')).toMatchObject({ remaining: 0 });
    await posts.reset('alice');
    expect(await posts.peek('alice')).toMatchObject({ remaining: 2 });
  });
});

describe('userOrIp', () => {
  const c = { req: { header: (name: string) => (name === 'cf-connecting-ip' ? '203.0.113.9' : undefined) }, header() {} };

  it("uses the signed-in user's id, or the IP for guests", async () => {
    const asRequest = (user: unknown, fn: () => string) => authContext.run({ user, state: null } as never, fn);
    expect(asRequest({ id: 'u1' }, () => userOrIp(c))).toBe('user:u1');
    expect(asRequest(null, () => userOrIp(c))).toBe('ip:203.0.113.9');
  });
});
