import { createEventBus, defineEvent } from '@trowelkit/events';
import { queues } from 'void/queues';
import { notifyAuthor } from './listeners/notify-author';
import type { Recipient } from './notifications/post-published';

export const PostPublished = defineEvent<{ id: number; title: string; author: Recipient }>('post.published');

export const events = createEventBus({
  // Needed for queued listeners, which run from queues/events.ts.
  queue: (message) => queues.events.send(message),
});

// Queued: publishing returns right away and the listener runs in the background.
events.on(PostPublished, notifyAuthor, { queued: true });
