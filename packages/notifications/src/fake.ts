import type { DatabaseMessage, MailMessage, Notification, PayloadOf, RecipientOf } from './notification.ts';

export interface FakeOptions {
  /** Fake only these notifications; others are still delivered. Defaults to all notifications. */
  only?: readonly Notification[];
}

/** Each channel's built message, by channel name. */
export interface SentMessages {
  readonly mail?: MailMessage;
  readonly database?: DatabaseMessage;
  readonly [channel: string]: unknown;
}

/** One recipient's notification, as recorded by a fake. */
export interface SentNotification<R = unknown, P = unknown> {
  readonly notification: string;
  readonly recipient: R;
  readonly payload: P;
  /** The channels it would have been delivered on, after `via`. */
  readonly channels: readonly string[];
  readonly messages: SentMessages;
}

type SentFor<N> = SentNotification<RecipientOf<N>, PayloadOf<N>>;

/**
 * Records sent notifications and asserts on them. Assertions throw an `Error`
 * when they fail. Recipients match when they are the same object or have the
 * same `id`.
 */
export interface NotificationFake {
  /** Sends of a notification, one per recipient, in order. */
  sent<N extends Notification>(notification: N): SentFor<N>[];
  assertSent<N extends Notification>(notification: N, predicate?: (sent: SentFor<N>) => boolean): void;
  assertSentTo<N extends Notification>(
    recipient: RecipientOf<N>,
    notification: N,
    predicate?: (sent: SentFor<N>) => boolean,
  ): void;
  assertSentTimes(notification: Notification, times: number): void;
  assertNotSent<N extends Notification>(notification: N, predicate?: (sent: SentFor<N>) => boolean): void;
  assertNotSentTo<N extends Notification>(recipient: RecipientOf<N>, notification: N): void;
  assertNothingSent(): void;
  /** Stops faking; later sends are delivered again. */
  restore(): void;
}

function idOf(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : undefined;
}

function sameRecipient(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const id = idOf(a);
  return id !== undefined && id === idOf(b);
}

export function createFake(options: FakeOptions = {}, onRestore: () => void) {
  const only = options.only ? new Set(options.only.map((n) => n.name)) : undefined;
  const records: SentNotification[] = [];

  const sentOf = <N extends Notification>(notification: N) =>
    records.filter((r) => r.notification === notification.name) as SentFor<N>[];

  const fake: NotificationFake & {
    intercepts(notification: Notification): boolean;
    record(sent: SentNotification): void;
  } = {
    intercepts: (notification) => !only || only.has(notification.name),
    record: (sent) => void records.push(sent),
    sent: sentOf,
    assertSent(notification, predicate) {
      const all = sentOf(notification);
      if (!all.some((s) => !predicate || predicate(s))) {
        throw new Error(
          predicate
            ? `Expected "${notification.name}" to be sent with a match, but none of ${all.length} matched.`
            : `Expected "${notification.name}" to be sent, but it wasn't.`,
        );
      }
    },
    assertSentTo(recipient, notification, predicate) {
      const toRecipient = sentOf(notification).filter((s) => sameRecipient(s.recipient, recipient));
      if (toRecipient.length === 0) {
        throw new Error(`Expected "${notification.name}" to be sent to the recipient, but it wasn't.`);
      }
      if (predicate && !toRecipient.some(predicate)) {
        throw new Error(
          `Expected "${notification.name}" to be sent to the recipient with a match, but none of ${toRecipient.length} matched.`,
        );
      }
    },
    assertSentTimes(notification, times) {
      const count = sentOf(notification).length;
      if (count !== times) {
        throw new Error(`Expected "${notification.name}" to be sent ${times} time(s), but it was sent ${count}.`);
      }
    },
    assertNotSent(notification, predicate) {
      const matches = sentOf(notification).filter((s) => !predicate || predicate(s));
      if (matches.length > 0) {
        throw new Error(`Expected "${notification.name}" not to be sent, but it was sent ${matches.length} time(s).`);
      }
    },
    assertNotSentTo(recipient, notification) {
      const matches = sentOf(notification).filter((s) => sameRecipient(s.recipient, recipient));
      if (matches.length > 0) {
        throw new Error(`Expected "${notification.name}" not to be sent to the recipient, but it was sent ${matches.length} time(s).`);
      }
    },
    assertNothingSent() {
      if (records.length > 0) {
        const names = [...new Set(records.map((r) => r.notification))].join(', ');
        throw new Error(`Expected no notifications to be sent, but these were: ${names}.`);
      }
    },
    restore: onRestore,
  };
  return fake;
}
