import { posts } from '@schema';
import { defineHandler, type InferProps } from 'void';
import { getUser, requireAuth } from 'void/auth';
import { db, desc, eq, or } from 'void/db';
import { createInsertSchema } from 'void/drizzle-zod';
import { gate } from '../src/gate';
import { postLimiter } from '../src/rate-limit';

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async () => {
  const user = getUser();
  // The same rule as the post.view policy, as a query: published posts, plus your drafts.
  const visible = user ? or(eq(posts.published, true), eq(posts.authorId, user.id)) : eq(posts.published, true);
  return {
    posts: await db.select().from(posts).where(visible).orderBy(desc(posts.createdAt)),
    canCreate: await gate.allows('post.create'),
  };
});

const newPost = createInsertSchema(posts, {
  title: (schema) => schema.trim().min(1, 'Give your post a title.').max(200),
  body: (schema) => schema.max(10_000),
}).pick({ title: true, body: true });

export const action = defineHandler.withValidator({ body: newPost })(async (c, { body }) => {
  await gate.authorize('post.create');
  const user = requireAuth(c);
  // Over the limit, this throws a 429 that the form shows as its error.
  await postLimiter.enforce(user.id);
  const [post] = await db
    .insert(posts)
    .values({ ...body, authorId: user.id, authorName: user.name, createdAt: new Date() })
    .returning();
  return c.redirect(`/posts/${post!.id}`);
});
