import { and, asc, count, eq, gt, max, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Test } from './test.js';
import { testsTable } from './testsTable.js';

export interface TestsRepository {
  findByCollection(collectionId: string): Promise<Test[]>;
  findById(collectionId: string, testId: string): Promise<Test | null>;
  countByCollection(): Promise<Map<string, number>>;
  /** -1 if the collection has no tests */
  maxPosition(collectionId: string): Promise<number>;
  create(test: Test): Promise<void>;
  update(test: Test): Promise<void>;
  /** Deletes the test and shifts the positions of the following tests down by one */
  deleteAndCompact(test: Test): Promise<void>;
  /** Sets position = index in `orderedIds` for each test */
  reorder(collectionId: string, orderedIds: string[], updatedAt: Date): Promise<void>;
}

export class DrizzleTestsRepository implements TestsRepository {
  constructor(private readonly db: Db) {}

  async findByCollection(collectionId: string): Promise<Test[]> {
    return this.db
      .select()
      .from(testsTable)
      .where(eq(testsTable.collectionId, collectionId))
      .orderBy(asc(testsTable.position));
  }

  async findById(collectionId: string, testId: string): Promise<Test | null> {
    const [row] = await this.db
      .select()
      .from(testsTable)
      .where(and(eq(testsTable.collectionId, collectionId), eq(testsTable.id, testId)));
    return row ?? null;
  }

  async countByCollection(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ collectionId: testsTable.collectionId, count: count() })
      .from(testsTable)
      .groupBy(testsTable.collectionId);
    return new Map(rows.map((r) => [r.collectionId, r.count]));
  }

  async maxPosition(collectionId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(testsTable.position) })
      .from(testsTable)
      .where(eq(testsTable.collectionId, collectionId));
    return row?.value ?? -1;
  }

  async create(test: Test): Promise<void> {
    await this.db.insert(testsTable).values(test);
  }

  async update(test: Test): Promise<void> {
    await this.db.update(testsTable).set(test).where(eq(testsTable.id, test.id));
  }

  async deleteAndCompact(test: Test): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(testsTable).where(eq(testsTable.id, test.id)).run();
      tx.update(testsTable)
        .set({ position: sql`${testsTable.position} - 1` })
        .where(and(eq(testsTable.collectionId, test.collectionId), gt(testsTable.position, test.position)))
        .run();
    });
  }

  async reorder(collectionId: string, orderedIds: string[], updatedAt: Date): Promise<void> {
    this.db.transaction((tx) => {
      orderedIds.forEach((id, position) => {
        tx.update(testsTable)
          .set({ position, updatedAt })
          .where(and(eq(testsTable.collectionId, collectionId), eq(testsTable.id, id)))
          .run();
      });
    });
  }
}
