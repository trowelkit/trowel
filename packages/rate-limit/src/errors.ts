import type { RateLimitResult } from './limiter.ts';

/** The `RateLimit-*` headers for a result, plus `Retry-After` when it is over the limit. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(result.reset),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.reset);
  return headers;
}

/**
 * Thrown when a key is over its limit.
 *
 * It implements `getResponse()`, which Void's error handler turns into a 429
 * response with the rate limit headers, so throwing it from a route is enough.
 */
export class RateLimitError extends Error {
  override readonly name = 'RateLimitError';
  readonly status = 429;
  readonly result: RateLimitResult;

  constructor(result: RateLimitResult, message = 'Too Many Requests') {
    super(message);
    this.result = result;
  }

  /** Seconds until the key may try again. */
  get retryAfter(): number {
    return this.result.reset;
  }

  getResponse(): Response {
    return new Response(this.message, {
      status: 429,
      headers: { ...rateLimitHeaders(this.result), 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
