import { defineNotification } from '@trowelkit/notifications';

export interface Author {
  id: string;
  name: string;
  email: string;
}

export const PostLive = defineNotification('post.live', {
  mail: (author: Author, post: { postId: number; title: string }) => ({
    subject: `Your post is live: ${post.title}`,
    text: `Hi ${author.name}, "${post.title}" is now public.`,
  }),
  database: (_author, post) => ({ postId: post.postId, title: post.title }),
});
