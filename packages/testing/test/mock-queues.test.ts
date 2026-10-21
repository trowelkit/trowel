import { createEventBus, defineEvent, type QueuedEventMessage } from '@trowelkit/events';
import { expect, it, vi } from 'vitest';
import { queues } from 'void/queues';
import type { TestQueue } from '../src/index.ts';

// The pattern from the README: replace Void's queues proxy with test queues.
vi.mock('void/queues', async () => {
  const { createTestQueue } = await import('../src/index.ts');
  return { queues: { events: createTestQueue({ name: 'events' }) } };
});

const eventsQueue = (queues as unknown as { events: TestQueue<QueuedEventMessage> }).events;

it("stands in for an app's queue", async () => {
  const Signed = defineEvent<{ id: number }>('contract.signed');
  const events = createEventBus({ queue: (message) => eventsQueue.send(message) });
  const archive = vi.fn();
  events.on(Signed, function archiveContract(payload) {
    archive(payload);
  }, { queued: true });

  await events.dispatch(Signed, { id: 1 });
  eventsQueue.assertSentTimes(1);
  await eventsQueue.drain(events.consume);
  expect(archive).toHaveBeenCalledWith({ id: 1 });
});
