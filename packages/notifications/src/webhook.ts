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
  /**
   * Decides whether a URL may be called. Defaults to `https` URLs whose host
   * isn't a local or private address. When people can enter their own webhook
   * URLs, pass a check that allows only the services you support.
   */
  allowUrl?: (url: URL) => boolean;
  /** Seconds to wait for an answer before retrying. Defaults to 10. */
  timeout?: number;
  /** Defaults to the global `fetch`. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

/** Hosts that point at the local machine or a private network, written as names or IP addresses. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.includes(':')) {
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:');
  }
  return false;
}

function allowedByDefault(url: URL) {
  return url.protocol === 'https:' && !isPrivateHost(url.hostname);
}

/**
 * Posts the builder's message as JSON to a webhook, such as a chat app's
 * incoming webhook. Rate limits (429), server errors (5xx), timeouts and
 * network errors are retried; other answers are not, and redirects aren't
 * followed. Errors never include the URL, which often holds a secret.
 */
export function webhookChannel<R = unknown>(options: WebhookChannelOptions<R>): Channel<WebhookMessage, R> {
  const allowUrl = options.allowUrl ?? allowedByDefault;
  const timeoutMs = (options.timeout ?? 10) * 1000;

  return {
    async send({ notification, channel, recipient, message }: Delivery<WebhookMessage, R>) {
      const what = `The ${channel} webhook for "${notification}"`;
      const url = typeof options.url === 'function' ? await options.url(recipient) : options.url;
      if (!url) {
        throw new DeliveryError(`"${notification}" has no ${channel} webhook for the recipient.`, { retryable: false });
      }
      if (!URL.canParse(url)) throw new DeliveryError(`${what} isn't a valid URL.`, { retryable: false });
      if (!allowUrl(new URL(url))) throw new DeliveryError(`${what} isn't an allowed URL.`, { retryable: false });

      const extra = typeof options.headers === 'function' ? await options.headers(recipient) : options.headers;
      let response: Response;
      try {
        response = await (options.fetch ?? fetch)(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...extra },
          body: JSON.stringify(message),
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // Fetch errors can quote the URL, so they're neither repeated nor attached.
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        throw new DeliveryError(`${what} ${timedOut ? 'timed out' : "couldn't be reached"}.`);
      }
      if (response.ok) return;
      const retryable = response.status === 429 || response.status >= 500;
      throw new DeliveryError(`${what} answered ${response.status}.`, { retryable });
    },
  };
}
