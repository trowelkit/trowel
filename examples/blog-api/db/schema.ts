import { integer, sqliteTable, text } from 'void/schema-d1';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
});

export type Post = typeof posts.$inferSelect;
