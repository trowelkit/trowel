import { createEventBus, defineEvent, type QueuedEventMessage } from '@trowelkit/events';
import { createNotifier, defineNotification, DeliveryError, type QueuedNotificationMessage } from '@trowelkit/notifications';
import type { TypedQueueHandler } from 'void';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueue } from '../src/index.ts';

describe('createTestQueue', () => {
  it('keeps what was sent and delivers it in batches', async () => {
    const queue = createTestQueue<number>({ name: 'numbers', maxBatchSize: 2 });
    await queue.send(1);
    await queue.sendBatch([{ body: 2 }, { body: 3 }]);
    expect(queue.pending).toEqual([1, 2, 3]);

    const seen: number[][] = [];
    const result = await queue.drain((batch) => void seen.push(batch.messages.map((m) => m.body)));

    expect(seen).toEqual([[1, 2], [3]]);
    expect(result).toEqual({ acked: [1, 2, 3], failed: [], errors: [], batches: 2 });
    expect(queue.pending).toEqual([]);
    expect(queue.sent).toEqual([1, 2, 3]);
  });

  it('retries messages until they succeed or run out of retries', async () => {
    const queue = createTestQueue<string>({ maxRetries: 2 });
    await queue.send('flaky');
    await queue.send('broken');
    const attempts: string[] = [];

    const result = await queue.drain((batch) => {
      for (const message of batch.messages) {
        attempts.push(`${message.body} #${message.attempts}`);
        if (message.body === 'broken' || message.attempts < 2) message.retry();
        else message.ack();
      }
    });

    expect(attempts).toEqual(['flaky #1', 'broken #1', 'flaky #2', 'broken #2', 'broken #3']);
    expect(result).toMatchObject({ acked: ['flaky'], failed: ['broken'] });
  });

  it('retries a batch whose consumer throws, and acks undecided messages otherwise', async () => {
    const queue = createTestQueue<string>({ maxRetries: 1 });
    await queue.send('a');
    let calls = 0;
    const result = await queue.drain(() => {
      if (++calls === 1) throw new Error('boom');
    });
    expect(result).toMatchObject({ acked: ['a'], failed: [], batches: 2 });
    expect(result.errors).toEqual([new Error('boom')]);
  });

  it('delivers messages sent while draining', async () => {
    const queue = createTestQueue<number>();
    await queue.send(3);
    const result = await queue.drain(async (batch) => {
      for (const { body } of batch.messages) if (body > 1) await queue.send(body - 1);
    });
    expect(result.acked).toEqual([3, 2, 1]);
  });

  it('stops a consumer that never stops sending', async () => {
    const queue = createTestQueue<number>();
    await queue.send(1);
    await expect(queue.drain(() => queue.send(1))).rejects.toThrow('still had messages after 1000 batches');
  });

  it('asserts on sent messages', async () => {
    const queue = createTestQueue<{ to: string }>({ name: 'mail' });
    queue.assertNothingSent();
    expect(() => queue.assertSent()).toThrow('Expected a message on queue "mail", but none was sent.');

    await queue.send({ to: 'a@example.com' });
    queue.assertSent((m) => m.to === 'a@example.com');
    queue.assertSentTimes(1);
    expect(() => queue.assertSent((m) => m.to === 'b@example.com')).toThrow('none of 1 matched');
    expect(() => queue.assertSentTimes(2)).toThrow('Expected 2 message(s) on queue "mail", but 1 were sent.');
    expect(() => queue.assertNothingSent()).toThrow('but 1 were sent');

    queue.clear();
    queue.assertNothingSent();
    expect(queue.pending).toEqual([]);
  });
});

describe('with Trowel packages', () => {
  const OrderShipped = defineEvent<{ orderId: number }>('order.shipped');

  it('runs queued event listeners', async () => {
    const queue = createTestQueue<QueuedEventMessage>({ name: 'events' });
    const events = createEventBus({ queue: (message) => queue.send(message) });
    const shipped = vi.fn();
    events.on(OrderShipped, function emailCustomer(payload) {
      shipped(payload);
    }, { queued: true });

    await events.dispatch(OrderShipped, { orderId: 7 });
    expect(shipped).not.toHaveBeenCalled();
    queue.assertSent((m) => m.event === 'order.shipped');

    expect(await queue.drain(events.consume)).toMatchObject({ acked: [expect.objectContaining({ listener: 'order.shipped:emailCustomer' })] });
    expect(shipped).toHaveBeenCalledWith({ orderId: 7 });
  });

  it('retries notification deliveries and drops ones that cannot succeed', async () => {
    const queue = createTestQueue<QueuedNotificationMessage>({ name: 'notifications' });
    let failures = 1;
    const sms = {
      send: vi.fn(async ({ recipient }: { recipient: { phone?: string } }) => {
        if (!recipient.phone) throw new DeliveryError('No phone number.', { retryable: false });
        if (failures-- > 0) throw new Error('Gateway timeout');
      }),
    };
    const notifier = createNotifier({ channels: { sms }, queue: (m) => queue.send(m), onQueuedError: () => {} });
    const Shipped = defineNotification('shipped', { sms: (_user: { phone?: string }) => 'Your order shipped.' });

    await notifier.send([{ phone: '+15550100' }, {}], Shipped);
    const result = await queue.drain(notifier.consume);

    // The first delivery fails once, then goes through; the second can't succeed, so it's acknowledged.
    expect(sms.send).toHaveBeenCalledTimes(3);
    expect(result.acked).toHaveLength(2);
    expect(result.failed).toEqual([]);
  });

  it("accepts Void's defineQueue handlers", () => {
    // Checked by `tsc` only; never called.
    const typeOnly = (handler: TypedQueueHandler<{ n: number }>) => {
      const queue = createTestQueue<{ n: number }>();
      return queue.drain(handler);
    };
    void typeOnly;
  });
});
