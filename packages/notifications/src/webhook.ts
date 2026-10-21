import { DeliveryError, type Channel, type Delivery } from './channel.ts';
import type { MaybePromise } from './notification.ts';

/** The JSON body a webhook builder returns, e.g. `{ text }` or `{ content }`. */
export type WebhookMessage = Readonly<Record<string, unknown>>;

export interface WebhookChannelOptions<R> {
  /**
   * Where to post: a URL, or a function that picks one per recipient. Return
   * nothing to fail the delivery without retrying. Read secrets in the
   * function, so they're looked up when a notification is sent.
   */
  url: string | ((recipient: R) => MaybePromise<string | null | undefined>);
  /** Extra request headers, such as `authorization`. */
  headers?: Readonly<Record<string, string>> | ((recipient: R) => MaybePromise<Readonly<Record<string, string>>>);
  /** Defaults to the global `fetch`. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

/**
 * Posts the builder's message as JSON to a webhook, such as a chat app's
 * incoming webhook. Rate limits (429) and server errors (5xx) are retried;
 * other client errors are not. Errors never include the URL, which often
 * holds a secret.
 */
export function webhookChannel<R = unknown>(options: WebhookChannelOptions<R>): Channel<WebhookMessage, R> {
  return {
    async send({ notification, channel, recipient, message }: Delivery<WebhookMessage, R>) {
      const url = typeof options.url === 'function' ? await options.url(recipient) : options.url;
      if (!url) {
        throw new DeliveryError(`"${notification}" has no ${channel} webhook for the recipient.`, { retryable: false });
      }
      const extra = typeof options.headers === 'function' ? await options.headers(recipient) : options.headers;
      const response = await (options.fetch ?? fetch)(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extra },
        body: JSON.stringify(message),
      });
      if (response.ok) return;
      const retryable = response.status === 429 || response.status >= 500;
      throw new DeliveryError(`The ${channel} webhook for "${notification}" answered ${response.status}.`, { retryable });
    },
  };
}
