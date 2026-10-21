import { activity } from '@schema';
import { db } from 'void/db';

export async function recordPublication({ postId }: { postId: number }) {
  await db.insert(activity).values({ type: 'post.published', postId, createdAt: new Date() });
}
