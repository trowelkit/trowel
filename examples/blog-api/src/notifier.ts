import { notifications } from '@schema';
import { createNotifier, databaseChannel, mailChannel } from '@trowelkit/notifications/void';
import { queues } from 'void/queues';
import type { Author } from './notifications/post-live';

export const inbox = databaseChannel<Author>({ table: notifications });

export const notifier = createNotifier({
  channels: {
    mail: mailChannel<Author>({ from: 'Blog <blog@example.com>' }),
    database: inbox,
  },
  // Every delivery goes through queues/notifications.ts, so a failed send is retried.
  queue: (message) => queues.notifications.send(message),
});
