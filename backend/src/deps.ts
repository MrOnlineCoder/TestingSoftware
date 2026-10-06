import path from 'node:path';
import { AuthService } from './auth/authService.js';
import { InMemorySessionStore } from './auth/sessionStore.js';
import { DrizzleCollectionsRepository } from './collections/collectionsRepository.js';
import { CollectionsService } from './collections/collectionsService.js';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import { DrizzleExamSessionsRepository } from './examSessions/examSessionsRepository.js';
import { ExamSessionsService } from './examSessions/examSessionsService.js';
import { ExamTakingService } from './examSessions/examTakingService.js';
import { DrizzleTestsRepository } from './tests/testsRepository.js';
import { FileAnswerSheetCache } from './offlineExams/answerSheetCache.js';
import { DrizzleOfflineExamsRepository } from './offlineExams/offlineExamsRepository.js';
import { OfflineExamsService } from './offlineExams/offlineExamsService.js';
import { OpenCvOmrEngine } from './offlineExams/omr/opencvOmrEngine.js';
import { QuestionsRenderer } from './offlineExams/questionsRenderer.js';
import { TestsService } from './tests/testsService.js';

/** Manual dependency injection: the whole object graph is built here, once */
export function createDeps(config: AppConfig, db: Db) {
  const collectionsRepository = new DrizzleCollectionsRepository(db);
  const testsRepository = new DrizzleTestsRepository(db);
  const examSessionsRepository = new DrizzleExamSessionsRepository(db);
  const offlineExamsRepository = new DrizzleOfflineExamsRepository(db);

  const sessionStore = new InMemorySessionStore();
  const authService = new AuthService(config.teacherPassword, sessionStore);

  const collectionsService = new CollectionsService(collectionsRepository, testsRepository, examSessionsRepository);
  const testsService = new TestsService(testsRepository, collectionsService);
  const examSessionsService = new ExamSessionsService(examSessionsRepository, collectionsService, testsRepository);
  const examTakingService = new ExamTakingService(examSessionsRepository);
  const offlineExamsService = new OfflineExamsService(
    offlineExamsRepository,
    collectionsService,
    testsRepository,
    examSessionsService,
    new OpenCvOmrEngine(),
    new QuestionsRenderer(config.resourcesDir),
    new FileAnswerSheetCache(path.join(config.dataDir, 'offline')),
  );

  return {
    config,
    collectionsRepository,
    testsRepository,
    examSessionsRepository,
    offlineExamsRepository,
    authService,
    collectionsService,
    testsService,
    examSessionsService,
    examTakingService,
    offlineExamsService,
  };
}

export type Deps = ReturnType<typeof createDeps>;
