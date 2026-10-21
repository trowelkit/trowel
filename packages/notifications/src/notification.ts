export type MaybePromise<T> = T | Promise<T>;

export type MailAddress = string | { readonly email: string; readonly name?: string };

/** What a `mail` builder returns. */
export interface MailMessage {
  readonly subject: string;
  /** Plain-text body. A message needs `text`, `html` or both. */
  readonly text?: string;
  readonly html?: string;
  /** Overrides the address the mail channel picks for the recipient. */
  readonly to?: MailAddress | readonly MailAddress[];
  /** Overrides the mail channel's default sender. */
  readonly from?: MailAddress;
  readonly replyTo?: MailAddress;
  readonly cc?: MailAddress | readonly MailAddress[];
  readonly bcc?: MailAddress | readonly MailAddress[];
  readonly headers?: Readonly<Record<string, string>>;
}

/** What a `database` builder returns: data stored as JSON with the notification. */
export type DatabaseMessage = Readonly<Record<string, unknown>>;

/** Builds one channel's message for a recipient. */
export type Builder<R, P, M> = (recipient: R, payload: P) => MaybePromise<M>;

/**
 * A notification's builders, one per channel, keyed by the channel's name in
 * `createNotifier({ channels })`. `mail` and `database` are typed for the
 * built-in channels; any other key builds a custom channel's message.
 */
export interface NotificationBuilders<R, P> {
  /**
   * Picks the channels for one recipient, e.g. to respect their settings.
   * Defaults to every channel this notification has a builder for.
   */
  readonly via?: (recipient: R, payload: P) => MaybePromise<readonly string[]>;
  readonly mail?: Builder<R, P, MailMessage>;
  readonly database?: Builder<R, P, DatabaseMessage>;
  readonly [channel: string]: Builder<R, P, unknown> | undefined;
}

declare const types: unique symbol;

/** A named notification. `R` is the recipient type and `P` the payload type. */
export interface Notification<R = any, P = any> {
  readonly name: string;
  readonly builders: NotificationBuilders<R, P>;
  /** Type-level only. */
  readonly [types]?: { recipient: R; payload: P };
}

export type RecipientOf<N> = N extends Notification<infer R, any> ? R : never;
export type PayloadOf<N> = N extends Notification<any, infer P> ? P : never;

/**
 * Declares a notification and how to build it for each channel.
 *
 * ```ts
 * export const PostPublished = defineNotification('post.published', {
 *   mail: (user: User, post: { title: string }) => ({
 *     subject: `"${post.title}" is live`,
 *     text: 'Your post is now public.',
 *   }),
 *   database: (user, post) => ({ title: post.title }),
 * });
 * ```
 *
 * The name identifies the notification in queued messages and stored rows,
 * so keep it stable once deployed.
 */
export function defineNotification<R, P = void>(
  name: string,
  builders: NotificationBuilders<R, P>,
): Notification<R, P> {
  if (!name) throw new Error('A notification needs a name.');
  return Object.freeze({ name, builders: Object.freeze({ ...builders }) });
}

/** The channels a notification has builders for, in the order they were declared. */
export function builderChannels(notification: Notification): string[] {
  return Object.keys(notification.builders).filter(
    (key) => key !== 'via' && typeof notification.builders[key] === 'function',
  );
}
