export interface QueueRetryOptions {
  delaySeconds?: number;
}

/** A queue message, shaped like the ones Void passes to `defineQueue` handlers. */
export interface TestQueueMessage<T> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(options?: QueueRetryOptions): void;
}

/** A batch of queue messages, shaped like Void's `QueueBatch`. */
export interface TestQueueBatch<T> {
  readonly queue: string;
  readonly messages: Array<TestQueueMessage<T>>;
  ackAll(): void;
  retryAll(options?: QueueRetryOptions): void;
}

/** What a consumer decided for a message. `undefined` until it decides. */
export type Decision = { readonly type: 'ack' } | { readonly type: 'retry'; readonly delaySeconds?: number };

export interface BatchOptions {
  /** The queue name the batch reports. Defaults to `"test"`. */
  queue?: string;
  /** Delivery attempts per message, starting at 1. */
  attempts?: readonly number[];
}

/**
 * A batch for testing a queue consumer directly. As in Void, the first
 * decision for each message wins.
 *
 * ```ts
 * const { batch, decisions } = testBatch([message]);
 * await events.consume(batch);
 * expect(decisions).toEqual([{ type: 'ack' }]);
 * ```
 */
export function testBatch<T>(bodies: readonly T[], options: BatchOptions = {}) {
  const decisions: (Decision | undefined)[] = bodies.map(() => undefined);
  const decide = (index: number, decision: Decision) => {
    if (decisions[index] === undefined) decisions[index] = decision;
  };
  const retryDecision = (options?: QueueRetryOptions): Decision =>
    options?.delaySeconds === undefined ? { type: 'retry' } : { type: 'retry', delaySeconds: options.delaySeconds };

  const now = new Date();
  const batch: TestQueueBatch<T> = {
    queue: options.queue ?? 'test',
    messages: bodies.map((body, index) => ({
      id: `${index + 1}`,
      timestamp: now,
      body,
      attempts: options.attempts?.[index] ?? 1,
      ack: () => decide(index, { type: 'ack' }),
      retry: (retryOptions) => decide(index, retryDecision(retryOptions)),
    })),
    ackAll: () => bodies.forEach((_, index) => decide(index, { type: 'ack' })),
    retryAll: (retryOptions) => bodies.forEach((_, index) => decide(index, retryDecision(retryOptions))),
  };
  return { batch, decisions };
}
