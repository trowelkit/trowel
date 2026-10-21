import { defineHandler, type InferProps } from 'void';
import { getUser, requireAuth } from 'void/auth';
import { inbox } from '../src/notifier';

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(async (c) => {
  const user = getUser();
  if (!user) return c.redirect('/sign-in');
  return { notifications: await inbox.all(user.id, { limit: 50 }) };
});

// Marks all of the user's notifications as read.
export const action = defineHandler(async (c) => {
  await inbox.markAsRead(requireAuth(c).id);
});
