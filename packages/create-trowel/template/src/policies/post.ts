import { definePolicy, denyAsNotFound, guest } from '@trowelkit/policies';
import type { AuthUser } from 'void/auth';
import type { Post } from '@schema';

export default definePolicy({
  // Anyone can read published posts; drafts only their author.
  view: guest((user: AuthUser | null, post: Post) => post.published || post.authorId === user?.id),
  // Any signed-in user. Guests are turned away with a 401 before this runs.
  create: (_user: AuthUser) => true,
  publish: (user: AuthUser, post: Post) => post.authorId === user.id && !post.published,
  // Other people's posts answer 404, so a guessed id reveals nothing.
  delete: (user: AuthUser, post: Post) => (post.authorId === user.id ? true : denyAsNotFound()),
});
