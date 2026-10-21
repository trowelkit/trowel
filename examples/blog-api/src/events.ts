import { createEventBus, defineEvent } from '@trowelkit/events';
import { queues } from 'void/queues';
import { recordPublication } from './listeners/record-publication';

export const PostPublished = defineEvent<{ postId: number; authorId: string; title: string }>('post.published');

export const events = createEventBus({
  queue: (message) => queues.events.send(message),
});

// Runs from queues/events.ts, after the request that published the post has returned.
events.on(PostPublished, recordPublication, { queued: true });
