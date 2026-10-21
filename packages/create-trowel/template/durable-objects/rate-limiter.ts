import { rateLimitState } from '@trowelkit/rate-limit/void';
import { defineDurableState } from 'void/durable';

// One object per rate limit key, holding a fixed-window counter that an alarm clears.
export const RateLimiter = defineDurableState(rateLimitState);

export default RateLimiter;
