import { defineHandler } from 'void';
import { requireAuth } from 'void/auth';
import { inbox } from '../../../src/notifier';

// Marks the given notifications as read, or all of them when no ids are sent.
export const POST = defineHandler(async (c) => {
  const user = requireAuth(c);
  const { ids } = await c.req.json<{ ids?: string[] }>().catch(() => ({ ids: undefined }));
  return { marked: await inbox.markAsRead(user.id, ids) };
});
