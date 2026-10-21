import { posts } from '@schema';
import { defineHandler, type InferProps } from 'void';
import { requireAuth } from 'void/auth';
import { db, eq } from 'void/db';
import { events, PostPublished } from '../../src/events';
import { gate } from '../../src/gate';
import { findPostOrFail } from '../../src/posts';

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const post = await findPostOrFail(c.req.param('id'));
  await gate.authorize('post.view', post);
  return {
    post,
    can: { publish: await gate.allows('post.publish', post), delete: await gate.allows('post.delete', post) },
  };
});

export const actions = {
  publish: defineHandler(async (c) => {
    const post = await findPostOrFail(c.req.param('id'));
    await gate.authorize('post.publish', post);
    const user = requireAuth(c);
    await db.update(posts).set({ published: true }).where(eq(posts.id, post.id));
    // The author's notification goes out from a queued listener (see src/events.ts).
    await events.dispatch(PostPublished, {
      id: post.id,
      title: post.title,
      author: { id: user.id, name: user.name, email: user.email },
    });
    return c.redirect(`/posts/${post.id}`);
  }),
  delete: defineHandler(async (c) => {
    const post = await findPostOrFail(c.req.param('id'));
    await gate.authorize('post.delete', post);
    await db.delete(posts).where(eq(posts.id, post.id));
    return c.redirect('/');
  }),
};
