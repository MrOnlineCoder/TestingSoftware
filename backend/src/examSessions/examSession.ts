import type { StudentAnswer, Test } from '../tests/test.js';
import { addMinutes } from '../utils/time.js';

export const EXAM_SESSION_STATUSES = ['created', 'in_progress', 'submitted'] as const;
export type ExamSessionStatus = (typeof EXAM_SESSION_STATUSES)[number];

export const EXAM_SESSION_ORIGINS = ['online', 'offline'] as const;
export type ExamSessionOrigin = (typeof EXAM_SESSION_ORIGINS)[number];

export const ACTIVE_EXAM_SESSION_STATUSES: ExamSessionStatus[] = ['created', 'in_progress'];

export interface ExamSessionSettings {
  allowNavigation: boolean;
  showCorrectAnswer: boolean;
  showScore: boolean;
  timeLimitMinutes: number | null;
}

export interface ExamSession {
  id: string;
  /** null if the collection was deleted later */
  collectionId: string | null;
  collectionTitle: string;
  studentName: string;
  studentId: string | null;
  settings: ExamSessionSettings;
  status: ExamSessionStatus;
  origin: ExamSessionOrigin;
  /** Full copy of the collection's tests at session creation; results always refer to it */
  testsSnapshot: Test[];
  createdAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  totalScore: number | null;
  maxScore: number;
}

export interface ExamAnswer {
  id: string;
  sessionId: string;
  testId: string;
  answer: StudentAnswer | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  locked: boolean;
  answeredAt: Date | null;
}

export function getSessionDeadline(session: ExamSession): Date | null {
  if (!session.startedAt || session.settings.timeLimitMinutes === null) {
    return null;
  }
  return addMinutes(session.startedAt, session.settings.timeLimitMinutes);
}

export function computeTotalScore(answers: ExamAnswer[]): number {
  return answers.reduce((sum, a) => sum + (a.scoreAwarded ?? 0), 0);
}

export function countPendingManualGrading(session: ExamSession, answers: ExamAnswer[]): number {
  if (session.status !== 'submitted') {
    return 0;
  }
  const freeTextIds = new Set(session.testsSnapshot.filter((t) => t.type === 'free_text').map((t) => t.id));
  return answers.filter((a) => freeTextIds.has(a.testId) && a.scoreAwarded === null).length;
}

/** Answers ordered like the snapshot tests */
export function sortAnswersBySnapshot(session: ExamSession, answers: ExamAnswer[]): ExamAnswer[] {
  const order = new Map(session.testsSnapshot.map((t, i) => [t.id, i]));
  return [...answers].sort((a, b) => (order.get(a.testId) ?? 0) - (order.get(b.testId) ?? 0));
}
