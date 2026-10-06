import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { StudentAnswer } from '../tests/test.js';
import { examSessionsTable } from './examSessionsTable.js';

export const examAnswersTable = sqliteTable(
  'exam_answers',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => examSessionsTable.id, { onDelete: 'cascade' }),
    testId: text('test_id').notNull(),
    answer: text('answer', { mode: 'json' }).$type<StudentAnswer>(),
    isCorrect: integer('is_correct', { mode: 'boolean' }),
    scoreAwarded: real('score_awarded'),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    answeredAt: integer('answered_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('exam_answers_session_test_idx').on(t.sessionId, t.testId)],
);
