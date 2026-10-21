# @trowelkit/rate-limit

Fixed-window rate limiting for [Void](https://void.cloud) apps, with a Durable State object per key.

```sh
npm install @trowelkit/rate-limit
```

## Set up the Durable State

Each key's counter lives in its own Durable State object. Add the module:

```ts
// durable-objects/rate-limiter.ts
import { rateLimitState } from '@trowelkit/rate-limit/void';
import { defineDurableState } from 'void/durable';

export const RateLimiter = defineDurableState(rateLimitState);
export default RateLimiter;
```

Void provisions the object for local development and deploys. Commit `void.lock.json` when Void adds it.

## Create a limiter

```ts
// src/rate-limit.ts
import { createRateLimiter, durableStore } from '@trowelkit/rate-limit/void';
import { RateLimiter } from '../durable-objects/rate-limiter';

export const postLimiter = createRateLimiter({
  name: 'posts', // keeps this limiter's keys apart from others in the same store
  limit: 10, // hits per window
  window: 60, // seconds
  store: durableStore(RateLimiter),
});
```

A key's window opens on its first hit and lasts `window` seconds. When it ends, an alarm clears the object, and the next hit opens a new window.

## Limit a route

```ts
// routes/api/posts/index.ts
import { userOrIp } from '@trowelkit/rate-limit/void';
import { defineHandler } from 'void';
import { postLimiter } from '../../../src/rate-limit';

export const POST = defineHandler(postLimiter.middleware({ key: userOrIp }), async (c) => {
  // ...
});
```

The middleware counts every request, then sets these headers on the response:

| Header | Value |
|---|---|
| `RateLimit-Limit` | The limit |
| `RateLimit-Remaining` | Hits left in the window |
| `RateLimit-Reset` | Seconds until the window resets |

Over the limit, it throws a `RateLimitError` instead of calling the handler. The error implements `getResponse()`, so Void answers with a `429 Too Many Requests` that has the same headers plus `Retry-After`.

`key` picks what a request counts against:

- By default, the client IP from Cloudflare's `CF-Connecting-IP` header. Requests without it share one count.
- `userOrIp` (from `/void`) uses the signed-in user's id, and the IP for guests.
- Any function of the request context, such as `(c) => c.req.header('x-api-key')`. Return `null` or `undefined` to skip the limit for a request.

Pass `cost` to count a request as more than one hit.

## Use it directly

```ts
const result = await postLimiter.hit(user.id); // { allowed, limit, remaining, reset, resetAt }
if (!result.allowed) return c.json({ error: 'Slow down' }, 429);

await loginLimiter.enforce(email); // throws a RateLimitError over the limit
await loginLimiter.reset(email); // e.g. after a successful sign-in
await postLimiter.peek(user.id); // the current state, without counting
```

`reset` is in seconds and `resetAt` in milliseconds since the epoch. `rateLimitHeaders(result)` returns the headers for your own responses.

## Test with the memory store

```ts
import { createRateLimiter, memoryStore } from '@trowelkit/rate-limit';

const limiter = createRateLimiter({ name: 'posts', limit: 2, window: 60, store: memoryStore() });
```

The memory store keeps counts in the current isolate only, so use it for tests, not production. Combine it with fake timers to move through windows.

## API

| Export | Does |
|---|---|
| `createRateLimiter({ name, limit, window, store })` | Creates a limiter |
| `limiter.hit(key, cost?)` | Counts a hit and returns the result |
| `limiter.enforce(key, cost?)` | Like `hit`, but throws a `RateLimitError` over the limit |
| `limiter.peek(key)` | The result without counting |
| `limiter.reset(key)` | Clears the key's window |
| `limiter.middleware({ key?, cost? })` | Route middleware |
| `RateLimitError` | 429 error with `getResponse()` and `retryAfter` |
| `rateLimitHeaders(result)` | The rate limit headers for a result |
| `clientIp(c)` | The client IP, or `'unknown'` |
| `memoryStore()` | In-memory store for tests |
| `rateLimitState` (`/void`) | Pass to `defineDurableState` |
| `durableStore(RateLimiter)` (`/void`) | Store backed by that Durable State |
| `userOrIp(c)` (`/void`) | Middleware key: user id, or IP for guests |
