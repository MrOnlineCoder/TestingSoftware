import { Type, type Static } from '@sinclair/typebox';
import { DateTimeSchema, Nullable, UuidSchema } from '../apiSchemas.js';
import {
  CorrectAnswerSchema,
  StudentAnswerSchema,
  StudentTestSchema,
  TestSchema,
  toTestDto,
} from '../tests/testSchemas.js';
import { toIso } from '../utils/time.js';
import { getSessionDeadline, type ExamAnswer, type ExamSession } from './examSession.js';
import type { ExamSessionDetail } from './examSessionsService.js';
import type { ResultsView, StudentAnswerView, StudentExamView } from './examTakingService.js';

export const ExamSessionSettingsSchema = Type.Object({
  allowNavigation: Type.Boolean(),
  showCorrectAnswer: Type.Boolean(),
  showScore: Type.Boolean(),
  timeLimitMinutes: Nullable(Type.Integer({ minimum: 1, maximum: 24 * 60 })),
});

export const ExamSessionSchema = Type.Object({
  id: Type.String(),
  collectionId: Nullable(Type.String()),
  collectionTitle: Type.String(),
  studentName: Type.String(),
  studentId: Nullable(Type.String()),
  settings: ExamSessionSettingsSchema,
  status: Type.Union([Type.Literal('created'), Type.Literal('in_progress'), Type.Literal('submitted')]),
  origin: Type.Union([Type.Literal('online'), Type.Literal('offline')]),
  createdAt: DateTimeSchema,
  startedAt: Nullable(DateTimeSchema),
  submittedAt: Nullable(DateTimeSchema),
  deadlineAt: Nullable(DateTimeSchema),
  totalScore: Nullable(Type.Number()),
  maxScore: Type.Number(),
});

export const ExamAnswerSchema = Type.Object({
  testId: Type.String(),
  answer: Nullable(StudentAnswerSchema),
  isCorrect: Nullable(Type.Boolean()),
  scoreAwarded: Nullable(Type.Number()),
  answeredAt: Nullable(DateTimeSchema),
  locked: Type.Boolean(),
});

export const ExamSessionDetailSchema = Type.Composite([
  ExamSessionSchema,
  Type.Object({
    tests: Type.Array(TestSchema),
    answers: Type.Array(ExamAnswerSchema),
    pendingManualGrading: Type.Integer(),
  }),
]);

export const StudentAnswerViewSchema = Type.Composite([
  ExamAnswerSchema,
  Type.Object({
    correctAnswer: Nullable(CorrectAnswerSchema),
    explanation: Nullable(Type.String()),
  }),
]);

export const ResultsViewSchema = Type.Object({
  totalScore: Nullable(Type.Number()),
  maxScore: Type.Number(),
  perQuestion: Type.Array(
    Type.Object({
      testId: Type.String(),
      answer: Nullable(StudentAnswerSchema),
      isCorrect: Nullable(Type.Boolean()),
      scoreAwarded: Nullable(Type.Number()),
      correctAnswer: Nullable(CorrectAnswerSchema),
      explanation: Nullable(Type.String()),
    }),
  ),
});

export const StudentExamViewSchema = Type.Object({
  session: ExamSessionSchema,
  tests: Type.Array(StudentTestSchema),
  answers: Type.Array(StudentAnswerViewSchema),
  results: Type.Optional(ResultsViewSchema),
});

export const SubmitResponseSchema = Type.Object({ session: ExamSessionSchema, results: ResultsViewSchema });

export const CreateExamSessionBodySchema = Type.Object({
  collectionId: UuidSchema,
  studentName: Type.String({ minLength: 1, maxLength: 200 }),
  studentId: Type.Optional(Nullable(Type.String({ maxLength: 100 }))),
  settings: ExamSessionSettingsSchema,
});

export const ListExamSessionsQuerySchema = Type.Object({ collectionId: Type.Optional(UuidSchema) });

export const GradeBodySchema = Type.Object({ scoreAwarded: Type.Number({ minimum: 0 }) });

export const SessionTestParamsSchema = Type.Object({ id: UuidSchema, testId: UuidSchema });

export type ExamSessionDto = Static<typeof ExamSessionSchema>;

export function toExamSessionDto(session: ExamSession): ExamSessionDto {
  return {
    id: session.id,
    collectionId: session.collectionId,
    collectionTitle: session.collectionTitle,
    studentName: session.studentName,
    studentId: session.studentId,
    settings: session.settings,
    status: session.status,
    origin: session.origin,
    createdAt: toIso(session.createdAt),
    startedAt: toIso(session.startedAt),
    submittedAt: toIso(session.submittedAt),
    deadlineAt: toIso(getSessionDeadline(session)),
    totalScore: session.totalScore,
    maxScore: session.maxScore,
  };
}

export function toExamAnswerDto(answer: ExamAnswer) {
  return {
    testId: answer.testId,
    answer: answer.answer,
    isCorrect: answer.isCorrect,
    scoreAwarded: answer.scoreAwarded,
    answeredAt: toIso(answer.answeredAt),
    locked: answer.locked,
  };
}

export function toExamSessionDetailDto(detail: ExamSessionDetail) {
  return {
    ...toExamSessionDto(detail.session),
    tests: detail.session.testsSnapshot.map(toTestDto),
    answers: detail.answers.map(toExamAnswerDto),
    pendingManualGrading: detail.pendingManualGrading,
  };
}

export function toStudentAnswerViewDto(answer: StudentAnswerView) {
  return { ...answer, answeredAt: toIso(answer.answeredAt) };
}

export function toStudentExamViewDto(view: StudentExamView) {
  return {
    session: toExamSessionDto(view.session),
    tests: view.tests,
    answers: view.answers.map(toStudentAnswerViewDto),
    ...(view.results ? { results: view.results } : {}),
  };
}

export function toSubmitResponseDto(result: { session: ExamSession; results: ResultsView }) {
  return { session: toExamSessionDto(result.session), results: result.results };
}
