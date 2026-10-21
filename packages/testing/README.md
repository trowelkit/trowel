# @trowelkit/testing

Test queues and helpers for [Void](https://void.cloud) apps and Trowel packages. They run queued work in plain unit tests, without Void or Cloudflare.

```sh
npm install -D @trowelkit/testing
```

## Test queues

`createTestQueue()` collects what your code sends and hands it to a consumer when you `drain` it, the way Void's queues deliver batches.

```ts
import { createEventBus, type QueuedEventMessage } from '@trowelkit/events';
import { createTestQueue } from '@trowelkit/testing';

const queue = createTestQueue<QueuedEventMessage>();
const events = createEventBus({ queue: queue.send });
events.on(OrderShipped, sendShippingEmail, { queued: true });

await events.dispatch(OrderShipped, { orderId: 42 });
queue.assertSent((message) => message.event === 'order.shipped');

const { acked, failed, errors } = await queue.drain(events.consume);
```

`drain` follows Void's delivery rules:

- Messages arrive in batches of up to `maxBatchSize` (default 10).
- The first `ack()` or `retry()` for a message wins. A message without a decision is acknowledged when the consumer returns, and retried when it throws.
- A retried message is delivered again, with `attempts` counting up, until it has used `maxRetries` retries (default 3). Then it lands in `failed`.
- Messages sent while draining are delivered in the same call, so chains of queues settle in one `drain`.

It accepts any consumer: a `defineQueue` handler (the default export of `queues/<name>.ts`), `events.consume`, or `notifier.consume`.

### Replace an app's queue

An app sends through Void's `queues` proxy. Mock `void/queues` to send to test queues instead. Vitest runs `vi.mock` before the file's imports, so create the queues inside the factory:

```ts
import type { QueuedEventMessage } from '@trowelkit/events';
import type { TestQueue } from '@trowelkit/testing';
import { vi } from 'vitest';
import { queues } from 'void/queues';
import { events } from '../src/events';

vi.mock('void/queues', async () => {
  const { createTestQueue } = await import('@trowelkit/testing');
  return { queues: { events: createTestQueue({ name: 'events' }) } };
});

const eventsQueue = queues.events as unknown as TestQueue<QueuedEventMessage>;
```

Test queues have `send` and `sendBatch`, like the queue producers Void provides.

## Test a consumer directly

`testBatch(bodies)` builds one batch and records what the consumer decided for each message:

```ts
import { testBatch } from '@trowelkit/testing';

const { batch, decisions } = testBatch([message], { attempts: [3] });
await notifier.consume(batch);
expect(decisions).toEqual([{ type: 'retry' }]);
```

## Other fakes

Events and notifications have fakes of their own, which record what was dispatched or sent without running anything:

```ts
const sent = notifier.fake();
await events.dispatch(OrderShipped, { orderId: 42 });
await queue.drain(events.consume);
sent.assertSentTo(customer, OrderShippedNotification);
```

For mail, use Void's `createEmailTestHarness` from `void/email/testing`.

## API

| Export | Does |
|---|---|
| `createTestQueue({ name?, maxRetries?, maxBatchSize? })` | A queue that collects messages |
| `queue.send(body)`, `queue.sendBatch(messages)` | Send, like Void's queue producers |
| `queue.drain(consumer, { env? })` | Deliver until empty; returns `{ acked, failed, errors, batches }` |
| `queue.sent`, `queue.pending` | Every body sent, and the ones not yet delivered |
| `queue.assertSent(predicate?)`, `assertSentTimes(n, predicate?)`, `assertNothingSent()` | Assertions that throw an `Error` |
| `queue.clear()` | Forget everything |
| `testBatch(bodies, { queue?, attempts? })` | One batch, plus the consumer's `decisions` |
