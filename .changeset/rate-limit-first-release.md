---
'@trowelkit/rate-limit': minor
---

First release. Fixed-window rate limiting with `createRateLimiter`: `hit`, `enforce`, `peek`, `reset` and route middleware that sets `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` and throws a 429 `RateLimitError` with `Retry-After`. The `/void` entry adds `rateLimitState` for a Durable State object per key, cleared by an alarm, and `durableStore`. Includes a memory store for tests.
