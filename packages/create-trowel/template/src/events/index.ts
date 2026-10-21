import { createEventBus } from '@trowelkit/events';
import { queues } from 'void/queues';
import { notifyAuthor } from '../listeners/notify-author';
import { PostPublished } from './post-published';

export { PostPublished };

export const events = createEventBus({
  // Needed for queued listeners, which run from queues/events.ts.
  queue: (message) => queues.events.send(message),
});

// Queued: publishing returns right away and the listener runs in the background.
events.on(PostPublished, notifyAuthor, { queued: true });
