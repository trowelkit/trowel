import { defineGate } from '@trowelkit/policies/void';
import { getUser, type AuthUser } from 'void/auth';
import post from './policies/post';

export type AppUser = AuthUser & { isAdmin: boolean };

// A real app would read roles from its own table. The example treats one address as the admin.
function currentUser(): AppUser | null {
  const user = getUser();
  return user && { ...user, isAdmin: user.email === 'admin@example.com' };
}

export const gate = defineGate(
  {
    abilities: {
      viewStats: (user: AppUser) => user.isAdmin,
    },
    policies: { post },
  },
  { user: currentUser },
);
