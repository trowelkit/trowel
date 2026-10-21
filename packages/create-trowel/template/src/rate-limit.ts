import { createRateLimiter, durableStore } from '@trowelkit/rate-limit/void';
import { RateLimiter } from '../durable-objects/rate-limiter';

// Five new posts per user per minute.
export const postLimiter = createRateLimiter({
  name: 'posts',
  limit: 5,
  window: 60,
  store: durableStore(RateLimiter),
});
