import { notificationsTable } from '@trowelkit/notifications/void';
import { integer, sqliteTable, text } from 'void/schema-d1';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type Post = typeof posts.$inferSelect;

// In-app notifications, written by the notifier's database channel.
export const notifications = notificationsTable();
