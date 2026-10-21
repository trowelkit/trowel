import { describe, expect, it, vi } from 'vitest';
import {
  createNotifier,
  defineNotification,
  DeliveryError,
  type QueuedNotificationMessage,
} from '../src/index.ts';
import { batchOf, memoryChannel } from './helpers.ts';

interface User {
  id: string;
  email: string;
  wantsMail?: boolean;
}

const alice: User = { id: 'alice', email: 'alice@example.com' };
const bob: User = { id: 'bob', email: 'bob@example.com', wantsMail: false };

const InvoicePaid = defineNotification('invoice.paid', {
  mail: (user: User, invoice: { number: number }) => ({ subject: `Invoice ${invoice.number} paid`, text: `Thanks, ${user.id}.` }),
  database: (_user, invoice) => ({ number: invoice.number }),
});

const Welcome = defineNotification('welcome', {
  database: (user: User) => ({ hello: user.id }),
});

const Picky = defineNotification('picky', {
  via: (user: User) => (user.wantsMail === false ? ['database'] : ['mail', 'database']),
  mail: () => ({ subject: 'Hi', text: 'Hi' }),
  database: () => ({}),
});

function setup(queue?: (message: QueuedNotificationMessage) => unknown) {
  const mail = memoryChannel();
  const database = memoryChannel();
  const notifier = createNotifier({ channels: { mail, database }, ...(queue && { queue }), generateId: ids() });
  return { mail, database, notifier };
}

function ids() {
  let n = 0;
  return () => `n${++n}`;
}

describe('defineNotification', () => {
  it('needs a name', () => {
    expect(() => defineNotification('', {})).toThrow('needs a name');
  });
});

describe('sendNow', () => {
  it('delivers on every channel the notification has a builder for', async () => {
    const { mail, database, notifier } = setup();
    await notifier.sendNow(alice, InvoicePaid, { number: 7 });

    expect(mail.deliveries).toEqual([
      {
        id: 'n1',
        notification: 'invoice.paid',
        channel: 'mail',
        recipient: alice,
        message: { subject: 'Invoice 7 paid', text: 'Thanks, alice.' },
      },
    ]);
    expect(database.deliveries).toEqual([
      { id: 'n1', notification: 'invoice.paid', channel: 'database', recipient: alice, message: { number: 7 } },
    ]);
  });

  it('sends to several recipients, each with its own id', async () => {
    const { database, notifier } = setup();
    await notifier.sendNow([alice, bob], Welcome);
    expect(database.deliveries.map((d) => [d.id, d.message])).toEqual([
      ['n1', { hello: 'alice' }],
      ['n2', { hello: 'bob' }],
    ]);
  });

  it('lets via pick channels per recipient', async () => {
    const { mail, database, notifier } = setup();
    await notifier.sendNow([alice, bob], Picky);
    expect(mail.deliveries.map((d) => d.recipient)).toEqual([alice]);
    expect(database.deliveries.map((d) => d.recipient)).toEqual([alice, bob]);
  });

  it('delivers once per channel even if via repeats it', async () => {
    const Twice = defineNotification('twice', { via: () => ['database', 'database'], database: (_user: User) => ({}) });
    const { database, notifier } = setup();
    await notifier.sendNow(alice, Twice);
    expect(database.deliveries).toHaveLength(1);
  });

  it('rejects channels the notifier does not have', async () => {
    const Sms = defineNotification('sms', { sms: (_user: User) => 'hi' });
    const ViaSms = defineNotification('via-sms', { via: () => ['sms'], database: (_user: User) => ({}) });
    const { notifier } = setup();
    await expect(notifier.sendNow(alice, Sms)).rejects.toThrow('the notifier has no channel by that name');
    await expect(notifier.sendNow(alice, ViaSms)).rejects.toThrow('"sms" channel');
  });

  it('rejects a channel picked by via without a builder', async () => {
    const NoMail = defineNotification('no-mail', { via: () => ['mail'], database: (_user: User) => ({}) });
    const { notifier } = setup();
    await expect(notifier.sendNow(alice, NoMail)).rejects.toThrow('has no "mail" builder');
  });

  it('builds every message before delivering any', async () => {
    const Broken = defineNotification('broken', {
      database: (user: User) => {
        if (user.id === 'bob') throw new Error('no data for bob');
        return {};
      },
    });
    const { database, notifier } = setup();
    await expect(notifier.sendNow([alice, bob], Broken)).rejects.toThrow('no data for bob');
    expect(database.deliveries).toEqual([]);
  });

  it('attempts every delivery and throws the error', async () => {
    const failing = { send: vi.fn(() => Promise.reject(new Error('mail down'))) };
    const database = memoryChannel();
    const notifier = createNotifier({ channels: { mail: failing, database } });
    await expect(notifier.sendNow(alice, InvoicePaid, { number: 1 })).rejects.toThrow('mail down');
    expect(database.deliveries).toHaveLength(1);
  });

  it('throws an AggregateError when several deliveries fail', async () => {
    const failing = { send: () => Promise.reject(new Error('down')) };
    const notifier = createNotifier({ channels: { mail: failing, database: failing } });
    const error = await notifier.sendNow(alice, InvoicePaid, { number: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
  });

  it('delivers right away even when a queue is configured', async () => {
    const queue = vi.fn();
    const { database, notifier } = setup(queue);
    await notifier.sendNow(alice, Welcome);
    expect(queue).not.toHaveBeenCalled();
    expect(database.deliveries).toHaveLength(1);
  });
});

describe('send', () => {
  it('delivers right away without a queue', async () => {
    const { database, notifier } = setup();
    await notifier.send(alice, Welcome);
    expect(database.deliveries).toHaveLength(1);
  });

  it('queues one message per recipient and channel, sharing the id across channels', async () => {
    const sent: QueuedNotificationMessage[] = [];
    const { mail, notifier } = setup((message) => void sent.push(message));
    await notifier.send([alice, bob], Picky);

    expect(mail.deliveries).toEqual([]);
    expect(sent.map((m) => [m.id, m.channel, (m.recipient as User).id])).toEqual([
      ['n1', 'mail', 'alice'],
      ['n1', 'database', 'alice'],
      ['n2', 'database', 'bob'],
    ]);
    expect(sent[0]).toMatchObject({ type: 'trowel.notification', notification: 'picky', message: { subject: 'Hi' } });
    expect(typeof sent[0]!.sentAt).toBe('number');
  });

  it('queues nothing when a builder fails', async () => {
    const queue = vi.fn();
    const Broken = defineNotification('broken', {
      mail: () => ({ subject: 'ok', text: 'ok' }),
      database: (_user: User): Record<string, unknown> => {
        throw new Error('nope');
      },
    });
    const { notifier } = setup(queue);
    await expect(notifier.send(alice, Broken)).rejects.toThrow('nope');
    expect(queue).not.toHaveBeenCalled();
  });
});

describe('consume', () => {
  async function queued(notification = InvoicePaid) {
    const sent: QueuedNotificationMessage[] = [];
    const notifier = createNotifier({ channels: { mail: memoryChannel(), database: memoryChannel() }, queue: (m) => void sent.push(m) });
    await notifier.send(alice, notification, { number: 3 });
    return sent;
  }

  it('delivers queued messages and acks them', async () => {
    const sent = await queued();
    const { mail, database, notifier } = setup();
    const { batch, decisions } = batchOf(sent);
    await notifier.consume(batch);

    expect(decisions).toEqual(['ack 0', 'ack 1']);
    expect(mail.deliveries[0]).toMatchObject({ notification: 'invoice.paid', channel: 'mail', recipient: alice });
    expect(database.deliveries[0]!.message).toEqual({ number: 3 });
    expect(mail.deliveries[0]!.id).toBe(database.deliveries[0]!.id);
  });

  it('retries a failed delivery and reports it', async () => {
    const sent = await queued();
    const onQueuedError = vi.fn();
    const notifier = createNotifier({
      channels: { mail: { send: () => Promise.reject(new Error('mail down')) }, database: memoryChannel() },
      onQueuedError,
    });
    const { batch, decisions } = batchOf(sent);
    await notifier.consume(batch);

    expect(decisions).toEqual(['retry 0', 'ack 1']);
    expect(onQueuedError).toHaveBeenCalledWith(expect.any(Error), sent[0], { retrying: true });
  });

  it("acks a failure that retrying can't fix", async () => {
    const sent = await queued();
    const onQueuedError = vi.fn();
    const permanent = new DeliveryError('bad address', { retryable: false });
    const notifier = createNotifier({
      channels: { mail: { send: () => Promise.reject(permanent) }, database: memoryChannel() },
      onQueuedError,
    });
    const { batch, decisions } = batchOf(sent);
    await notifier.consume(batch);

    expect(decisions).toEqual(['ack 0', 'ack 1']);
    expect(onQueuedError).toHaveBeenCalledWith(permanent, sent[0], { retrying: false });
  });

  it('logs failures with console.error by default', async () => {
    const sent = await queued();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifier = createNotifier({
      channels: { mail: { send: () => Promise.reject(new Error('x')) }, database: memoryChannel() },
    });
    await notifier.consume(batchOf(sent).batch);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"invoice.paid" failed on the "mail" channel; it will be retried'), expect.any(Error));
    error.mockRestore();
  });

  it('acks messages it does not understand and channels it no longer has', async () => {
    const sent = await queued();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notifier = createNotifier({ channels: { database: memoryChannel() } });
    const { batch, decisions } = batchOf([{ hello: 'world' }, ...sent]);
    await notifier.consume(batch);

    expect(decisions).toEqual(['ack 0', 'ack 1', 'ack 2']);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('types', () => {
  it('checks recipients, payloads and builders', () => {
    // Checked by `tsc` only; never called.
    const typeOnly = async () => {
      const { notifier } = setup();
      // @ts-expect-error the payload is required
      await notifier.send(alice, InvoicePaid);
      // @ts-expect-error the payload has the wrong shape
      await notifier.send(alice, InvoicePaid, { number: 'seven' });
      // @ts-expect-error Welcome has no payload
      await notifier.send(alice, Welcome, { extra: true });
      // @ts-expect-error the recipient must be a User
      await notifier.send({ id: 1 }, Welcome);
      defineNotification('bad-mail', {
        // @ts-expect-error a mail message needs a subject
        mail: (_user: User) => ({ text: 'no subject' }),
      });
    };
    void typeOnly;
  });
});
