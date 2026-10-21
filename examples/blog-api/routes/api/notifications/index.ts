import { defineHandler } from 'void';
import { requireAuth } from 'void/auth';
import { inbox } from '../../../src/notifier';

// The signed-in user's unread notifications.
export const GET = defineHandler(async (c) => {
  const user = requireAuth(c);
  return { unread: await inbox.unreadCount(user.id), notifications: await inbox.unread(user.id, { limit: 20 }) };
});
