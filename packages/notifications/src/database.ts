import { and, count, db as voidDb, desc, eq, inArray, isNull, type DrizzleD1Database } from 'void/db';
import { index, integer, sqliteTable, text } from 'void/schema-d1';
import { DeliveryError, type Channel, type Delivery } from './channel.ts';
import type { DatabaseMessage } from './notification.ts';

/**
 * A D1 table for the database channel. Export it from `db/schema.ts`:
 *
 * ```ts
 * export const notifications = notificationsTable();
 * ```
 */
export function notificationsTable(name = 'notifications') {
  return sqliteTable(
    name,
    {
      id: text('id').primaryKey(),
      /** The notification's name. */
      type: text('type').notNull(),
      notifiableId: text('notifiable_id').notNull(),
      data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
      readAt: integer('read_at', { mode: 'timestamp_ms' }),
      createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (table) => [index(`${name}_notifiable_id_read_at_idx`).on(table.notifiableId, table.readAt)],
  );
}

export type NotificationsTable = ReturnType<typeof notificationsTable>;

/** A stored notification. */
export interface StoredNotification {
  readonly id: string;
  readonly type: string;
  readonly notifiableId: string;
  readonly data: Record<string, unknown>;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export type NotifiableId = string | number;

export interface DatabaseChannelOptions<R> {
  /** The table from `notificationsTable()`. */
  table: NotificationsTable;
  /** Defaults to Void's `db`. */
  db?: DrizzleD1Database<any>;
  /** The id a recipient's notifications are stored under. Defaults to `recipient.id`. */
  recipientId?: (recipient: R) => NotifiableId;
}

export interface ListOptions {
  /** At most this many, newest first. */
  limit?: number;
}

/** The database channel, plus queries for a recipient's stored notifications. */
export interface DatabaseChannel<R> extends Channel<DatabaseMessage, R> {
  /** A recipient's notifications, newest first. Pass the recipient or its id. */
  all(recipient: R | NotifiableId, options?: ListOptions): Promise<StoredNotification[]>;
  /** A recipient's unread notifications, newest first. */
  unread(recipient: R | NotifiableId, options?: ListOptions): Promise<StoredNotification[]>;
  unreadCount(recipient: R | NotifiableId): Promise<number>;
  /**
   * Marks a recipient's notifications as read: the given ids, or all of them.
   * Ids of other recipients' notifications are ignored. Returns how many changed.
   */
  markAsRead(recipient: R | NotifiableId, ids?: readonly string[]): Promise<number>;
}

/**
 * Stores the `database` builder's data in a table, for an in-app list of
 * notifications. Retried deliveries don't create duplicates.
 */
export function databaseChannel<R = { readonly id: NotifiableId }>(options: DatabaseChannelOptions<R>): DatabaseChannel<R> {
  const { table } = options;
  const database = () => options.db ?? voidDb;
  const recipientId = options.recipientId ?? ((recipient: R) => (recipient as { id?: NotifiableId } | null)?.id);

  function idOf(recipient: R | NotifiableId): string {
    if (typeof recipient === 'string' || typeof recipient === 'number') return String(recipient);
    const id = recipientId(recipient);
    if (id === undefined || id === null || id === '') {
      throw new Error('The recipient has no id. Pass `recipientId` to databaseChannel().');
    }
    return String(id);
  }

  function list(recipient: R | NotifiableId, unreadOnly: boolean, { limit }: ListOptions = {}) {
    const owner = eq(table.notifiableId, idOf(recipient));
    const query = database()
      .select()
      .from(table)
      .where(unreadOnly ? and(owner, isNull(table.readAt)) : owner)
      .orderBy(desc(table.createdAt), desc(table.id));
    return (limit === undefined ? query : query.limit(limit)) as Promise<StoredNotification[]>;
  }

  return {
    async send({ id, notification, recipient, message }: Delivery<DatabaseMessage, R>) {
      let notifiableId: string;
      try {
        notifiableId = idOf(recipient);
      } catch (error) {
        throw new DeliveryError(`"${notification}" can't be stored: the recipient has no id.`, { retryable: false, cause: error });
      }
      await database()
        .insert(table)
        .values({ id, type: notification, notifiableId, data: { ...message }, createdAt: new Date() })
        .onConflictDoNothing();
    },
    all: (recipient, listOptions) => list(recipient, false, listOptions),
    unread: (recipient, listOptions) => list(recipient, true, listOptions),
    async unreadCount(recipient) {
      const [row] = await database()
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.notifiableId, idOf(recipient)), isNull(table.readAt)));
      return row?.n ?? 0;
    },
    async markAsRead(recipient, ids) {
      if (ids?.length === 0) return 0;
      const owner = and(eq(table.notifiableId, idOf(recipient)), isNull(table.readAt));
      const updated = await database()
        .update(table)
        .set({ readAt: new Date() })
        .where(ids ? and(owner, inArray(table.id, [...ids])) : owner)
        .returning({ id: table.id });
      return updated.length;
    },
  };
}
