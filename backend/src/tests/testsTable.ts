import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { collectionsTable } from '../collections/collectionsTable.js';
import { QUESTION_TYPES, type ChoiceOption, type CorrectAnswer } from './test.js';

export const testsTable = sqliteTable(
  'tests',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collectionsTable.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: text('type', { enum: QUESTION_TYPES }).notNull(),
    prompt: text('prompt').notNull(),
    explanation: text('explanation').notNull().default(''),
    score: real('score').notNull(),
    options: text('options', { mode: 'json' }).$type<ChoiceOption[]>().notNull(),
    correctAnswer: text('correct_answer', { mode: 'json' }).$type<CorrectAnswer>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('tests_collection_position_idx').on(t.collectionId, t.position)],
);
