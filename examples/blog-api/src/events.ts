import { createEventBus, defineEvent } from '@trowelkit/events';
import { queues } from 'void/queues';
import { notifyAuthor } from './listeners/notify-author';
import { recordPublication } from './listeners/record-publication';
import type { Author } from './notifications/post-live';

export const PostPublished = defineEvent<{ postId: number; title: string; author: Author }>('post.published');

export const events = createEventBus({
  queue: (message) => queues.events.send(message),
});

// Runs during dispatch. The notifier queues the mail and database deliveries itself.
events.on(PostPublished, notifyAuthor);
// Runs from queues/events.ts, after the request that published the post has returned.
events.on(PostPublished, recordPublication, { queued: true });

export function authorOf(post: { authorId: string; authorName: string; authorEmail: string }): Author {
  return { id: post.authorId, name: post.authorName, email: post.authorEmail };
}
