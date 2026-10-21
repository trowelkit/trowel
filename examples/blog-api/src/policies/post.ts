import { definePolicy, denyAsNotFound, guest } from '@trowelkit/policies';
import type { Post } from '@schema';
import type { AppUser } from '../gate';

export default definePolicy({
  before: (user: AppUser) => (user.isAdmin ? true : undefined),

  view: guest((user: AppUser | null, post: Post) => post.published || post.authorId === user?.id),
  // Any signed-in user. Guests get a 401 before this runs.
  create: (_user: AppUser) => true,
  update: (user: AppUser, post: Post) => post.authorId === user.id,
  // Other people's drafts answer 404, so their existence isn't revealed.
  delete: (user: AppUser, post: Post) => (post.authorId === user.id ? true : denyAsNotFound()),
});
