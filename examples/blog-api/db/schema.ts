import { notificationsTable } from '@trowelkit/notifications/void';
import { integer, sqliteTable, text } from 'void/schema-d1';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
  // Copied from the author's account, so notifications can reach them.
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
});

export type Post = typeof posts.$inferSelect;

// Written by a queued event listener, so the e2e script can see that it ran.
export const activity = sqliteTable('activity', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  postId: integer('post_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// The database channel's table.
export const notifications = notificationsTable();
