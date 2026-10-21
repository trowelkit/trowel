---
'@trowelkit/notifications': minor
---

First release. `defineNotification` with a builder per channel, and `createNotifier` with `send` (queued when the notifier has a queue) and `sendNow`. The `/void` entry adds a mail channel on Void's `sendEmail`, which throws for failed sends so the queue retries them, and a D1 database channel with `notificationsTable()` and `unread`, `all`, `unreadCount` and `markAsRead`. Includes a fake with assertions for tests.
