/** The message a queued listener's job travels in. */
export interface QueuedEventMessage {
  readonly type: 'trowel.event';
  readonly event: string;
  readonly listener: string;
  readonly payload: unknown;
  readonly dispatchedAt: number;
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

export function isQueuedEventMessage(body: unknown): body is QueuedEventMessage {
  return typeof body === 'object' && body !== null && (body as { type?: unknown }).type === 'trowel.event';
}
