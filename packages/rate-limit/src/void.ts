import { getUser } from 'void/auth';
import type { DurableStateContext } from 'void/durable';
import { clientIp, type RateLimitContext } from './limiter.ts';
import { countHit, type RateLimitStore, type RateLimitWindow } from './store.ts';

export * from './index.ts';

type Context = DurableStateContext<RateLimitWindow, Record<string, unknown>>;

const EMPTY: RateLimitWindow = { count: 0, resetAt: 0 };

/**
 * The Durable State for rate limiting: one object per key, holding a
 * fixed-window counter. An alarm clears it when the window ends.
 *
 * ```ts
 * // durable-objects/rate-limiter.ts
 * import { rateLimitState } from '@trowelkit/rate-limit/void';
 * import { defineDurableState } from 'void/durable';
 *
 * export const RateLimiter = defineDurableState(rateLimitState);
 * export default RateLimiter;
 * ```
 */
export const rateLimitState = {
  initialState: EMPTY,
  methods: {
    async hit(context: Context, windowMs: number, cost: number): Promise<RateLimitWindow> {
      const now = Date.now();
      const opening = context.state.resetAt <= now;
      context.state = countHit(context.state, windowMs, cost, now);
      if (opening) await context.setAlarm(context.state.resetAt);
      return context.state;
    },
    peek(context: Context): RateLimitWindow {
      return context.state;
    },
    async reset(context: Context): Promise<void> {
      context.state = EMPTY;
      await context.deleteAlarm();
    },
  },
  alarm(context: Context): void {
    context.state = EMPTY;
  },
};

/** What `defineDurableState(rateLimitState)` returns, as far as the store needs it. */
export interface RateLimitNamespace {
  get(name: string): {
    hit(windowMs: number, cost: number): Promise<RateLimitWindow>;
    peek(): Promise<RateLimitWindow>;
    reset(): Promise<void>;
  };
}

/**
 * A store that keeps each key's counter in its own Durable State object.
 * Pass the object from `durable-objects/rate-limiter.ts`:
 * `durableStore(RateLimiter)`.
 */
export function durableStore(namespace: RateLimitNamespace): RateLimitStore {
  return {
    hit: (key, windowMs, cost) => namespace.get(key).hit(windowMs, cost),
    peek: (key) => namespace.get(key).peek(),
    reset: (key) => namespace.get(key).reset(),
  };
}

/** A middleware key: the signed-in user's id, or the client IP for guests. */
export function userOrIp(c: RateLimitContext): string {
  const user = getUser();
  return user ? `user:${user.id}` : `ip:${clientIp(c)}`;
}
