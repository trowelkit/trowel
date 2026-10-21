import type { PayloadOf } from '@trowelkit/events';
import type { PostPublished } from '../events/post-published';
import { notifier } from '../notifications';
import { PostPublishedNotification } from '../notifications/post-published';

export async function notifyAuthor({ id, title, author }: PayloadOf<typeof PostPublished>) {
  await notifier.send(author, PostPublishedNotification, { id, title });
}
