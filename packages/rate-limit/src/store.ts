import type { MaybePromise } from './limiter.ts';

/** One key's current window. `resetAt` is 0 when no window is open. */
export interface RateLimitWindow {
  readonly count: number;
  /** When the window ends, in milliseconds since the epoch. */
  readonly resetAt: number;
}

/** Keeps a fixed-window counter per key. */
export interface RateLimitStore {
  /** Adds `cost` to the key's count, opening a window of `windowMs` if none is open. */
  hit(key: string, windowMs: number, cost: number): MaybePromise<RateLimitWindow>;
  /** The key's window, without counting. */
  peek(key: string): MaybePromise<RateLimitWindow>;
  /** Clears the key's window. */
  reset(key: string): MaybePromise<void>;
}

const EMPTY: RateLimitWindow = Object.freeze({ count: 0, resetAt: 0 });

/** Counts one hit in a fixed window: the window opens on the first hit and lasts `windowMs`. */
export function countHit(current: RateLimitWindow, windowMs: number, cost: number, now: number): RateLimitWindow {
  const open = current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  return { count: open.count + cost, resetAt: open.resetAt };
}

/**
 * Keeps counters in memory. For tests and single-process development only:
 * every isolate has its own counts.
 */
export function memoryStore(): RateLimitStore {
  const windows = new Map<string, RateLimitWindow>();
  const current = (key: string) => {
    const window = windows.get(key);
    if (window && window.resetAt <= Date.now()) windows.delete(key);
    return windows.get(key) ?? EMPTY;
  };
  return {
    hit(key, windowMs, cost) {
      const next = countHit(current(key), windowMs, cost, Date.now());
      windows.set(key, next);
      return next;
    },
    peek: current,
    reset(key) {
      windows.delete(key);
    },
  };
}
