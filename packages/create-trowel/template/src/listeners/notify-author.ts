import { notifier } from '../notifier';
import { PostPublishedNotification, type Recipient } from '../notifications/post-published';

export async function notifyAuthor({ id, title, author }: { id: number; title: string; author: Recipient }) {
  await notifier.send(author, PostPublishedNotification, { id, title });
}
