import { testBatch, type TestQueueBatch } from './batch.ts';

/** A queue consumer: a `defineQueue` handler, or a method such as `events.consume`. */
export type QueueConsumer<T> = (batch: TestQueueBatch<T>, env: any) => unknown;

export interface TestQueueOptions {
  /** The name batches report. Defaults to `"test"`. */
  name?: string;
  /** Retries before a message is dropped, as in Void's `maxRetries`. Defaults to 3. */
  maxRetries?: number;
  /** Messages per batch, as in Void's `maxBatchSize`. Defaults to 10. */
  maxBatchSize?: number;
}

export interface DrainOptions {
  /** Passed to the consumer as its `env` argument. Defaults to `{}`. */
  env?: unknown;
}

export interface DrainResult<T> {
  /** Bodies the consumer acknowledged, in order. */
  readonly acked: T[];
  /** Bodies dropped after their last retry. */
  readonly failed: T[];
  /** Errors the consumer threw. */
  readonly errors: unknown[];
  /** How many batches were delivered. */
  readonly batches: number;
}

/**
 * A queue for tests. Use `send` where your code sends messages, then `drain`
 * the messages through the consumer. Assertions throw an `Error` when they fail.
 */
export interface TestQueue<T> {
  readonly name: string;
  /** Sends a message, like `queues.<name>.send(body)`. */
  send(body: T, options?: unknown): Promise<void>;
  /** Sends several messages, like `queues.<name>.sendBatch(messages)`. */
  sendBatch(messages: Iterable<{ body: T }>, options?: unknown): Promise<void>;
  /** Every body sent, delivered or not. */
  readonly sent: readonly T[];
  /** Bodies waiting for delivery. */
  readonly pending: readonly T[];
  /**
   * Delivers waiting messages to the consumer in batches until none are left,
   * including ones sent while draining. As in Void, a message without a
   * decision is acknowledged when the consumer returns and retried when it
   * throws; a retried message comes back until it runs out of retries.
   */
  drain(consumer: QueueConsumer<T>, options?: DrainOptions): Promise<DrainResult<T>>;
  assertSent(predicate?: (body: T) => boolean): void;
  assertSentTimes(times: number, predicate?: (body: T) => boolean): void;
  assertNothingSent(): void;
  /** Forgets sent and waiting messages. */
  clear(): void;
}

interface Waiting<T> {
  body: T;
  attempts: number;
}

// Far more batches than a test should need; stops a consumer that keeps re-sending forever.
const MAX_BATCHES = 1000;

/**
 * Creates a test queue.
 *
 * ```ts
 * const queue = createTestQueue<QueuedEventMessage>();
 * const events = createEventBus({ queue: queue.send });
 * await events.dispatch(OrderShipped, { orderId: 1 });
 * await queue.drain(events.consume);
 * ```
 *
 * To stand in for an app's queue, mock `void/queues` in your test runner:
 * `vi.mock('void/queues', () => ({ queues: { events: queue } }))`.
 */
export function createTestQueue<T = unknown>(options: TestQueueOptions = {}): TestQueue<T> {
  const name = options.name ?? 'test';
  const maxRetries = options.maxRetries ?? 3;
  const maxBatchSize = options.maxBatchSize ?? 10;
  const sent: T[] = [];
  let waiting: Waiting<T>[] = [];

  const matching = (predicate?: (body: T) => boolean) => sent.filter((body) => !predicate || predicate(body));

  const queue: TestQueue<T> = {
    name,
    async send(body) {
      sent.push(body);
      waiting.push({ body, attempts: 1 });
    },
    async sendBatch(messages) {
      for (const { body } of messages) await queue.send(body);
    },
    get sent() {
      return [...sent];
    },
    get pending() {
      return waiting.map((w) => w.body);
    },
    async drain(consumer, drainOptions = {}) {
      const acked: T[] = [];
      const failed: T[] = [];
      const errors: unknown[] = [];
      let batches = 0;

      while (waiting.length > 0) {
        if (++batches > MAX_BATCHES) {
          throw new Error(`Queue "${name}" still had messages after ${MAX_BATCHES} batches. Does the consumer keep re-sending them?`);
        }
        const delivering = waiting.slice(0, maxBatchSize);
        waiting = waiting.slice(maxBatchSize);
        const { batch, decisions } = testBatch(
          delivering.map((w) => w.body),
          { queue: name, attempts: delivering.map((w) => w.attempts) },
        );
        let threw = false;
        try {
          await consumer(batch, drainOptions.env ?? {});
        } catch (error) {
          threw = true;
          errors.push(error);
        }
        delivering.forEach((message, index) => {
          const decision = decisions[index] ?? { type: threw ? 'retry' : 'ack' };
          if (decision.type === 'ack') acked.push(message.body);
          else if (message.attempts > maxRetries) failed.push(message.body);
          else waiting.push({ body: message.body, attempts: message.attempts + 1 });
        });
      }
      return { acked, failed, errors, batches };
    },
    assertSent(predicate) {
      if (matching(predicate).length === 0) {
        throw new Error(
          predicate
            ? `Expected a matching message on queue "${name}", but none of ${sent.length} matched.`
            : `Expected a message on queue "${name}", but none was sent.`,
        );
      }
    },
    assertSentTimes(times, predicate) {
      const count = matching(predicate).length;
      if (count !== times) {
        throw new Error(`Expected ${times} message(s) on queue "${name}", but ${count} were sent.`);
      }
    },
    assertNothingSent() {
      if (sent.length > 0) throw new Error(`Expected no messages on queue "${name}", but ${sent.length} were sent.`);
    },
    clear() {
      sent.length = 0;
      waiting = [];
    },
  };
  return queue;
}
