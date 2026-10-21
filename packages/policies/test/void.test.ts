import { authContext } from 'void/auth';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError, defineGate, definePolicy, guest } from '../src/void.ts';

interface User {
  id: string;
  name: string;
}

interface Doc {
  ownerId: string;
}

const gate = defineGate({
  abilities: {
    viewDashboard: (user: User) => user.name !== 'guest-like',
    viewStatus: guest(() => true),
  },
  policies: {
    doc: definePolicy({
      edit: (user: User, doc: Doc) => doc.ownerId === user.id,
    }),
  },
});

const alice = { id: 'alice', name: 'Alice' };

/** Runs `fn` the way Void's auth middleware runs a request. */
function asRequest<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  return authContext.run({ user, state: null } as never, fn);
}

describe('defineGate (Void)', () => {
  it("checks the current request's user", async () => {
    await asRequest(alice, async () => {
      expect(await gate.allows('doc.edit', { ownerId: 'alice' })).toBe(true);
      expect(await gate.denies('doc.edit', { ownerId: 'bob' })).toBe(true);
    });
  });

  it('treats a request without a session as a guest', async () => {
    await asRequest(null, async () => {
      await expect(gate.authorize('viewDashboard')).rejects.toMatchObject({ status: 401 });
      expect(await gate.allows('viewStatus')).toBe(true);
    });
  });

  it('still checks other users with forUser', async () => {
    await asRequest(null, async () => {
      expect(await gate.forUser(alice).allows('doc.edit', { ownerId: 'alice' })).toBe(true);
    });
  });

  it('loads the user from a custom resolver', async () => {
    const withRoles = defineGate(
      { abilities: { manage: (user: User & { role: string }) => user.role === 'owner' } },
      { user: async () => ({ ...alice, role: 'owner' }) },
    );
    expect(await withRoles.allows('manage')).toBe(true);
  });

  describe('middleware', () => {
    it('calls next when the ability is allowed', async () => {
      const next = vi.fn(async () => {});
      await asRequest(alice, () => gate.middleware('viewDashboard')({}, next));
      expect(next).toHaveBeenCalledOnce();
    });

    it('throws an AuthorizationError and skips next when denied', async () => {
      const next = vi.fn(async () => {});
      const error = await asRequest(null, () => gate.middleware('viewDashboard')({}, next)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(next).not.toHaveBeenCalled();
    });

    it('only accepts abilities without arguments', () => {
      // Checked by `tsc` only; never called.
      const typeOnly = () => {
        // @ts-expect-error doc.edit needs a document, so it can't guard a route
        gate.middleware('doc.edit');
      };
      void typeOnly;
    });
  });
});
