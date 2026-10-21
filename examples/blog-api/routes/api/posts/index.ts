import { posts } from '@schema';
import { userOrIp } from '@trowelkit/rate-limit/void';
import { defineHandler } from 'void';
import { requireAuth } from 'void/auth';
import { db } from 'void/db';
import { authorOf, events, PostPublished } from '../../../src/events';
import { gate } from '../../../src/gate';
import { postLimiter } from '../../../src/rate-limit';

export const GET = defineHandler(async () => {
  const all = await db.select().from(posts);
  const visible = [];
  for (const post of all) {
    if (await gate.allows('post.view', post)) visible.push(post);
  }
  return visible;
});

export const POST = defineHandler(postLimiter.middleware({ key: userOrIp }), async (c) => {
  await gate.authorize('post.create');
  const user = requireAuth(c);
  const { title, published = false } = await c.req.json<{ title: string; published?: boolean }>();
  const [post] = await db
    .insert(posts)
    .values({ title, published, authorId: user.id, authorName: user.name, authorEmail: user.email })
    .returning();
  if (post!.published) {
    await events.dispatch(PostPublished, { postId: post!.id, title: post!.title, author: authorOf(post!) });
  }
  return c.json(post, 201);
});
