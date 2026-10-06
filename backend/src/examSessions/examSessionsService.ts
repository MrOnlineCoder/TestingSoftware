import type { CollectionsService } from '../collections/collectionsService.js';
import { AppError, ErrorCode } from '../errors.js';
import type { Test } from '../tests/test.js';
import type { TestsRepository } from '../tests/testsRepository.js';
import { makeEntityId } from '../utils/id.js';
import { round2 } from '../utils/math.js';
import { now } from '../utils/time.js';
import {
  computeTotalScore,
  countPendingManualGrading,
  sortAnswersBySnapshot,
  type ExamAnswer,
  type ExamSession,
  type ExamSessionSettings,
} from './examSession.js';
import type { ExamSessionsFilter, ExamSessionsRepository } from './examSessionsRepository.js';
import { gradeAnswersForSubmission, makeEmptyAnswers } from './sessionGrading.js';

export interface CreateExamSessionInput {
  collectionId: string;
  studentName: string;
  studentId?: string | null;
  settings: ExamSessionSettings;
}

export interface CreateSubmittedSessionInput {
  collectionId: string | null;
  collectionTitle: string;
  studentName: string;
  studentId: string | null;
  settings: ExamSessionSettings;
  tests: Test[];
  /** answers by test id; missing tests count as unanswered */
  answers: Map<string, ExamAnswer['answer']>;
}

export interface ExamSessionDetail {
  session: ExamSession;
  answers: ExamAnswer[];
  pendingManualGrading: number;
}

function normaliseStudent(name: string, id: string | null | undefined): { studentName: string; studentId: string | null } {
  const studentName = name.trim();
  if (studentName === '') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Student name must not be empty');
  }
  const studentId = id?.trim() ? id.trim() : null;
  return { studentName, studentId };
}

function maxScoreOf(tests: Test[]): number {
  return round2(tests.reduce((sum, t) => sum + t.score, 0));
}

/** Teacher-side management of exam sessions */
export class ExamSessionsService {
  constructor(
    private readonly examSessionsRepository: ExamSessionsRepository,
    private readonly collectionsService: CollectionsService,
    private readonly testsRepository: TestsRepository,
  ) {}

  async create(input: CreateExamSessionInput): Promise<ExamSession> {
    const collection = await this.collectionsService.getOrThrow(input.collectionId);
    const tests = await this.testsRepository.findByCollection(collection.id);
    if (tests.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Collection has no tests; add at least one question first');
    }
    const { timeLimitMinutes } = input.settings;
    if (timeLimitMinutes !== null && !(Number.isInteger(timeLimitMinutes) && timeLimitMinutes > 0)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Time limit must be a positive whole number of minutes');
    }

    const session: ExamSession = {
      id: makeEntityId(),
      collectionId: collection.id,
      collectionTitle: collection.title,
      ...normaliseStudent(input.studentName, input.studentId),
      settings: { ...input.settings },
      status: 'created',
      origin: 'online',
      testsSnapshot: tests,
      createdAt: now(),
      startedAt: null,
      submittedAt: null,
      totalScore: null,
      maxScore: maxScoreOf(tests),
    };

    await this.examSessionsRepository.create(session, makeEmptyAnswers(session.id, tests));
    return session;
  }

  /** Creates an already submitted and graded session (used by offline exams) */
  async createSubmitted(input: CreateSubmittedSessionInput): Promise<ExamSession> {
    const timestamp = now();
    const id = makeEntityId();
    const filled = makeEmptyAnswers(id, input.tests).map((a) => {
      const answer = input.answers.get(a.testId) ?? null;
      return { ...a, answer, answeredAt: answer ? timestamp : null };
    });
    const answers = gradeAnswersForSubmission(input.tests, filled);

    const session: ExamSession = {
      id,
      collectionId: input.collectionId,
      collectionTitle: input.collectionTitle,
      ...normaliseStudent(input.studentName, input.studentId),
      settings: input.settings,
      status: 'submitted',
      origin: 'offline',
      testsSnapshot: input.tests,
      createdAt: timestamp,
      startedAt: timestamp,
      submittedAt: timestamp,
      totalScore: round2(computeTotalScore(answers)),
      maxScore: maxScoreOf(input.tests),
    };

    await this.examSessionsRepository.create(session, answers);
    return session;
  }

  async list(filter: ExamSessionsFilter): Promise<ExamSession[]> {
    return this.examSessionsRepository.findAll(filter);
  }

  async get(id: string): Promise<ExamSessionDetail> {
    const session = await this.getOrThrow(id);
    const answers = sortAnswersBySnapshot(session, await this.examSessionsRepository.findAnswers(id));
    return { session, answers, pendingManualGrading: countPendingManualGrading(session, answers) };
  }

  async delete(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.examSessionsRepository.delete(id);
  }

  async gradeFreeText(sessionId: string, testId: string, scoreAwarded: number): Promise<ExamSessionDetail> {
    const session = await this.getOrThrow(sessionId);
    if (session.status !== 'submitted') {
      throw new AppError(ErrorCode.CONFLICT, 'Only submitted sessions can be graded manually');
    }
    const test = session.testsSnapshot.find((t) => t.id === testId);
    if (!test) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Question not found in this session');
    }
    if (test.type !== 'free_text') {
      throw new AppError(ErrorCode.CONFLICT, 'Only free-text questions are graded manually');
    }
    if (!Number.isFinite(scoreAwarded) || scoreAwarded < 0 || scoreAwarded > test.score) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `Score must be between 0 and ${test.score}`);
    }

    const answers = await this.examSessionsRepository.findAnswers(sessionId);
    const answer = answers.find((a) => a.testId === testId);
    if (!answer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Answer not found');
    }
    const graded: ExamAnswer = { ...answer, scoreAwarded: round2(scoreAwarded), isCorrect: null };
    const updatedAnswers = answers.map((a) => (a.id === graded.id ? graded : a));
    const updatedSession: ExamSession = { ...session, totalScore: round2(computeTotalScore(updatedAnswers)) };

    await this.examSessionsRepository.updateWithAnswers(updatedSession, [graded]);
    return {
      session: updatedSession,
      answers: sortAnswersBySnapshot(updatedSession, updatedAnswers),
      pendingManualGrading: countPendingManualGrading(updatedSession, updatedAnswers),
    };
  }

  private async getOrThrow(id: string): Promise<ExamSession> {
    const session = await this.examSessionsRepository.findById(id);
    if (!session) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Exam session not found');
    }
    return session;
  }
}
