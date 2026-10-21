import { defineMiddleware } from 'void';
import { getUser, type AuthUser } from 'void/auth';
import { inbox } from '../src/notifications';

declare module 'void' {
  interface CloudContextVariables {
    shared: { user: AuthUser | null; unreadNotifications: number };
  }
}

// Data every page can read with useShared(): the signed-in user and their unread count.
export default defineMiddleware(async (c, next) => {
  const user = getUser();
  c.set('shared', { user, unreadNotifications: user ? await inbox.unreadCount(user.id) : 0 });
  await next();
});
