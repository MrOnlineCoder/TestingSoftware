import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { collectionsTable } from '../collections/collectionsTable.js';
import type { SerializedTest } from '../tests/test.js';
import type { OfflineExamSettings } from './offlineExam.js';
import type { SheetLayout } from './sheetLayout.js';

export const offlineExamsTable = sqliteTable(
  'offline_exams',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id').references(() => collectionsTable.id, { onDelete: 'set null' }),
    collectionTitle: text('collection_title').notNull(),
    testsSnapshot: text('tests_snapshot', { mode: 'json' }).$type<SerializedTest[]>().notNull(),
    layout: text('layout', { mode: 'json' }).$type<SheetLayout>().notNull(),
    settings: text('settings', { mode: 'json' }).$type<OfflineExamSettings>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('offline_exams_collection_idx').on(t.collectionId, t.createdAt)],
);
