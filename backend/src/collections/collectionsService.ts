import { AppError, ErrorCode } from '../errors.js';
import type { ExamSessionsRepository } from '../examSessions/examSessionsRepository.js';
import type { Test } from '../tests/test.js';
import type { TestsRepository } from '../tests/testsRepository.js';
import { makeEntityId } from '../utils/id.js';
import { now } from '../utils/time.js';
import type { Collection, CollectionWithStats } from './collection.js';
import type { CollectionsRepository } from './collectionsRepository.js';

export interface CreateCollectionInput {
  title: string;
  description?: string;
}

export interface UpdateCollectionInput {
  title?: string;
  description?: string;
}

function normaliseTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Title must not be empty');
  }
  return trimmed;
}

export class CollectionsService {
  constructor(
    private readonly collectionsRepository: CollectionsRepository,
    private readonly testsRepository: TestsRepository,
    private readonly examSessionsRepository: ExamSessionsRepository,
  ) {}

  async list(): Promise<CollectionWithStats[]> {
    const [collections, testCounts, activeCounts] = await Promise.all([
      this.collectionsRepository.findAll(),
      this.testsRepository.countByCollection(),
      this.examSessionsRepository.countActiveByCollection(),
    ]);
    return collections.map((c) => ({
      ...c,
      testsCount: testCounts.get(c.id) ?? 0,
      activeSessionsCount: activeCounts.get(c.id) ?? 0,
    }));
  }

  async get(id: string): Promise<CollectionWithStats & { tests: Test[] }> {
    const collection = await this.getOrThrow(id);
    const [tests, activeSessionsCount] = await Promise.all([
      this.testsRepository.findByCollection(id),
      this.examSessionsRepository.countActive(id),
    ]);
    return { ...collection, testsCount: tests.length, activeSessionsCount, tests };
  }

  async create(input: CreateCollectionInput): Promise<CollectionWithStats> {
    const timestamp = now();
    const collection: Collection = {
      id: makeEntityId(),
      title: normaliseTitle(input.title),
      description: input.description ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.collectionsRepository.create(collection);
    return { ...collection, testsCount: 0, activeSessionsCount: 0 };
  }

  async update(id: string, input: UpdateCollectionInput): Promise<CollectionWithStats> {
    const collection = await this.assertEditable(id);
    const updated: Collection = {
      ...collection,
      title: input.title !== undefined ? normaliseTitle(input.title) : collection.title,
      description: input.description ?? collection.description,
      updatedAt: now(),
    };
    await this.collectionsRepository.update(updated);
    const tests = await this.testsRepository.findByCollection(id);
    return { ...updated, testsCount: tests.length, activeSessionsCount: 0 };
  }

  async delete(id: string): Promise<void> {
    await this.assertEditable(id);
    await this.collectionsRepository.delete(id);
  }

  async getOrThrow(id: string): Promise<Collection> {
    const collection = await this.collectionsRepository.findById(id);
    if (!collection) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Collection not found');
    }
    return collection;
  }

  /** Collections (and their tests) can only be changed while no exam session is active */
  async assertEditable(id: string): Promise<Collection> {
    const collection = await this.getOrThrow(id);
    const active = await this.examSessionsRepository.countActive(id);
    if (active > 0) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Collection has ${active} active exam session(s); finish or delete them before editing`,
      );
    }
    return collection;
  }

  /** Marks the collection as changed; used by test mutations (offline exam reuse relies on it) */
  async touch(id: string): Promise<void> {
    await this.collectionsRepository.touch(id, now());
  }
}
