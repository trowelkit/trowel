/** The message a queued delivery travels in. One per recipient and channel. */
export interface QueuedNotificationMessage {
  readonly type: 'trowel.notification';
  readonly id: string;
  readonly notification: string;
  readonly channel: string;
  readonly recipient: unknown;
  readonly message: unknown;
  readonly sentAt: number;
}

/** The parts of a Void/Cloudflare queue message the consumer uses. */
export interface QueueMessageLike {
  readonly body: unknown;
  readonly attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatchLike {
  readonly messages: readonly QueueMessageLike[];
}

export function isQueuedNotificationMessage(body: unknown): body is QueuedNotificationMessage {
  return typeof body === 'object' && body !== null && (body as { type?: unknown }).type === 'trowel.notification';
}
