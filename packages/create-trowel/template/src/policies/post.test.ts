import type { Post } from '@schema';
import type { AuthUser } from 'void/auth';
import { describe, expect, it } from 'vitest';
import post from './post';

const user = (id: string) => ({ id, name: id, email: `${id}@example.com` }) as AuthUser;
const ann = user('ann');
const ben = user('ben');

const draft: Post = {
  id: 1,
  title: 'Draft',
  body: '',
  authorId: 'ann',
  authorName: 'ann',
  published: false,
  createdAt: new Date(),
};
const published: Post = { ...draft, published: true };

// Abilities are plain functions, so they can be tested without a request.
describe('post policy', () => {
  it('shows drafts only to their author', () => {
    expect(post.view(ann, draft)).toBe(true);
    expect(post.view(ben, draft)).toBe(false);
    expect(post.view(null, draft)).toBe(false);
    expect(post.view(null, published)).toBe(true);
  });

  it('lets only the author publish, once', () => {
    expect(post.publish(ann, draft)).toBe(true);
    expect(post.publish(ben, draft)).toBe(false);
    expect(post.publish(ann, published)).toBe(false);
  });

  it("answers other people's deletes with a 404", () => {
    expect(post.delete(ann, draft)).toBe(true);
    expect(post.delete(ben, draft)).toEqual({ allowed: false, status: 404 });
  });
});
