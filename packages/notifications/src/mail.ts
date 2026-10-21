import type { Address, SendEmailErrorCode, SendEmailOptions, SendEmailResult } from 'void/email';
import { DeliveryError, type Channel, type Delivery } from './channel.ts';
import type { MailAddress, MailMessage } from './notification.ts';

/** The recipient fields the mail channel reads by default. */
export interface MailRecipient {
  readonly email?: string | null;
  readonly name?: string | null;
}

export interface MailChannelOptions<R> {
  /** The sender for messages that don't set `from`. Defaults to Void's project sender. */
  from?: MailAddress;
  /** Picks a recipient's address. Defaults to `recipient.email`, with `recipient.name` as the display name. */
  to?: (recipient: R) => MailAddress | null | undefined;
  /**
   * Sends an idempotency key made from the notification id, so a retry after
   * an uncertain outcome isn't delivered twice. Needs a Void platform: the
   * native Cloudflare binding rejects idempotency keys.
   */
  idempotent?: boolean;
}

// Retrying these sends the same request and fails the same way.
const PERMANENT_CODES: ReadonlySet<SendEmailErrorCode> = new Set<SendEmailErrorCode>([
  'BINDING_MISSING',
  'INVALID_FROM',
  'INVALID_TO',
  'UNVERIFIED_DESTINATION',
  'MIME_ERROR',
  'IDEMPOTENCY_CONFLICT',
]);

/**
 * Thrown by the mail channel when `sendEmail` reports a failure. The message
 * leaves out recipient addresses, so logging the error doesn't log them.
 */
export class MailDeliveryError extends DeliveryError {
  override readonly name: string = 'MailDeliveryError';
  /** The first failure's code. */
  readonly code: SendEmailErrorCode;
  /** The full result, including recipient addresses. Not enumerable, so loggers skip it. */
  declare readonly result: SendEmailResult;

  constructor(message: string, code: SendEmailErrorCode, result: SendEmailResult, retryable: boolean) {
    super(message, { retryable });
    this.code = code;
    Object.defineProperty(this, 'result', { value: result, enumerable: false });
  }
}

function list(value: MailAddress | readonly MailAddress[] | undefined): Address | Address[] | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' || !Array.isArray(value) ? (value as Address) : [...(value as readonly Address[])];
}

function defaultAddress(recipient: unknown): MailAddress | undefined {
  const { email, name } = (recipient ?? {}) as MailRecipient;
  if (typeof email !== 'string' || email === '') return undefined;
  return name ? { email, name } : email;
}

/**
 * Delivers the `mail` builder's message with Void's `sendEmail`. During
 * `void dev` messages land in the local inbox at `/__void/inbox`.
 *
 * `sendEmail` returns failures instead of throwing; this channel throws a
 * `MailDeliveryError` for them, so a queued delivery is retried. Failures that
 * a retry can't fix, such as an invalid address, are not retried.
 */
export function mailChannel<R = MailRecipient>(options: MailChannelOptions<R> = {}): Channel<MailMessage, R> {
  function retryable(code: SendEmailErrorCode): boolean {
    if (code === 'OUTCOME_UNKNOWN') return options.idempotent === true;
    return !PERMANENT_CODES.has(code);
  }

  return {
    async send({ id, notification, recipient, message }: Delivery<MailMessage, R>) {
      const to = message.to ?? (options.to ? options.to(recipient) : defaultAddress(recipient));
      if (!to || (Array.isArray(to) && to.length === 0)) {
        throw new DeliveryError(`"${notification}" can't be mailed: the recipient has no email address.`, {
          retryable: false,
        });
      }
      const from = message.from ?? options.from;
      const email: SendEmailOptions = {
        to: list(to)!,
        subject: message.subject,
        ...(from !== undefined && { from: from as Address }),
        ...(message.text !== undefined && { text: message.text }),
        ...(message.html !== undefined && { html: message.html }),
        ...(message.replyTo !== undefined && { replyTo: message.replyTo as Address }),
        ...(message.cc !== undefined && { cc: list(message.cc)! }),
        ...(message.bcc !== undefined && { bcc: list(message.bcc)! }),
        ...(message.headers !== undefined && { headers: { ...message.headers } }),
        ...(options.idempotent && { idempotencyKey: `trowel-${id}` }),
      };

      // Loaded on first send, so that schema files can import this entry for
      // `notificationsTable()`: drizzle-kit loads them in a runtime without `void/email`.
      const { sendEmail } = await import('void/email');
      const result = await sendEmail(email);
      if (result.ok) return;

      if ('error' in result) {
        const { code, message: detail } = result.error;
        throw new MailDeliveryError(`Mail for "${notification}" failed: ${code}: ${detail}`, code, result, retryable(code));
      }
      const failed = result.deliveries.flatMap((d) => (d.ok ? [] : [d]));
      const first = failed[0]!;
      throw new MailDeliveryError(
        `Mail for "${notification}" failed for ${failed.length} of ${result.deliveries.length} recipients: ${first.error.code}`,
        first.error.code,
        result,
        failed.every((d) => retryable(d.error.code)),
      );
    },
  };
}
