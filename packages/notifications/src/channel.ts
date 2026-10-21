import type { MaybePromise } from './notification.ts';

/** One notification, built for one channel and one recipient. */
export interface Delivery<M = unknown, R = unknown> {
  /** Identifies the notification. Every channel and retry of one send shares it. */
  readonly id: string;
  /** The notification's name. */
  readonly notification: string;
  readonly channel: string;
  readonly recipient: R;
  readonly message: M;
}

/**
 * Delivers notifications. Throw to fail the delivery: a queued delivery is
 * retried, unless the error is a `DeliveryError` with `retryable: false`.
 */
export interface Channel<M = any, R = any> {
  send(delivery: Delivery<M, R>): MaybePromise<void>;
}

export interface DeliveryErrorOptions {
  /** Whether retrying could succeed. Defaults to `true`. */
  readonly retryable?: boolean;
  readonly cause?: unknown;
}

/** A failed delivery. Channels throw it to say whether a retry could help. */
export class DeliveryError extends Error {
  override readonly name: string = 'DeliveryError';
  readonly retryable: boolean;

  constructor(message: string, options: DeliveryErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.retryable = options.retryable ?? true;
  }
}

export function isRetryable(error: unknown): boolean {
  return !(error instanceof DeliveryError) || error.retryable;
}
