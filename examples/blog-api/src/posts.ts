import { posts } from '@schema';
import { HTTPException } from 'hono/http-exception';
import { db, eq } from 'void/db';

export async function findPostOrFail(id: string | undefined) {
  const [post] = id ? await db.select().from(posts).where(eq(posts.id, Number(id))) : [];
  if (!post) throw new HTTPException(404, { message: 'Not Found' });
  return post;
}
