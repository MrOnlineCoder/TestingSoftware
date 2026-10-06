import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Collection } from './collection.js';
import { collectionsTable } from './collectionsTable.js';

export interface CollectionsRepository {
  findAll(): Promise<Collection[]>;
  findById(id: string): Promise<Collection | null>;
  create(collection: Collection): Promise<void>;
  update(collection: Collection): Promise<void>;
  touch(id: string, updatedAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export class DrizzleCollectionsRepository implements CollectionsRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<Collection[]> {
    return this.db.select().from(collectionsTable).orderBy(desc(collectionsTable.createdAt));
  }

  async findById(id: string): Promise<Collection | null> {
    const [row] = await this.db.select().from(collectionsTable).where(eq(collectionsTable.id, id));
    return row ?? null;
  }

  async create(collection: Collection): Promise<void> {
    await this.db.insert(collectionsTable).values(collection);
  }

  async update(collection: Collection): Promise<void> {
    await this.db.update(collectionsTable).set(collection).where(eq(collectionsTable.id, collection.id));
  }

  async touch(id: string, updatedAt: Date): Promise<void> {
    await this.db.update(collectionsTable).set({ updatedAt }).where(eq(collectionsTable.id, id));
  }

  async delete(id: string): Promise<void> {
    // tests are removed by ON DELETE CASCADE, exam/offline sessions keep their snapshot (ON DELETE SET NULL)
    await this.db.delete(collectionsTable).where(eq(collectionsTable.id, id));
  }
}
