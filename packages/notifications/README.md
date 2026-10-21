# @trowelkit/notifications

Notifications over mail, database and custom channels for [Void](https://void.cloud) apps.

```sh
npm install @trowelkit/notifications
```

## Define a notification

A notification has a name and a builder for each channel it can go out on.

```ts
// src/notifications/invoice-paid.ts
import { defineNotification } from '@trowelkit/notifications';
import type { User } from '../users';

export const InvoicePaid = defineNotification('invoice.paid', {
  mail: (user: User, invoice: { number: number; total: string }) => ({
    subject: `Invoice ${invoice.number} is paid`,
    text: `Hi ${user.name}, we received ${invoice.total}. Thanks!`,
  }),
  database: (user, invoice) => ({ number: invoice.number }),
});
```

The first parameter of a builder is the recipient and the second is the payload. Both types come from the builders, or pass them explicitly: `defineNotification<User, Invoice>(...)`.

By default a notification goes out on every channel it has a builder for. Add `via` to choose per recipient:

```ts
export const Digest = defineNotification('digest', {
  via: (user: User) => (user.wantsEmail ? ['mail', 'database'] : ['database']),
  mail: (user) => ({ subject: 'Your weekly digest', html: renderDigest(user) }),
  database: () => ({}),
});
```

The name identifies the notification in queued messages and stored rows, so keep it stable once deployed.

## Create a notifier

```ts
// src/notifier.ts
import { notifications } from '@schema';
import { createNotifier, databaseChannel, mailChannel } from '@trowelkit/notifications/void';
import { queues } from 'void/queues';

export const inbox = databaseChannel({ table: notifications });

export const notifier = createNotifier({
  channels: {
    mail: mailChannel({ from: 'Acme <acme+noreply@mail.example.com>' }),
    database: inbox,
  },
  // Optional. With a queue, every delivery is retried on its own when it fails.
  queue: (message) => queues.notifications.send(message),
});
```

With a queue, add its consumer:

```ts
// queues/notifications.ts
import type { QueuedNotificationMessage } from '@trowelkit/notifications';
import { defineQueue } from 'void';
import { notifier } from '../src/notifier';

export default defineQueue<QueuedNotificationMessage>(notifier.consume);
```

Use a queue of its own, because the consumer acknowledges messages it doesn't recognize.

## Send

```ts
await notifier.send(user, InvoicePaid, { number: 42, total: '$90' });
await notifier.send([alice, bob], Digest);
```

`send` builds every message right away, then queues one delivery per recipient and channel when the notifier has a queue, or delivers them immediately when it doesn't. `sendNow` always delivers immediately. It attempts every delivery, then throws the first error, or an `AggregateError` when several failed.

Queued deliveries carry the recipient and the built message through Cloudflare Queues, so keep both serializable.

## Mail

`mailChannel()` sends the `mail` builder's message with Void's `sendEmail`. During `void dev`, messages land in the local inbox at `/__void/inbox`.

| Option | Does |
|---|---|
| `from` | The sender for messages that don't set `from`. Defaults to Void's project sender |
| `to(recipient)` | Picks the address. Defaults to `recipient.email`, with `recipient.name` as the display name |
| `idempotent` | Sends an idempotency key made from the notification id, so a retried send isn't delivered twice. Needs a Void platform; the native Cloudflare binding rejects keys |

A mail builder returns `subject` plus `text`, `html` or both, and can set `to`, `from`, `replyTo`, `cc`, `bcc` and `headers`.

`sendEmail` returns failures instead of throwing. The mail channel throws a `MailDeliveryError` for them, so the queue retries the delivery. Failures that a retry can't fix, such as an invalid or unverified address, aren't retried. `OUTCOME_UNKNOWN` is retried only with `idempotent: true`, because the first attempt may have been sent.

Void turns on email when your app imports `void/email`. If only this package sends mail, turn it on in `void.json`:

```json
{ "inference": { "bindings": { "email": true } } }
```

## Database

Add the table to `db/schema.ts`, then run `void db push` locally or `void db generate` for a migration:

```ts
// db/schema.ts
import { notificationsTable } from '@trowelkit/notifications/void';

export const notifications = notificationsTable(); // or notificationsTable('user_notifications')
```

`databaseChannel({ table })` stores the `database` builder's data as JSON, under `recipient.id` (change it with `recipientId`). It uses Void's `db` unless you pass `db`. A retried delivery doesn't create a second row. The table is for D1.

The channel also reads a recipient's notifications. Each method takes the recipient or its id:

```ts
await inbox.unread(user, { limit: 20 }); // newest first
await inbox.all(user);
await inbox.unreadCount(user);
await inbox.markAsRead(user, [id]); // or markAsRead(user) for all of them
```

Rows have `id`, `type` (the notification's name), `notifiableId`, `data`, `readAt` and `createdAt`.

## Webhooks

`webhookChannel()` posts the builder's message as JSON, which suits chat apps' incoming webhooks. Name the channel whatever you like; the notification's builder uses the same name.

```ts
import { webhookChannel } from '@trowelkit/notifications';
import { env } from 'void/env';

export const notifier = createNotifier({
  channels: {
    chat: webhookChannel({ url: () => env.CHAT_WEBHOOK_URL }),
  },
});

export const Deployed = defineNotification('deployed', {
  chat: (_team: Team, deploy: { version: string }) => ({ text: `Deployed ${deploy.version}` }),
});
```

`url` is a string or a function of the recipient, so each team can have its own webhook. Return nothing to skip a recipient without retrying. Pass `headers` for authorization.

By default the channel only calls `https` URLs with a host name, not an IP address or a local name (`isPublicHttpsUrl`). It doesn't follow redirects, and gives up after `timeout` seconds (10). That default looks at the URL only and can't see where a name resolves, so it isn't SSRF protection on its own: if people can enter their own webhook URLs, pass `allowUrl` to accept only the services you support, for example `(url) => url.hostname === 'hooks.slack.com'`.

Rate limits (429), server errors (5xx), timeouts and network errors are retried; other answers aren't. Errors never include the URL, which often holds a secret.

## Custom channels

A channel is an object with a `send(delivery)` method. The notification's builder for that channel's name makes `delivery.message`.

```ts
import { DeliveryError, type Channel } from '@trowelkit/notifications';

const chat: Channel<{ text: string }, User> = {
  async send({ recipient, message }) {
    const response = await fetch(recipient.chatWebhook, { method: 'POST', body: JSON.stringify(message) });
    if (response.status === 404) throw new DeliveryError('Webhook is gone.', { retryable: false });
    if (!response.ok) throw new Error(`Chat returned ${response.status}`);
  },
};

const notifier = createNotifier({ channels: { chat } });
const Deployed = defineNotification('deployed', { chat: (user: User) => ({ text: 'Deployed!' }) });
```

Throw to fail a delivery. A queued delivery is retried, unless the error is a `DeliveryError` with `retryable: false`. Failures are reported to `onQueuedError`, or `console.error` by default.

## Test with a fake

```ts
const fake = notifier.fake();

await payInvoice(42);

fake.assertSentTo(user, InvoicePaid, (sent) => sent.payload.number === 42);
fake.assertSent(InvoicePaid, (sent) => sent.messages.mail?.subject === 'Invoice 42 is paid');
fake.assertSentTimes(InvoicePaid, 1);
fake.assertNotSent(Digest);
fake.restore();
```

While faked, sends are recorded with the channels they would use and their built messages, and nothing is delivered. Pass `{ only: [InvoicePaid] }` to fake some notifications and deliver the rest. Recipients match when they're the same object or have the same `id`. Failed assertions throw an `Error`, so they work with any test runner.

## API

| Export | Does |
|---|---|
| `defineNotification(name, builders)` | Declares a notification |
| `createNotifier({ channels, queue?, onQueuedError? })` | Creates a notifier |
| `notifier.send(recipients, notification, payload?)` | Queues or delivers |
| `notifier.sendNow(recipients, notification, payload?)` | Delivers now |
| `notifier.consume(batch)` | Queue consumer |
| `notifier.fake({ only? })` | Records sends for tests |
| `webhookChannel({ url, headers?, allowUrl?, timeout?, fetch? })` | Posts the message as JSON to a webhook |
| `isPublicHttpsUrl(url)` | The webhook channel's default URL check |
| `DeliveryError` | Fails a delivery, optionally without retries |
| `mailChannel(options?)` (`/void`) | Mail through `sendEmail` |
| `databaseChannel({ table, db?, recipientId? })` (`/void`) | Stored notifications, with `unread`, `all`, `unreadCount` and `markAsRead` |
| `notificationsTable(name?)` (`/void`) | The D1 table for the database channel |
