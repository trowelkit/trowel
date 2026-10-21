# @trowelkit/events

Events with sync or queued listeners for [Void](https://void.cloud) apps.

```sh
npm install @trowelkit/events
```

## Define events

```ts
// src/events/order-shipped.ts
import { defineEvent } from '@trowelkit/events';

export const OrderShipped = defineEvent<{ orderId: number }>('order.shipped');
export const CacheCleared = defineEvent('cache.cleared'); // no payload
```

The name identifies the event in queued messages, so keep it stable once deployed.

## Create a bus and listen

```ts
// src/events.ts
import { createEventBus } from '@trowelkit/events';
import { queues } from 'void/queues';
import { OrderShipped } from './events/order-shipped';

export const events = createEventBus({
  // Needed only for queued listeners.
  queue: (message) => queues.events.send(message),
});

// Runs during dispatch.
events.on(OrderShipped, async ({ orderId }) => {
  await markOrderShipped(orderId);
});

// Runs later, from the queue consumer below.
events.on(OrderShipped, sendShippingEmail, { queued: true });
```

Queued listeners need a stable name: a named function, or `{ name: '...' }`. Their payloads travel through Cloudflare Queues, so keep them serializable.

For queued listeners, add the consumer:

```ts
// queues/events.ts
import { defineQueue } from 'void';
import type { QueuedEventMessage } from '@trowelkit/events';
import { events } from '../src/events';

export default defineQueue<QueuedEventMessage>(events.consume);
```

## Dispatch

```ts
await events.dispatch(OrderShipped, { orderId: 42 });
await events.dispatch(CacheCleared);
```

Listeners run in registration order. A sync listener's error stops the dispatch and is thrown to the caller. A queued listener's error is reported (with `onQueuedError`, or `console.error` by default) and the message is retried.

## Test with a fake

```ts
const fake = events.fake();

await placeOrder();

fake.assertDispatched(OrderShipped, (p) => p.orderId === 42);
fake.assertDispatchedTimes(OrderShipped, 1);
fake.assertNotDispatched(CacheCleared);
fake.restore();
```

While faked, dispatches are recorded and listeners don't run. Pass `{ only: [OrderShipped] }` to fake some events and let the rest run normally. Failed assertions throw an `Error`, so they work with any test runner.

## API

| Function | Does |
|---|---|
| `defineEvent<P>(name)` | Declares an event with payload type `P` |
| `createEventBus({ queue?, onQueuedError? })` | Creates a bus |
| `events.on(event, listener, { queued?, name? })` | Registers a listener; returns a function that removes it |
| `events.dispatch(event, payload?)` | Runs and enqueues listeners |
| `events.consume(batch)` | Queue consumer for queued listeners |
| `events.hasListeners(event)` | Whether any listener is registered |
| `events.fake({ only? })` | Records dispatches for tests |
