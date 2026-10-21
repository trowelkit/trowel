import type { EventDefinition } from './event.ts';
import { createFake, type EventFake, type FakeOptions } from './fake.ts';
import { isQueuedEventMessage, type QueueBatchLike, type QueuedEventMessage } from './queue.ts';

export type Listener<P> = (payload: P, event: EventDefinition<P>) => unknown;

export interface ListenOptions {
  /** Run the listener later from the queue consumer instead of during `dispatch`. */
  queued?: boolean;
  /**
   * Identifies the listener in queued messages. Defaults to the function's name.
   * Queued listeners need one, and it should stay stable across deploys.
   */
  name?: string;
}

export interface EventBusOptions {
  /**
   * Sends a queued listener's job, for example `(message) => queues.events.send(message)`.
   * Required only if a listener is registered with `{ queued: true }`.
   */
  queue?: (message: QueuedEventMessage) => unknown;
  /** Called when a queued listener throws. The message is retried afterwards. Defaults to `console.error`. */
  onQueuedError?: (error: unknown, message: QueuedEventMessage) => void;
}

/** `[]` for events without a payload, so `dispatch(Event)` needs no second argument. */
export type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P];

export interface EventBus {
  /** Registers a listener. Returns a function that removes it. */
  on<P>(event: EventDefinition<P>, listener: Listener<P>, options?: ListenOptions): () => void;
  /** Runs sync listeners in order, and enqueues queued ones, in registration order. */
  dispatch<P>(event: EventDefinition<P>, ...payload: PayloadArgs<P>): Promise<void>;
  hasListeners(event: EventDefinition<any>): boolean;
  /** Queue consumer for queued listeners: `export default defineQueue(events.consume)`. */
  consume(batch: QueueBatchLike): Promise<void>;
  /** Records dispatches instead of running listeners, for tests. */
  fake(options?: FakeOptions): EventFake;
}

interface Registration {
  id: string;
  event: EventDefinition<any>;
  listener: Listener<any>;
  queued: boolean;
}

/**
 * Creates an event bus. Define it once and import it wherever events are dispatched.
 *
 * ```ts
 * import { queues } from 'void/queues';
 *
 * export const events = createEventBus({ queue: (message) => queues.events.send(message) });
 * events.on(OrderShipped, sendShippedEmail, { queued: true });
 * ```
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  const byEvent = new Map<string, Registration[]>();
  const byId = new Map<string, Registration>();
  let activeFake: ReturnType<typeof createFake> | undefined;

  function on<P>(event: EventDefinition<P>, listener: Listener<P>, listenOptions: ListenOptions = {}) {
    const queued = listenOptions.queued === true;
    const name = listenOptions.name ?? listener.name;
    if (queued && !options.queue) {
      throw new Error(`Listener for "${event.name}" is queued, but the event bus has no \`queue\` option.`);
    }
    if (queued && !name) {
      throw new Error(`Queued listeners for "${event.name}" need a name: pass { name } or use a named function.`);
    }
    const id = `${event.name}:${name || `#${(byEvent.get(event.name)?.length ?? 0) + 1}`}`;
    if (byId.has(id)) {
      throw new Error(`A listener named "${id}" is already registered.`);
    }
    const registration: Registration = { id, event, listener: listener as Listener<any>, queued };
    byId.set(id, registration);
    byEvent.set(event.name, [...(byEvent.get(event.name) ?? []), registration]);

    return () => {
      byId.delete(id);
      byEvent.set(
        event.name,
        (byEvent.get(event.name) ?? []).filter((r) => r !== registration),
      );
    };
  }

  async function dispatch<P>(event: EventDefinition<P>, ...args: PayloadArgs<P>) {
    const payload = args[0];
    if (activeFake?.intercepts(event)) {
      activeFake.record(event, payload);
      return;
    }
    for (const registration of byEvent.get(event.name) ?? []) {
      if (registration.queued) {
        await options.queue!({
          type: 'trowel.event',
          event: event.name,
          listener: registration.id,
          payload,
          dispatchedAt: Date.now(),
        });
      } else {
        await registration.listener(payload, event);
      }
    }
  }

  async function consume(batch: QueueBatchLike) {
    for (const message of batch.messages) {
      const body = message.body;
      if (!isQueuedEventMessage(body)) {
        console.warn('[trowel/events] Ignoring a queue message that is not a queued event.');
        message.ack();
        continue;
      }
      const registration = byId.get(body.listener);
      if (!registration) {
        // The listener was renamed or removed since the message was sent; retrying won't help.
        console.warn(`[trowel/events] No listener "${body.listener}" for a queued "${body.event}" event; dropping it.`);
        message.ack();
        continue;
      }
      try {
        await registration.listener(body.payload, registration.event);
        message.ack();
      } catch (error) {
        (options.onQueuedError ?? defaultOnQueuedError)(error, body);
        message.retry();
      }
    }
  }

  return {
    on,
    dispatch,
    hasListeners: (event) => (byEvent.get(event.name)?.length ?? 0) > 0,
    consume,
    fake(fakeOptions) {
      const fake = createFake(fakeOptions, () => {
        if (activeFake === fake) activeFake = undefined;
      });
      activeFake = fake;
      return fake;
    },
  };
}

function defaultOnQueuedError(error: unknown, message: QueuedEventMessage) {
  console.error(`[trowel/events] Queued listener "${message.listener}" failed; it will be retried.`, error);
}
