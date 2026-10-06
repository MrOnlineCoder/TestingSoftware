import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { deserializeTests, serializeTests } from '../tests/test.js';
import { ACTIVE_EXAM_SESSION_STATUSES, type ExamAnswer, type ExamSession } from './examSession.js';
import { examAnswersTable } from './examAnswersTable.js';
import { examSessionsTable } from './examSessionsTable.js';

export interface ExamSessionsFilter {
  collectionId?: string;
}

export interface ExamSessionsRepository {
  findAll(filter: ExamSessionsFilter): Promise<ExamSession[]>;
  findById(id: string): Promise<ExamSession | null>;
  findAnswers(sessionId: string): Promise<ExamAnswer[]>;
  findAnswer(sessionId: string, testId: string): Promise<ExamAnswer | null>;
  /** Number of sessions in status created / in_progress, per collection id */
  countActiveByCollection(): Promise<Map<string, number>>;
  countActive(collectionId: string): Promise<number>;
  /** Inserts the session together with its answer rows */
  create(session: ExamSession, answers: ExamAnswer[]): Promise<void>;
  update(session: ExamSession): Promise<void>;
  updateAnswer(answer: ExamAnswer): Promise<void>;
  /** Atomically stores the session and all of the given answers */
  updateWithAnswers(session: ExamSession, answers: ExamAnswer[]): Promise<void>;
  delete(id: string): Promise<void>;
}

type SessionRow = typeof examSessionsTable.$inferSelect;

function toRow(session: ExamSession): SessionRow {
  return { ...session, testsSnapshot: serializeTests(session.testsSnapshot) };
}

function fromRow(row: SessionRow): ExamSession {
  return { ...row, testsSnapshot: deserializeTests(row.testsSnapshot) };
}

export class DrizzleExamSessionsRepository implements ExamSessionsRepository {
  constructor(private readonly db: Db) {}

  async findAll(filter: ExamSessionsFilter): Promise<ExamSession[]> {
    const rows = await this.db
      .select()
      .from(examSessionsTable)
      .where(filter.collectionId ? eq(examSessionsTable.collectionId, filter.collectionId) : undefined)
      .orderBy(desc(examSessionsTable.createdAt));
    return rows.map(fromRow);
  }

  async findById(id: string): Promise<ExamSession | null> {
    const [row] = await this.db.select().from(examSessionsTable).where(eq(examSessionsTable.id, id));
    return row ? fromRow(row) : null;
  }

  async findAnswers(sessionId: string): Promise<ExamAnswer[]> {
    return this.db.select().from(examAnswersTable).where(eq(examAnswersTable.sessionId, sessionId));
  }

  async findAnswer(sessionId: string, testId: string): Promise<ExamAnswer | null> {
    const [row] = await this.db
      .select()
      .from(examAnswersTable)
      .where(and(eq(examAnswersTable.sessionId, sessionId), eq(examAnswersTable.testId, testId)));
    return row ?? null;
  }

  async countActiveByCollection(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ collectionId: examSessionsTable.collectionId, count: count() })
      .from(examSessionsTable)
      .where(inArray(examSessionsTable.status, ACTIVE_EXAM_SESSION_STATUSES))
      .groupBy(examSessionsTable.collectionId);
    const result = new Map<string, number>();
    for (const row of rows) {
      if (row.collectionId) {
        result.set(row.collectionId, row.count);
      }
    }
    return result;
  }

  async countActive(collectionId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(examSessionsTable)
      .where(
        and(
          eq(examSessionsTable.collectionId, collectionId),
          inArray(examSessionsTable.status, ACTIVE_EXAM_SESSION_STATUSES),
        ),
      );
    return row?.count ?? 0;
  }

  async create(session: ExamSession, answers: ExamAnswer[]): Promise<void> {
    this.db.transaction((tx) => {
      tx.insert(examSessionsTable).values(toRow(session)).run();
      if (answers.length > 0) {
        tx.insert(examAnswersTable).values(answers).run();
      }
    });
  }

  async update(session: ExamSession): Promise<void> {
    await this.db.update(examSessionsTable).set(toRow(session)).where(eq(examSessionsTable.id, session.id));
  }

  async updateAnswer(answer: ExamAnswer): Promise<void> {
    await this.db.update(examAnswersTable).set(answer).where(eq(examAnswersTable.id, answer.id));
  }

  async updateWithAnswers(session: ExamSession, answers: ExamAnswer[]): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(examSessionsTable).set(toRow(session)).where(eq(examSessionsTable.id, session.id)).run();
      for (const answer of answers) {
        tx.update(examAnswersTable).set(answer).where(eq(examAnswersTable.id, answer.id)).run();
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(examSessionsTable).where(eq(examSessionsTable.id, id));
  }
}
