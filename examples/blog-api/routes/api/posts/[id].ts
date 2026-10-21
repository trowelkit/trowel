import { posts } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
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
  const changes = await c.req.json<{ title?: string; published?: boolean }>();
  const [updated] = await db.update(posts).set(changes).where(eq(posts.id, post.id)).returning();
  return updated;
});

export const DELETE = defineHandler(async (c) => {
  const post = await findPostOrFail(c.req.param('id'));
  await gate.authorize('post.delete', post);
  await db.delete(posts).where(eq(posts.id, post.id));
  return c.body(null, 204);
});
