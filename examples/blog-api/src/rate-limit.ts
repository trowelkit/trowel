import { createRateLimiter, durableStore } from '@trowelkit/rate-limit/void';
import { RateLimiter } from '../durable-objects/rate-limiter';

// Five new posts per user every ten seconds. Short, so the e2e script can wait out a window.
export const postLimiter = createRateLimiter({
  name: 'posts',
  limit: 5,
  window: 10,
  store: durableStore(RateLimiter),
});
