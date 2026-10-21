import { notifications } from '@schema';
import { createNotifier, databaseChannel, mailChannel } from '@trowelkit/notifications/void';
import { queues } from 'void/queues';

export const inbox = databaseChannel({ table: notifications });

export const notifier = createNotifier({
  channels: {
    // In development mail lands in Void's local inbox, so any sender works. Deployed on a
    // Void platform, Void fills in your project's sender.
    mail: mailChannel(import.meta.env.DEV ? { from: 'Trowel App <app@example.com>' } : {}),
    database: inbox,
  },
  // Deliveries run from queues/notifications.ts, and each one is retried on its own.
  queue: (message) => queues.notifications.send(message),
});
