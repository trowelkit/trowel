import { posts } from '@schema';
import { defineHandler } from 'void';
import { count, db } from 'void/db';
import { gate } from '../../../src/gate';

export const GET = defineHandler(gate.middleware('viewStats'), async () => {
  const [row] = await db.select({ posts: count() }).from(posts);
  return { posts: row?.posts ?? 0 };
});
