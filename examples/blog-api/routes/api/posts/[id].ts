import { posts } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { authorOf, events, PostPublished } from '../../../src/events';
import { gate } from '../../../src/gate';
import { findPostOrFail } from '../../../src/posts';

export const GET = defineHandler(async (c) => {
  const post = await findPostOrFail(c.req.param('id'));
  await gate.authorize('post.view', post);
  return post;
});

export const PATCH = defineHandler(async (c) => {
  const post = await findPostOrFail(c.req.param('id'));
  await gate.authorize('post.update', post);
  const { title, published } = await c.req.json<{ title?: string; published?: boolean }>();
  // Only these columns: the author fields must keep pointing at the real author.
  const [updated] = await db.update(posts).set({ title, published }).where(eq(posts.id, post.id)).returning();
  if (updated!.published && !post.published) {
    await events.dispatch(PostPublished, { postId: updated!.id, title: updated!.title, author: authorOf(updated!) });
  }
  return updated;
});

export const DELETE = defineHandler(async (c) => {
  const post = await findPostOrFail(c.req.param('id'));
  await gate.authorize('post.delete', post);
  await db.delete(posts).where(eq(posts.id, post.id));
  return c.body(null, 204);
});
