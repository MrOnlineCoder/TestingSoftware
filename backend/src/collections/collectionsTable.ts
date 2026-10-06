import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const collectionsTable = sqliteTable('collections', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
