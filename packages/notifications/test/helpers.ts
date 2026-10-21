import type { Channel, Delivery, QueueBatchLike } from '../src/index.ts';

/** A batch like Void's, recording what the consumer decided for each message. */
export function batchOf(bodies: unknown[]) {
  const decisions: string[] = [];
  const batch: QueueBatchLike = {
    messages: bodies.map((body, i) => ({
      body,
      ack: () => void decisions.push(`ack ${i}`),
      retry: () => void decisions.push(`retry ${i}`),
    })),
  };
  return { batch, decisions };
}

/** A channel that keeps what it was asked to deliver. */
export function memoryChannel<M = unknown>() {
  const deliveries: Delivery<M>[] = [];
  const channel: Channel<M> & { deliveries: Delivery<M>[] } = {
    deliveries,
    send: (delivery) => void deliveries.push(delivery),
  };
  return channel;
}
