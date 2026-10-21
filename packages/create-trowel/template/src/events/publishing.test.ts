import type { QueuedEventMessage } from '@trowelkit/events';
import type { TestQueue } from '@trowelkit/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { queues } from 'void/queues';
import { notifier } from '../notifications';
import { PostPublishedNotification } from '../notifications/post-published';
import { events, PostPublished } from './index';

// Send the app's queue messages to test queues instead of Void's.
vi.mock('void/queues', async () => {
  const { createTestQueue } = await import('@trowelkit/testing');
  return { queues: { events: createTestQueue({ name: 'events' }), notifications: createTestQueue({ name: 'notifications' }) } };
});

const eventsQueue = queues.events as unknown as TestQueue<QueuedEventMessage>;
const sent = notifier.fake();

afterEach(() => {
  eventsQueue.clear();
});

it('notifies the author from a queued listener when a post is published', async () => {
  const author = { id: 'ann', name: 'Ann', email: 'ann@example.com' };
  await events.dispatch(PostPublished, { id: 7, title: 'Hello', author });

  // The listener is queued, so nothing is sent until the queue delivers it.
  sent.assertNothingSent();
  eventsQueue.assertSentTimes(1);

  await eventsQueue.drain(events.consume);
  sent.assertSentTo(author, PostPublishedNotification, (n) => n.messages.mail?.subject === 'Your post "Hello" is live');
  expect(sent.sent(PostPublishedNotification)[0]?.channels).toEqual(['mail', 'database']);
});
