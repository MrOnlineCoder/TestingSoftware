import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { deserializeTests, serializeTests } from '../tests/test.js';
import type { OfflineExam } from './offlineExam.js';
import { offlineExamsTable } from './offlineExamsTable.js';

export interface OfflineExamsRepository {
  findById(id: string): Promise<OfflineExam | null>;
  findLatestByCollection(collectionId: string): Promise<OfflineExam | null>;
  create(exam: OfflineExam): Promise<void>;
}

type OfflineExamRow = typeof offlineExamsTable.$inferSelect;

function toRow(exam: OfflineExam): OfflineExamRow {
  return { ...exam, testsSnapshot: serializeTests(exam.testsSnapshot) };
}

function fromRow(row: OfflineExamRow): OfflineExam {
  return { ...row, testsSnapshot: deserializeTests(row.testsSnapshot) };
}

export class DrizzleOfflineExamsRepository implements OfflineExamsRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<OfflineExam | null> {
    const [row] = await this.db.select().from(offlineExamsTable).where(eq(offlineExamsTable.id, id));
    return row ? fromRow(row) : null;
  }

  async findLatestByCollection(collectionId: string): Promise<OfflineExam | null> {
    const [row] = await this.db
      .select()
      .from(offlineExamsTable)
      .where(eq(offlineExamsTable.collectionId, collectionId))
      .orderBy(desc(offlineExamsTable.createdAt))
      .limit(1);
    return row ? fromRow(row) : null;
  }

  async create(exam: OfflineExam): Promise<void> {
    await this.db.insert(offlineExamsTable).values(toRow(exam));
  }
}
