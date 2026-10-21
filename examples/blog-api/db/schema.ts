import { integer, sqliteTable, text } from 'void/schema-d1';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
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
