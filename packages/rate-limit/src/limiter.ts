import { RateLimitError, rateLimitHeaders } from './errors.ts';
import type { RateLimitStore, RateLimitWindow } from './store.ts';

export type MaybePromise<T> = T | Promise<T>;

export interface RateLimiterOptions {
  /** Identifies the limiter in store keys, so several limiters can share a store. */
  name: string;
  /** Hits allowed per window. */
  limit: number;
  /** Window length in seconds. A key's window opens on its first hit. */
  window: number;
  store: RateLimitStore;
}

export interface RateLimitResult {
  /** Whether this hit is within the limit. For `peek`, whether the next one would be. */
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Seconds until the window resets. */
  readonly reset: number;
  /** When the window resets, in milliseconds since the epoch. 0 when no window is open. */
  readonly resetAt: number;
}

/** The parts of a Void (Hono) request context the middleware uses. */
export interface RateLimitContext {
  readonly req: { header(name: string): string | undefined };
  header(name: string, value: string): void;
}

/** Matches Void's `defineHandler(middleware, handler)` middleware slot. */
export type RateLimitMiddleware = (c: RateLimitContext, next: () => Promise<void>) => Promise<void>;

export interface MiddlewareOptions<C extends RateLimitContext = RateLimitContext> {
  /**
   * Picks the key a request counts against. Defaults to the client IP.
   * Return `null` or `undefined` to skip the limit for the request.
   */
  key?: (c: C) => MaybePromise<string | null | undefined>;
  /** How much one request counts. Defaults to 1. */
  cost?: number;
}

export interface RateLimiter {
  readonly name: string;
  readonly limit: number;
  readonly window: number;
  /** Counts a hit for the key and reports whether it is within the limit. */
  hit(key: string, cost?: number): Promise<RateLimitResult>;
  /** Like `hit`, but throws a `RateLimitError` when the key is over the limit. */
  enforce(key: string, cost?: number): Promise<RateLimitResult>;
  /** The key's state, without counting. */
  peek(key: string): Promise<RateLimitResult>;
  /** Clears the key's window, for example after a successful sign-in. */
  reset(key: string): Promise<void>;
  /**
   * Route middleware: `defineHandler(limiter.middleware(), handler)`. Sets the
   * `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers,
   * and throws a `RateLimitError` (429, with `Retry-After`) over the limit.
   */
  middleware<C extends RateLimitContext = RateLimitContext>(options?: MiddlewareOptions<C>): RateLimitMiddleware;
}

/**
 * The client's IP address from Cloudflare's `CF-Connecting-IP` header, or
 * `'unknown'` without one, so such requests share one count.
 */
export function clientIp(c: RateLimitContext): string {
  return c.req.header('cf-connecting-ip') || 'unknown';
}

function assertPositive(name: string, value: number, integer: boolean) {
  if (!(value > 0) || (integer && !Number.isInteger(value))) {
    throw new Error(`Rate limiter ${name} must be a positive ${integer ? 'integer' : 'number'}, got ${value}.`);
  }
}

/**
 * Creates a fixed-window rate limiter: each key gets `limit` hits per window
 * of `window` seconds.
 *
 * ```ts
 * export const postLimiter = createRateLimiter({ name: 'posts', limit: 10, window: 60, store });
 *
 * export const POST = defineHandler(postLimiter.middleware(), handler);
 * ```
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { name, limit, window, store } = options;
  if (!name) throw new Error('A rate limiter needs a name.');
  assertPositive('limit', limit, true);
  assertPositive('window', window, false);
  const windowMs = Math.round(window * 1000);

  const storeKey = (key: string) => `${name}:${key}`;

  function toResult({ count, resetAt }: RateLimitWindow, allowed: (count: number) => boolean): RateLimitResult {
    const now = Date.now();
    const open = resetAt > now;
    const used = open ? count : 0;
    return {
      allowed: allowed(used),
      limit,
      remaining: Math.max(0, limit - used),
      reset: open ? Math.ceil((resetAt - now) / 1000) : 0,
      resetAt: open ? resetAt : 0,
    };
  }

  async function hit(key: string, cost = 1) {
    assertPositive('cost', cost, true);
    return toResult(await store.hit(storeKey(key), windowMs, cost), (count) => count <= limit);
  }

  async function enforce(key: string, cost?: number) {
    const result = await hit(key, cost);
    if (!result.allowed) throw new RateLimitError(result);
    return result;
  }

  return {
    name,
    limit,
    window,
    hit,
    enforce,
    peek: async (key) => toResult(await store.peek(storeKey(key)), (count) => count < limit),
    reset: async (key) => {
      await store.reset(storeKey(key));
    },
    middleware<C extends RateLimitContext>(middlewareOptions: MiddlewareOptions<C> = {}): RateLimitMiddleware {
      const keyOf = middlewareOptions.key ?? (clientIp as (c: C) => string);
      return async (c, next) => {
        const key = await keyOf(c as C);
        if (key === null || key === undefined) return next();
        const result = await enforce(key, middlewareOptions.cost);
        await next();
        // After `next`, so the headers land on the handler's response.
        for (const [header, value] of Object.entries(rateLimitHeaders(result))) c.header(header, value);
      };
    },
  };
}
