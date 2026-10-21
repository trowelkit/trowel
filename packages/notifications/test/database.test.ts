import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { createDb } from 'void/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNotifier,
  databaseChannel,
  defineNotification,
  DeliveryError,
  notificationsTable,
  type QueuedNotificationMessage,
} from '../src/void.ts';
import { batchOf } from './helpers.ts';

interface User {
  id: string;
}

const alice: User = { id: 'alice' };
const bob: User = { id: 'bob' };

const Commented = defineNotification('post.commented', {
  database: (_user: User, comment: { postId: number; body: string }) => comment,
});

const table = notificationsTable();
let mf: Miniflare;
let d1: D1Database;
let db: ReturnType<typeof createDb>;

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: 'export default {}', compatibilityDate: '2026-02-24', d1Databases: ['DB'] }),
  );
  d1 = await mf.getD1Database('DB');
  // The columns notificationsTable() declares, as `void db push` creates them.
  await d1.exec(
    'CREATE TABLE notifications (id text PRIMARY KEY NOT NULL, type text NOT NULL, notifiable_id text NOT NULL, data text NOT NULL, read_at integer, created_at integer NOT NULL);',
  );
  db = createDb(d1);
});

afterAll(() => mf.dispose());

beforeEach(async () => {
  await d1.exec('DELETE FROM notifications;');
});

let clock = Date.parse('2026-01-01T00:00:00Z');
function setup() {
  const database = databaseChannel<User>({ db, table });
  let n = 0;
  const notifier = createNotifier({ channels: { database }, generateId: () => `n${++n}` });
  // Distinct timestamps, so "newest first" is well defined.
  const send = async (user: User, body: string) => {
    vi.setSystemTime((clock += 1000));
    await notifier.sendNow(user, Commented, { postId: 1, body });
  };
  return { database, notifier, send };
}

describe('databaseChannel', () => {
  beforeAll(() => void vi.useFakeTimers({ toFake: ['Date'] }));
  afterAll(() => void vi.useRealTimers());

  it('stores the database builder data for the recipient', async () => {
    const { database, send } = setup();
    await send(alice, 'Nice post');

    const [row] = await database.all(alice);
    expect(row).toEqual({
      id: 'n1',
      type: 'post.commented',
      notifiableId: 'alice',
      data: { postId: 1, body: 'Nice post' },
      readAt: null,
      createdAt: new Date(clock),
    });
  });

  it('lists unread notifications newest first and counts them', async () => {
    const { database, send } = setup();
    await send(alice, 'first');
    await send(alice, 'second');
    await send(bob, 'for bob');

    expect((await database.unread(alice)).map((r) => r.data.body)).toEqual(['second', 'first']);
    expect((await database.unread('alice', { limit: 1 })).map((r) => r.data.body)).toEqual(['second']);
    expect(await database.unreadCount(alice)).toBe(2);
    expect(await database.unreadCount(bob)).toBe(1);
  });

  it('marks some or all notifications as read, for their recipient only', async () => {
    const { database, send } = setup();
    await send(alice, 'one');
    await send(alice, 'two');
    await send(bob, 'three');

    expect(await database.markAsRead(alice, ['n1', 'n3'])).toBe(1);
    expect((await database.unread(alice)).map((r) => r.id)).toEqual(['n2']);
    expect(await database.markAsRead(alice, [])).toBe(0);
    expect(await database.markAsRead(alice)).toBe(1);
    expect(await database.markAsRead(alice)).toBe(0);
    expect(await database.unreadCount(alice)).toBe(0);
    expect(await database.unreadCount(bob)).toBe(1);

    const all = await database.all(alice);
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.readAt instanceof Date)).toBe(true);
  });

  it("doesn't store a retried delivery twice", async () => {
    const sent: QueuedNotificationMessage[] = [];
    const database = databaseChannel<User>({ db, table });
    const notifier = createNotifier({ channels: { database }, queue: (m) => void sent.push(m) });
    await notifier.send(alice, Commented, { postId: 2, body: 'again' });

    await notifier.consume(batchOf(sent).batch);
    await notifier.consume(batchOf(sent).batch);
    expect(await database.unreadCount(alice)).toBe(1);
  });

  it('uses recipientId to pick the stored id', async () => {
    const database = databaseChannel<{ slug: string }>({ db, table, recipientId: (team) => `team:${team.slug}` });
    const TeamNote = defineNotification('team.note', { database: (_team: { slug: string }) => ({}) });
    await createNotifier({ channels: { database } }).sendNow({ slug: 'core' }, TeamNote);

    expect(await database.unreadCount({ slug: 'core' })).toBe(1);
    expect(await database.unreadCount('team:core')).toBe(1);
  });

  it("doesn't retry a recipient without an id", async () => {
    const database = databaseChannel({ db, table });
    const error = await Promise.resolve(
      database.send({ id: 'x', notification: 'n', channel: 'database', recipient: {} as never, message: {} }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).toMatchObject({ retryable: false });
  });
});
