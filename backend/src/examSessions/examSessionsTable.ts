import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { collectionsTable } from '../collections/collectionsTable.js';
import type { SerializedTest } from '../tests/test.js';
import { EXAM_SESSION_ORIGINS, EXAM_SESSION_STATUSES, type ExamSessionSettings } from './examSession.js';

export const examSessionsTable = sqliteTable(
  'exam_sessions',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id').references(() => collectionsTable.id, { onDelete: 'set null' }),
    collectionTitle: text('collection_title').notNull(),
    studentName: text('student_name').notNull(),
    studentId: text('student_id'),
    settings: text('settings', { mode: 'json' }).$type<ExamSessionSettings>().notNull(),
    status: text('status', { enum: EXAM_SESSION_STATUSES }).notNull(),
    origin: text('origin', { enum: EXAM_SESSION_ORIGINS }).notNull(),
    testsSnapshot: text('tests_snapshot', { mode: 'json' }).$type<SerializedTest[]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
    totalScore: real('total_score'),
    maxScore: real('max_score').notNull(),
  },
  (t) => [index('exam_sessions_collection_idx').on(t.collectionId)],
);
