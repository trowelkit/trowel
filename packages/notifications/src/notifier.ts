import { isRetryable, type Channel } from './channel.ts';
import { createFake, type FakeOptions, type NotificationFake, type SentMessages } from './fake.ts';
import { builderChannels, type Notification, type PayloadOf, type RecipientOf } from './notification.ts';
import { isQueuedNotificationMessage, type QueueBatchLike, type QueuedNotificationMessage } from './queue.ts';

export type Channels = { readonly [name: string]: Channel };

export interface NotifierOptions {
  /** Channels by name. A notification's builders use the same names. */
  channels: Channels;
  /**
   * Sends a queued delivery, for example `(message) => queues.notifications.send(message)`.
   * With it, `send` queues every delivery; without it, `send` delivers right away.
   */
  queue?: (message: QueuedNotificationMessage) => unknown;
  /** Called when a queued delivery fails. Defaults to `console.error`. */
  onQueuedError?: (error: unknown, message: QueuedNotificationMessage, context: { retrying: boolean }) => void;
  /** Creates notification ids. Defaults to `crypto.randomUUID()`. */
  generateId?: () => string;
}

/** `[]` for notifications without a payload, so `send(user, Welcome)` needs no third argument. */
export type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P];

export type Recipients<N> = RecipientOf<N> | readonly RecipientOf<N>[];

export interface Notifier {
  readonly channels: Channels;
  /** Queues the notification for each recipient when a queue is configured, or delivers it now. */
  send<N extends Notification>(recipients: Recipients<N>, notification: N, ...payload: PayloadArgs<PayloadOf<N>>): Promise<void>;
  /**
   * Delivers the notification on every channel now, even when a queue is configured.
   * Every delivery is attempted; then the first error is thrown, or an
   * `AggregateError` if several failed.
   */
  sendNow<N extends Notification>(recipients: Recipients<N>, notification: N, ...payload: PayloadArgs<PayloadOf<N>>): Promise<void>;
  /** Queue consumer for queued deliveries: `export default defineQueue(notifier.consume)`. */
  consume(batch: QueueBatchLike): Promise<void>;
  /** Records sends instead of delivering them, for tests. */
  fake(options?: FakeOptions): NotificationFake;
}

interface Planned {
  id: string;
  recipient: unknown;
  deliveries: { channel: string; message: unknown }[];
}

/**
 * Creates a notifier. Define it once and import it wherever notifications are sent.
 *
 * ```ts
 * export const notifier = createNotifier({
 *   channels: { mail: mailChannel(), database: databaseChannel({ table: notifications }) },
 *   queue: (message) => queues.notifications.send(message),
 * });
 *
 * await notifier.send(user, PostPublished, { title });
 * ```
 */
// Not generic on purpose: the notifier's type must not depend on its options, because the
// queue consumer that `queue` sends to is typed from the notifier itself.
export function createNotifier(options: NotifierOptions): Notifier {
  const { channels } = options;
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  let activeFake: ReturnType<typeof createFake> | undefined;

  async function plan(notification: Notification, recipient: unknown, payload: unknown): Promise<Planned> {
    const { builders } = notification;
    const names = builders.via ? await builders.via(recipient, payload) : builderChannels(notification);
    const deliveries = [];
    for (const channel of new Set(names)) {
      if (!Object.hasOwn(channels, channel)) {
        throw new Error(`Notification "${notification.name}" uses the "${channel}" channel, but the notifier has no channel by that name.`);
      }
      const build = channel === 'via' ? undefined : builders[channel];
      if (typeof build !== 'function') {
        throw new Error(`Notification "${notification.name}" has no "${channel}" builder.`);
      }
      deliveries.push({ channel, message: await build(recipient, payload) });
    }
    return { id: generateId(), recipient, deliveries };
  }

  // Builds every message before sending any, so a failing builder sends nothing.
  async function planAll(recipients: unknown, notification: Notification, payload: unknown) {
    const list: readonly unknown[] = Array.isArray(recipients) ? recipients : [recipients];
    const planned: Planned[] = [];
    for (const recipient of list) planned.push(await plan(notification, recipient, payload));
    return planned;
  }

  function record(notification: Notification, payload: unknown, planned: Planned[]) {
    for (const { recipient, deliveries } of planned) {
      const messages: SentMessages = Object.fromEntries(deliveries.map((d) => [d.channel, d.message]));
      activeFake!.record({
        notification: notification.name,
        recipient,
        payload,
        channels: deliveries.map((d) => d.channel),
        messages,
      });
    }
  }

  async function deliverNow(notification: Notification, planned: Planned[]) {
    const errors: unknown[] = [];
    for (const { id, recipient, deliveries } of planned) {
      for (const { channel, message } of deliveries) {
        try {
          await channels[channel]!.send({ id, notification: notification.name, channel, recipient, message });
        } catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} deliveries of "${notification.name}" failed.`);
    }
  }

  async function send(recipients: unknown, notification: Notification, ...args: unknown[]) {
    const payload = args[0];
    const planned = await planAll(recipients, notification, payload);
    if (activeFake?.intercepts(notification)) return record(notification, payload, planned);
    if (!options.queue) return deliverNow(notification, planned);

    const sentAt = Date.now();
    for (const { id, recipient, deliveries } of planned) {
      for (const { channel, message } of deliveries) {
        await options.queue({
          type: 'trowel.notification',
          id,
          notification: notification.name,
          channel,
          recipient,
          message,
          sentAt,
        });
      }
    }
  }

  async function sendNow(recipients: unknown, notification: Notification, ...args: unknown[]) {
    const payload = args[0];
    const planned = await planAll(recipients, notification, payload);
    if (activeFake?.intercepts(notification)) return record(notification, payload, planned);
    return deliverNow(notification, planned);
  }

  async function consume(batch: QueueBatchLike) {
    for (const message of batch.messages) {
      const body = message.body;
      if (!isQueuedNotificationMessage(body)) {
        console.warn('[trowel/notifications] Ignoring a queue message that is not a notification.');
        message.ack();
        continue;
      }
      const channel = Object.hasOwn(channels, body.channel) ? channels[body.channel] : undefined;
      if (!channel) {
        // The channel was renamed or removed since the message was sent; retrying won't help.
        console.warn(`[trowel/notifications] No "${body.channel}" channel for a queued "${body.notification}" notification; dropping it.`);
        message.ack();
        continue;
      }
      try {
        const { id, notification, recipient } = body;
        await channel.send({ id, notification, channel: body.channel, recipient, message: body.message });
        message.ack();
      } catch (error) {
        const retrying = isRetryable(error);
        (options.onQueuedError ?? defaultOnQueuedError)(error, body, { retrying });
        if (retrying) message.retry();
        else message.ack();
      }
    }
  }

  const notifier: Omit<Notifier, 'send' | 'sendNow'> & {
    send: typeof send;
    sendNow: typeof sendNow;
  } = {
    channels,
    send,
    sendNow,
    consume,
    fake(fakeOptions) {
      const fake = createFake(fakeOptions, () => {
        if (activeFake === fake) activeFake = undefined;
      });
      activeFake = fake;
      return fake;
    },
  };
  return notifier as Notifier;
}

function defaultOnQueuedError(error: unknown, message: QueuedNotificationMessage, { retrying }: { retrying: boolean }) {
  const outcome = retrying ? 'it will be retried' : "it won't be retried";
  console.error(`[trowel/notifications] "${message.notification}" failed on the "${message.channel}" channel; ${outcome}.`, error);
}
