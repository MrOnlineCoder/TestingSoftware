import { Type } from '@sinclair/typebox';
import { DateTimeSchema, Nullable, UuidSchema } from '../apiSchemas.js';
import { StudentAnswerSchema, TestSchema, toTestDto } from '../tests/testSchemas.js';
import { toIso } from '../utils/time.js';
import type { OfflineExam } from './offlineExam.js';

export const OfflineExamSchema = Type.Object({
  id: Type.String(),
  collectionId: Nullable(Type.String()),
  collectionTitle: Type.String(),
  createdAt: DateTimeSchema,
  testsCount: Type.Integer(),
  /** number / free_text questions: not on the answer sheet, typed in by the teacher during review */
  skippedTestIds: Type.Array(Type.String()),
  questionsUrl: Type.String(),
  answerSheetUrl: Type.String(),
});

export const CreatedOfflineExamSchema = Type.Composite([OfflineExamSchema, Type.Object({ reused: Type.Boolean() })]);

export const OfflineExamDetailSchema = Type.Composite([
  OfflineExamSchema,
  Type.Object({ tests: Type.Array(TestSchema) }),
]);

export const ScanResultSchema = Type.Object({
  offlineExamId: Type.String(),
  detections: Type.Array(
    Type.Object({
      testId: Type.String(),
      answer: Nullable(StudentAnswerSchema),
      confidence: Type.Number(),
      status: Type.Union([
        Type.Literal('ok'),
        Type.Literal('ambiguous'),
        Type.Literal('empty'),
        Type.Literal('manual'),
      ]),
      raw: Type.Array(Type.Object({ bubbleIndex: Type.Integer(), optionId: Type.String(), fillRatio: Type.Number() })),
    }),
  ),
  overlayImage: Type.String({ description: 'PNG data URL' }),
});

export const FinalizeOfflineExamBodySchema = Type.Object({
  studentName: Type.String({ minLength: 1, maxLength: 200 }),
  studentId: Type.Optional(Nullable(Type.String({ maxLength: 100 }))),
  answers: Type.Record(UuidSchema, Nullable(StudentAnswerSchema)),
});

export function toOfflineExamDto(exam: OfflineExam) {
  return {
    id: exam.id,
    collectionId: exam.collectionId,
    collectionTitle: exam.collectionTitle,
    createdAt: toIso(exam.createdAt),
    testsCount: exam.testsSnapshot.length,
    skippedTestIds: exam.layout.skippedTestIds,
    questionsUrl: `/api/offline-exams/${exam.id}/questions.html`,
    answerSheetUrl: `/api/offline-exams/${exam.id}/answer-sheet.pdf`,
  };
}

export function toOfflineExamDetailDto(exam: OfflineExam) {
  return { ...toOfflineExamDto(exam), tests: exam.testsSnapshot.map(toTestDto) };
}
