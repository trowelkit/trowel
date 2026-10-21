import { defineNotification } from '@trowelkit/notifications';

export interface Recipient {
  id: string;
  name: string;
  email: string;
}

export const PostPublishedNotification = defineNotification('post.published', {
  mail: (user: Recipient, post: { id: number; title: string }) => ({
    subject: `Your post "${post.title}" is live`,
    text: `Hi ${user.name},\n\n"${post.title}" is now published for everyone to read.`,
  }),
  database: (_user, post) => ({ postId: post.id, title: post.title }),
});
