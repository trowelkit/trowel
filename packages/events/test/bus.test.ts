import { describe, expect, it, vi } from 'vitest';
import { createEventBus, defineEvent, type QueueBatchLike, type QueuedEventMessage } from '../src/index.ts';

const OrderShipped = defineEvent<{ orderId: number }>('order.shipped');
const CacheCleared = defineEvent('cache.cleared');

/** A batch like Void's, recording what the consumer decided for each message. */
function batchOf(bodies: unknown[]) {
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

describe('createEventBus', () => {
  it('runs sync listeners in registration order with the payload', async () => {
    const events = createEventBus();
    const calls: string[] = [];
    events.on(OrderShipped, ({ orderId }) => void calls.push(`first ${orderId}`));
    events.on(OrderShipped, async ({ orderId }) => {
      await Promise.resolve();
      calls.push(`second ${orderId}`);
    });
    await events.dispatch(OrderShipped, { orderId: 7 });
    expect(calls).toEqual(['first 7', 'second 7']);
  });

  it('passes the event definition to listeners', async () => {
    const events = createEventBus();
    const listener = vi.fn();
    events.on(OrderShipped, listener);
    await events.dispatch(OrderShipped, { orderId: 1 });
    expect(listener).toHaveBeenCalledWith({ orderId: 1 }, OrderShipped);
  });

  it('dispatches events without a payload', async () => {
    const events = createEventBus();
    const listener = vi.fn();
    events.on(CacheCleared, listener);
    await events.dispatch(CacheCleared);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does nothing for an event without listeners', async () => {
    const events = createEventBus();
    await expect(events.dispatch(OrderShipped, { orderId: 1 })).resolves.toBeUndefined();
    expect(events.hasListeners(OrderShipped)).toBe(false);
  });

  it('propagates a sync listener error and stops later listeners', async () => {
    const events = createEventBus();
    const later = vi.fn();
    events.on(OrderShipped, () => {
      throw new Error('boom');
    });
    events.on(OrderShipped, later);
    await expect(events.dispatch(OrderShipped, { orderId: 1 })).rejects.toThrow('boom');
    expect(later).not.toHaveBeenCalled();
  });

  it('removes a listener with the returned function', async () => {
    const events = createEventBus();
    const listener = vi.fn();
    const off = events.on(OrderShipped, listener);
    off();
    await events.dispatch(OrderShipped, { orderId: 1 });
    expect(listener).not.toHaveBeenCalled();
    expect(events.hasListeners(OrderShipped)).toBe(false);
  });

  describe('queued listeners', () => {
    it('enqueues instead of running, and the consumer runs them', async () => {
      const sent: QueuedEventMessage[] = [];
      const events = createEventBus({ queue: (message) => void sent.push(message) });
      const notify = vi.fn();
      events.on(OrderShipped, notify, { queued: true, name: 'notify-customer' });

      await events.dispatch(OrderShipped, { orderId: 3 });
      expect(notify).not.toHaveBeenCalled();
      expect(sent).toEqual([
        expect.objectContaining({
          type: 'trowel.event',
          event: 'order.shipped',
          listener: 'order.shipped:notify-customer',
          payload: { orderId: 3 },
        }),
      ]);

      const { batch, decisions } = batchOf(sent);
      await events.consume(batch);
      expect(notify).toHaveBeenCalledWith({ orderId: 3 }, OrderShipped);
      expect(decisions).toEqual(['ack 0']);
    });

    it('uses the function name when no name is given', async () => {
      const sent: QueuedEventMessage[] = [];
      const events = createEventBus({ queue: (message) => void sent.push(message) });
      async function updateSearchIndex() {}
      events.on(OrderShipped, updateSearchIndex, { queued: true });
      await events.dispatch(OrderShipped, { orderId: 1 });
      expect(sent[0]?.listener).toBe('order.shipped:updateSearchIndex');
    });

    it('keeps sync and queued listeners in registration order', async () => {
      const order: string[] = [];
      const events = createEventBus({ queue: () => void order.push('queued') });
      events.on(OrderShipped, () => void order.push('sync 1'));
      events.on(OrderShipped, () => {}, { queued: true, name: 'later' });
      events.on(OrderShipped, () => void order.push('sync 2'));
      await events.dispatch(OrderShipped, { orderId: 1 });
      expect(order).toEqual(['sync 1', 'queued', 'sync 2']);
    });

    it('retries a message whose listener throws, and reports the error', async () => {
      const onQueuedError = vi.fn();
      const sent: QueuedEventMessage[] = [];
      const events = createEventBus({ queue: (m) => void sent.push(m), onQueuedError });
      events.on(
        OrderShipped,
        () => {
          throw new Error('mail server down');
        },
        { queued: true, name: 'mail' },
      );
      await events.dispatch(OrderShipped, { orderId: 1 });

      const { batch, decisions } = batchOf(sent);
      await events.consume(batch);
      expect(decisions).toEqual(['retry 0']);
      expect(onQueuedError).toHaveBeenCalledWith(expect.any(Error), sent[0]);
    });

    it('acks messages it cannot handle, so they are not retried forever', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const events = createEventBus({ queue: () => {} });
      const { batch, decisions } = batchOf([
        { something: 'else' },
        { type: 'trowel.event', event: 'order.shipped', listener: 'order.shipped:gone', payload: {}, dispatchedAt: 0 },
      ]);
      await events.consume(batch);
      expect(decisions).toEqual(['ack 0', 'ack 1']);
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });

    it('rejects queued listeners without a queue or a name', () => {
      expect(() => createEventBus().on(OrderShipped, function named() {}, { queued: true })).toThrow(
        'has no `queue` option',
      );
      expect(() => createEventBus({ queue: () => {} }).on(OrderShipped, () => {}, { queued: true })).toThrow(
        'need a name',
      );
    });

    it('rejects two listeners with the same name for an event', () => {
      const events = createEventBus({ queue: () => {} });
      events.on(OrderShipped, () => {}, { queued: true, name: 'mail' });
      expect(() => events.on(OrderShipped, () => {}, { queued: true, name: 'mail' })).toThrow('already registered');
    });
  });

  describe('fake', () => {
    it('records dispatches instead of running listeners', async () => {
      const events = createEventBus();
      const listener = vi.fn();
      events.on(OrderShipped, listener);

      const fake = events.fake();
      await events.dispatch(OrderShipped, { orderId: 1 });
      await events.dispatch(OrderShipped, { orderId: 2 });

      expect(listener).not.toHaveBeenCalled();
      expect(fake.dispatched(OrderShipped)).toEqual([{ orderId: 1 }, { orderId: 2 }]);
      fake.assertDispatched(OrderShipped);
      fake.assertDispatched(OrderShipped, (p) => p.orderId === 2);
      fake.assertDispatchedTimes(OrderShipped, 2);
      fake.assertNotDispatched(CacheCleared);
      fake.assertNotDispatched(OrderShipped, (p) => p.orderId === 3);
    });

    it('throws readable errors when an assertion fails', async () => {
      const events = createEventBus();
      const fake = events.fake();
      expect(() => fake.assertDispatched(OrderShipped)).toThrow(`Expected "order.shipped" to be dispatched`);
      await events.dispatch(CacheCleared);
      expect(() => fake.assertNothingDispatched()).toThrow('these were: cache.cleared');
      expect(() => fake.assertDispatchedTimes(CacheCleared, 2)).toThrow('2 time(s), but it was dispatched 1');
      expect(() => fake.assertNotDispatched(CacheCleared)).toThrow('not to be dispatched');
    });

    it('fakes only the listed events when `only` is given', async () => {
      const events = createEventBus();
      const shipped = vi.fn();
      const cleared = vi.fn();
      events.on(OrderShipped, shipped);
      events.on(CacheCleared, cleared);

      const fake = events.fake({ only: [OrderShipped] });
      await events.dispatch(OrderShipped, { orderId: 1 });
      await events.dispatch(CacheCleared);

      expect(shipped).not.toHaveBeenCalled();
      expect(cleared).toHaveBeenCalledOnce();
      fake.assertDispatched(OrderShipped);
    });

    it('runs listeners again after restore', async () => {
      const events = createEventBus();
      const listener = vi.fn();
      events.on(OrderShipped, listener);
      events.fake().restore();
      await events.dispatch(OrderShipped, { orderId: 1 });
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  it('types payloads', () => {
    const events = createEventBus();
    // Checked by `tsc` only; never called.
    const typeOnly = () => {
      // @ts-expect-error payload is required
      void events.dispatch(OrderShipped);
      // @ts-expect-error wrong payload shape
      void events.dispatch(OrderShipped, { id: 1 });
      // @ts-expect-error this event has no payload
      void events.dispatch(CacheCleared, { orderId: 1 });
      events.on(OrderShipped, (payload) => {
        // @ts-expect-error orderId is a number
        const id: string = payload.orderId;
        void id;
      });
    };
    void typeOnly;
  });
});
