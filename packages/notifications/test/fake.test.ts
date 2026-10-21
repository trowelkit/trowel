import { describe, expect, it } from 'vitest';
import { createNotifier, defineNotification } from '../src/index.ts';
import { memoryChannel } from './helpers.ts';

interface User {
  id: string;
}

const alice: User = { id: 'alice' };
const bob: User = { id: 'bob' };

const Ping = defineNotification('ping', {
  mail: (user: User, data: { n: number }) => ({ subject: `Ping ${data.n}`, text: user.id }),
  database: (_user, data) => ({ n: data.n }),
});
const Pong = defineNotification('pong', { database: (_user: User) => ({}) });

function setup() {
  const mail = memoryChannel();
  const database = memoryChannel();
  const queued: unknown[] = [];
  const notifier = createNotifier({ channels: { mail, database }, queue: (m) => void queued.push(m) });
  return { mail, database, queued, notifier };
}

describe('notifier.fake', () => {
  it('records sends with their channels and messages instead of delivering them', async () => {
    const { database, queued, notifier } = setup();
    const fake = notifier.fake();
    await notifier.send([alice, bob], Ping, { n: 1 });
    await notifier.sendNow(alice, Pong);

    expect(queued).toEqual([]);
    expect(database.deliveries).toEqual([]);
    expect(fake.sent(Ping)).toEqual([
      {
        notification: 'ping',
        recipient: alice,
        payload: { n: 1 },
        channels: ['mail', 'database'],
        messages: { mail: { subject: 'Ping 1', text: 'alice' }, database: { n: 1 } },
      },
      expect.objectContaining({ recipient: bob }),
    ]);
    fake.assertSent(Ping);
    fake.assertSent(Ping, (sent) => sent.messages.mail?.subject === 'Ping 1');
    fake.assertSentTo(alice, Ping, (sent) => sent.payload.n === 1);
    fake.assertSentTo({ id: 'bob' }, Ping);
    fake.assertSentTimes(Ping, 2);
    fake.assertSentTo(alice, Pong);
    fake.assertNotSentTo(bob, Pong);
  });

  it('fails assertions with a readable message', async () => {
    const { notifier } = setup();
    const fake = notifier.fake();
    expect(() => fake.assertSent(Ping)).toThrow('Expected "ping" to be sent, but it wasn\'t.');
    fake.assertNothingSent();
    fake.assertNotSent(Ping);

    await notifier.send(alice, Ping, { n: 2 });
    expect(() => fake.assertSent(Ping, (s) => s.payload.n === 3)).toThrow('none of 1 matched');
    expect(() => fake.assertSentTo(bob, Ping)).toThrow('to be sent to the recipient');
    expect(() => fake.assertSentTo(alice, Ping, (s) => s.payload.n === 3)).toThrow('none of 1 matched');
    expect(() => fake.assertSentTimes(Ping, 2)).toThrow('to be sent 2 time(s), but it was sent 1');
    expect(() => fake.assertNotSent(Ping)).toThrow('not to be sent');
    expect(() => fake.assertNotSentTo(alice, Ping)).toThrow('not to be sent to the recipient');
    expect(() => fake.assertNothingSent()).toThrow('these were: ping');
  });

  it('fakes only some notifications when asked', async () => {
    const { database, queued, notifier } = setup();
    const fake = notifier.fake({ only: [Ping] });
    await notifier.send(alice, Ping, { n: 1 });
    await notifier.sendNow(alice, Pong);

    fake.assertSentTimes(Ping, 1);
    fake.assertNotSent(Pong);
    expect(queued).toEqual([]);
    expect(database.deliveries).toHaveLength(1);
  });

  it('stops faking after restore', async () => {
    const { queued, notifier } = setup();
    const fake = notifier.fake();
    fake.restore();
    await notifier.send(alice, Pong);
    expect(queued).toHaveLength(1);
    fake.assertNothingSent();
  });
});
