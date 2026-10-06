import { Type, type Static } from '@sinclair/typebox';
import { DateTimeSchema, Nullable, UuidSchema } from '../apiSchemas.js';
import { toIso } from '../utils/time.js';
import type { Test } from './test.js';

export const QuestionTypeSchema = Type.Union([
  Type.Literal('single_choice'),
  Type.Literal('multiple_choice'),
  Type.Literal('number'),
  Type.Literal('free_text'),
]);

export const ChoiceOptionSchema = Type.Object({ id: Type.String(), text: Type.String() });

export const ChoiceOptionInputSchema = Type.Object({
  id: Type.Optional(UuidSchema),
  text: Type.String({ maxLength: 2000 }),
});

export const CorrectAnswerSchema = Type.Union([
  Type.Object({ type: Type.Literal('single_choice'), optionId: Type.String() }),
  Type.Object({ type: Type.Literal('multiple_choice'), optionIds: Type.Array(Type.String()) }),
  Type.Object({
    type: Type.Literal('number'),
    value: Type.Number(),
    tolerance: Type.Optional(Type.Number({ minimum: 0 })),
  }),
  Type.Object({ type: Type.Literal('free_text'), referenceAnswer: Type.String() }),
]);

export const StudentAnswerSchema = Type.Union([
  Type.Object({ type: Type.Literal('single_choice'), optionId: Nullable(Type.String()) }),
  Type.Object({ type: Type.Literal('multiple_choice'), optionIds: Type.Array(Type.String()) }),
  Type.Object({ type: Type.Literal('number'), value: Nullable(Type.Number()) }),
  Type.Object({ type: Type.Literal('free_text'), text: Type.String({ maxLength: 20000 }) }),
]);

export const TestSchema = Type.Object({
  id: Type.String(),
  collectionId: Type.String(),
  position: Type.Integer(),
  type: QuestionTypeSchema,
  prompt: Type.String(),
  explanation: Type.String(),
  score: Type.Number(),
  options: Type.Array(ChoiceOptionSchema),
  correctAnswer: CorrectAnswerSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const StudentTestSchema = Type.Object({
  id: Type.String(),
  position: Type.Integer(),
  type: QuestionTypeSchema,
  prompt: Type.String(),
  score: Type.Number(),
  options: Type.Array(ChoiceOptionSchema),
});

export const CreateTestBodySchema = Type.Object({
  type: QuestionTypeSchema,
  prompt: Type.String({ minLength: 1 }),
  explanation: Type.Optional(Type.String()),
  score: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  options: Type.Optional(
    Type.Array(ChoiceOptionInputSchema, {
      description:
        'Options without `id` get a server-generated id. In that case `correctAnswer` may reference such an option ' +
        'by its 0-based index written as a string, e.g. "0".',
    }),
  ),
  correctAnswer: CorrectAnswerSchema,
});

export const UpdateTestBodySchema = Type.Partial(CreateTestBodySchema);

export const ReorderTestsBodySchema = Type.Object({ testIds: Type.Array(Type.String()) });

export const CollectionTestParamsSchema = Type.Object({ collectionId: UuidSchema, testId: UuidSchema });

export type TestDto = Static<typeof TestSchema>;

export function toTestDto(test: Test): TestDto {
  return { ...test, createdAt: toIso(test.createdAt), updatedAt: toIso(test.updatedAt) };
}
