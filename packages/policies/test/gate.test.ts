import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AuthorizationError,
  defineGate,
  definePolicy,
  deny,
  denyAsNotFound,
  guest,
  type AuthorizationResponse,
} from '../src/index.ts';

interface User {
  id: string;
  role: 'admin' | 'member' | 'banned';
  emailVerified: boolean;
}

interface Post {
  id: string;
  authorId: string;
  published: boolean;
}

const alice: User = { id: 'alice', role: 'member', emailVerified: true };
const bob: User = { id: 'bob', role: 'member', emailVerified: false };
const admin: User = { id: 'root', role: 'admin', emailVerified: true };
const banned: User = { id: 'mallory', role: 'banned', emailVerified: true };

const draft: Post = { id: 'p1', authorId: 'alice', published: false };
const published: Post = { id: 'p2', authorId: 'alice', published: true };

const postPolicy = definePolicy({
  before: (user: User) => (user.role === 'admin' ? true : undefined),
  view: guest((user: User | null, post: Post) => post.published || post.authorId === user?.id),
  create: (user: User) => user.emailVerified,
  update: (user: User, post: Post) => post.authorId === user.id,
  delete: (user: User, post: Post) => (post.authorId === user.id ? true : denyAsNotFound()),
  publish: async (user: User, post: Post) => {
    await Promise.resolve();
    return post.authorId === user.id && !post.published;
  },
});

const gate = defineGate({
  before: (user: User) => (user.role === 'banned' ? deny('Your account is suspended.') : undefined),
  abilities: {
    viewAdmin: (user: User) => user.role === 'admin',
    viewChangelog: guest(() => true),
  },
  policies: { post: postPolicy },
});

describe('defineGate', () => {
  it('allows the owner and denies everyone else', async () => {
    expect(await gate.forUser(alice).allows('post.update', draft)).toBe(true);
    expect(await gate.forUser(bob).allows('post.update', draft)).toBe(false);
    expect(await gate.forUser(bob).denies('post.update', draft)).toBe(true);
  });

  it('checks abilities that take no resource', async () => {
    expect(await gate.forUser(bob).allows('post.create')).toBe(false);
    expect(await gate.forUser(alice).allows('post.create')).toBe(true);
    expect(await gate.forUser(alice).allows('viewAdmin')).toBe(false);
    expect(await gate.forUser(admin).allows('viewAdmin')).toBe(true);
  });

  it('lets a policy before hook decide early', async () => {
    expect(await gate.forUser(admin).allows('post.update', draft)).toBe(true);
    expect(await gate.forUser(admin).allows('post.delete', draft)).toBe(true);
  });

  it('runs the gate before hook first, with its message', async () => {
    const response = await gate.forUser(banned).inspect('post.view', published);
    expect(response).toEqual({ allowed: false, message: 'Your account is suspended.' });
  });

  it('supports async abilities', async () => {
    expect(await gate.forUser(alice).allows('post.publish', draft)).toBe(true);
    expect(await gate.forUser(alice).allows('post.publish', published)).toBe(false);
  });

  describe('guests', () => {
    it('denies a guest with 401 without calling a normal ability', async () => {
      expect(await gate.forUser(null).inspect('post.update', draft)).toEqual({ allowed: false, status: 401 });
      await expect(gate.forUser(undefined).authorize('viewAdmin')).rejects.toMatchObject({
        status: 401,
        message: 'Unauthenticated.',
      });
    });

    it('calls abilities wrapped in guest() with a null user', async () => {
      expect(await gate.forUser(null).allows('post.view', published)).toBe(true);
      expect(await gate.forUser(null).allows('post.view', draft)).toBe(false);
      expect(await gate.forUser(null).allows('viewChangelog')).toBe(true);
    });

    it('skips before hooks that are not wrapped in guest()', async () => {
      // The gate and policy hooks read user.role, which would throw for null.
      await expect(gate.forUser(null).allows('post.view', published)).resolves.toBe(true);
    });
  });

  describe('authorize', () => {
    it('returns the response when allowed', async () => {
      await expect(gate.forUser(alice).authorize('post.update', draft)).resolves.toEqual({ allowed: true });
    });

    it('throws a 403 AuthorizationError by default', async () => {
      const error = await gate
        .forUser(bob)
        .authorize('post.update', draft)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error).toMatchObject({ status: 403, ability: 'post.update', message: 'This action is unauthorized.' });
    });

    it('uses the status and message from the denial', async () => {
      const error = (await gate
        .forUser(bob)
        .authorize('post.delete', draft)
        .catch((e: unknown) => e)) as AuthorizationError;
      expect(error.status).toBe(404);

      const banned403 = (await gate
        .forUser(banned)
        .authorize('post.view', published)
        .catch((e: unknown) => e)) as AuthorizationError;
      expect(banned403.status).toBe(403);
      expect(banned403.message).toBe('Your account is suspended.');
    });

    it('converts to an HTTP response for Void and Hono error handlers', async () => {
      const error = new AuthorizationError('post.delete', denyAsNotFound());
      const response = error.getResponse();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });
  });

  it('reports which abilities exist', () => {
    expect(gate.has('post.update')).toBe(true);
    expect(gate.has('viewAdmin')).toBe(true);
    expect(gate.has('post.before')).toBe(false);
    expect(gate.has('post.constructor')).toBe(false);
    expect(gate.has('toString')).toBe(false);
    expect(gate.has('comment.update')).toBe(false);
  });

  it('throws on an unknown ability instead of silently denying', async () => {
    const unknownAbility = 'post.archive' as 'post.update';
    await expect(gate.forUser(alice).allows(unknownAbility, draft)).rejects.toThrow('Unknown ability "post.archive"');
  });

  it('rejects policy names containing a dot', () => {
    expect(() => defineGate({ policies: { 'blog.post': postPolicy } })).toThrow(/can't contain "\."/);
  });

  it('continues past before hooks that return null or undefined, and stops on false', async () => {
    const calls: string[] = [];
    const strict = defineGate({
      before: (_user: User, ability: string) => {
        calls.push(ability);
        return ability === 'locked' ? false : null;
      },
      abilities: { open: () => true, locked: () => true },
    });
    expect(await strict.forUser(alice).allows('open')).toBe(true);
    expect(await strict.forUser(alice).allows('locked')).toBe(false);
    expect(calls).toEqual(['open', 'locked']);
  });

  it('passes the method name, not the full ability, to a policy before hook', async () => {
    const seen: string[] = [];
    const tracked = defineGate({
      policies: {
        post: definePolicy({
          before: (_user: User, ability: string) => void seen.push(ability),
          update: () => true,
        }),
      },
    });
    await tracked.forUser(alice).allows('post.update');
    expect(seen).toEqual(['update']);
  });

  it('types ability names and arguments', () => {
    const forAlice = gate.forUser(alice);
    expectTypeOf(forAlice.inspect('post.update', draft)).toEqualTypeOf<Promise<AuthorizationResponse>>();

    // Checked by `tsc` only; never called.
    const typeOnly = () => {
      // @ts-expect-error unknown ability name
      void forAlice.allows('post.archive', draft);
      // @ts-expect-error `before` is a hook, not an ability
      void forAlice.allows('post.before');
      // @ts-expect-error update needs a post
      void forAlice.allows('post.update');
      // @ts-expect-error wrong argument type
      void forAlice.allows('post.update', { id: 'x' });
      // @ts-expect-error the gate expects a User
      gate.forUser({ id: 'x' });
    };
    void typeOnly;
  });
});
