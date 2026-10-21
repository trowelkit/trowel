import { sendEmail, type SendEmailResult } from 'void/email';
import { createEmailTestHarness } from 'void/email/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNotifier,
  defineNotification,
  DeliveryError,
  MailDeliveryError,
  mailChannel,
  type QueuedNotificationMessage,
} from '../src/void.ts';
import { batchOf } from './helpers.ts';

// The real sendEmail by default, so the harness captures sends; tests can stub single results.
vi.mock('void/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('void/email')>();
  return { ...actual, sendEmail: vi.fn(actual.sendEmail) };
});

interface User {
  id: string;
  email: string | null;
  name?: string;
}

const alice: User = { id: 'alice', email: 'alice@example.com', name: 'Alice' };

const Shipped = defineNotification('order.shipped', {
  mail: (user: User, order: { id: number }) => ({
    subject: `Order ${order.id} shipped`,
    text: `Hi ${user.name}, it's on its way.`,
    html: `<p>Hi ${user.name}, it's on its way.</p>`,
  }),
});

const failure = (code: string): SendEmailResult => ({ ok: false, error: { code: code as never, message: 'no' } });

let inbox: ReturnType<typeof createEmailTestHarness>;
beforeEach(() => {
  inbox = createEmailTestHarness();
});
afterEach(() => {
  inbox.dispose();
  vi.mocked(sendEmail).mockClear();
});

describe('mailChannel', () => {
  it("sends the mail builder's message to the recipient's address", async () => {
    const notifier = createNotifier({ channels: { mail: mailChannel({ from: 'Shop <shop@example.com>' }) } });
    await notifier.sendNow(alice, Shipped, { id: 42 });

    expect(inbox.messages).toHaveLength(1);
    const [message] = inbox.messages;
    expect(message).toMatchObject({
      subject: 'Order 42 shipped',
      text: "Hi Alice, it's on its way.",
      html: "<p>Hi Alice, it's on its way.</p>",
      from: { email: 'shop@example.com', name: 'Shop' },
      to: [{ email: 'alice@example.com', name: 'Alice' }],
    });
  });

  it('lets the message and the to option choose the address', async () => {
    const Custom = defineNotification('custom', {
      mail: (_user: User) => ({ subject: 'Hi', text: 'Hi', to: ['a@example.com', 'b@example.com'], from: 'x@example.com' }),
    });
    const notifier = createNotifier({
      channels: { mail: mailChannel<User>({ from: 'shop@example.com', to: (user) => `${user.id}@work.example.com` }) },
    });
    await notifier.sendNow(alice, Shipped, { id: 1 });
    await notifier.sendNow(alice, Custom);

    expect(inbox.messages.map((m) => [m.from.email, m.to.map((t) => t.email)])).toEqual([
      ['shop@example.com', ['alice@work.example.com']],
      ['x@example.com', ['a@example.com', 'b@example.com']],
    ]);
  });

  it("doesn't retry a recipient without an address", async () => {
    const notifier = createNotifier({ channels: { mail: mailChannel({ from: 'shop@example.com' }) } });
    const error = await notifier.sendNow({ ...alice, email: null }, Shipped, { id: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).toMatchObject({ retryable: false });
    expect(inbox.messages).toHaveLength(0);
  });

  it('throws a MailDeliveryError when sendEmail reports a failure', async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce(failure('UPSTREAM_ERROR'));
    const notifier = createNotifier({ channels: { mail: mailChannel({ from: 'shop@example.com' }) } });
    const error = await notifier.sendNow(alice, Shipped, { id: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', retryable: true, name: 'MailDeliveryError' });
    expect((error as Error).message).toBe('Mail for "order.shipped" failed: UPSTREAM_ERROR: no');
  });

  it('marks failures that a retry cannot fix', async () => {
    const mail = mailChannel({ from: 'shop@example.com' });
    const idempotent = mailChannel({ from: 'shop@example.com', idempotent: true });
    const retryable = async (channel: typeof mail, code: string) => {
      vi.mocked(sendEmail).mockResolvedValueOnce(failure(code));
      const error = await Promise.resolve(
        channel.send({ id: 'n1', notification: 'x', channel: 'mail', recipient: alice, message: { subject: 's', text: 't' } }),
      ).catch((e: unknown) => e);
      return (error as MailDeliveryError).retryable;
    };

    expect(await retryable(mail, 'INVALID_TO')).toBe(false);
    expect(await retryable(mail, 'UNVERIFIED_DESTINATION')).toBe(false);
    expect(await retryable(mail, 'QUOTA_EXCEEDED')).toBe(true);
    // Resending after an unknown outcome could deliver twice, unless the send is idempotent.
    expect(await retryable(mail, 'OUTCOME_UNKNOWN')).toBe(false);
    expect(await retryable(idempotent, 'OUTCOME_UNKNOWN')).toBe(true);
  });

  it('reports per-recipient failures', async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({
      ok: false,
      deliveries: [
        { recipient: 'a@example.com', ok: true, messageId: 'm1' },
        { recipient: 'b@example.com', ok: false, error: { code: 'QUOTA_EXCEEDED', message: 'later' } },
      ],
    });
    const channel = mailChannel({ from: 'shop@example.com' });
    const error = await Promise.resolve(
      channel.send({ id: 'n1', notification: 'x', channel: 'mail', recipient: alice, message: { subject: 's', text: 't' } }),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: true });
    expect((error as Error).message).toContain('failed for b@example.com');
  });

  it('sends an idempotency key made from the notification id when asked', async () => {
    const notifier = createNotifier({
      channels: { mail: mailChannel({ from: 'shop@example.com', idempotent: true }) },
      generateId: () => 'abc',
    });
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: true, ids: [] });
    await notifier.sendNow(alice, Shipped, { id: 1 });
    expect(vi.mocked(sendEmail).mock.calls[0]![0]).toMatchObject({ idempotencyKey: 'trowel-abc' });
  });

  it('makes the queue retry a failed send', async () => {
    const sent: QueuedNotificationMessage[] = [];
    const notifier = createNotifier({
      channels: { mail: mailChannel({ from: 'shop@example.com' }) },
      queue: (message) => void sent.push(message),
      onQueuedError: () => {},
    });
    await notifier.send(alice, Shipped, { id: 5 });
    expect(inbox.messages).toHaveLength(0);

    vi.mocked(sendEmail).mockResolvedValueOnce(failure('UPSTREAM_ERROR'));
    const first = batchOf(sent);
    await notifier.consume(first.batch);
    expect(first.decisions).toEqual(['retry 0']);

    const second = batchOf(sent);
    await notifier.consume(second.batch);
    expect(second.decisions).toEqual(['ack 0']);
    expect(inbox.messages.map((m) => m.subject)).toEqual(['Order 5 shipped']);
  });
});
