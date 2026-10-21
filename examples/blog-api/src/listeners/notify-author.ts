import { notifier } from '../notifier';
import { PostLive, type Author } from '../notifications/post-live';

export async function notifyAuthor({ postId, title, author }: { postId: number; title: string; author: Author }) {
  await notifier.send(author, PostLive, { postId, title });
}
