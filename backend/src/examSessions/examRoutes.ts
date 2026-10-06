import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { IdParamsSchema, withErrors } from '../apiSchemas.js';
import type { Deps } from '../deps.js';
import { StudentAnswerSchema } from '../tests/testSchemas.js';
import {
  ExamSessionSchema,
  SessionTestParamsSchema,
  StudentAnswerViewSchema,
  StudentExamViewSchema,
  SubmitResponseSchema,
  toExamSessionDto,
  toStudentAnswerViewDto,
  toStudentExamViewDto,
  toSubmitResponseDto,
} from './examSessionSchemas.js';

/** Student-side exam taking, mounted under /api/exam. No auth: the session id is the capability. */
export function makeExamRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      '/:id',
      {
        schema: {
          tags: ['exam'],
          description: 'Exam as seen by the student; includes `results` once submitted',
          params: IdParamsSchema,
          response: withErrors({ 200: StudentExamViewSchema }),
        },
      },
      async (req) => toStudentExamViewDto(await deps.examTakingService.view(req.params.id)),
    );

    app.post(
      '/:id/start',
      {
        schema: {
          tags: ['exam'],
          description: 'Start the exam (starts the timer). 409 if already started or submitted.',
          params: IdParamsSchema,
          response: withErrors({ 200: ExamSessionSchema }),
        },
      },
      async (req) => toExamSessionDto(await deps.examTakingService.start(req.params.id)),
    );

    app.put(
      '/:id/answers/:testId',
      {
        schema: {
          tags: ['exam'],
          description:
            'Save an answer. With showCorrectAnswer the answer is graded and locked immediately; ' +
            'without allowNavigation it is locked once set. 409 if locked, not in progress, or time is over.',
          params: SessionTestParamsSchema,
          body: StudentAnswerSchema,
          response: withErrors({ 200: StudentAnswerViewSchema }),
        },
      },
      async (req) =>
        toStudentAnswerViewDto(await deps.examTakingService.answer(req.params.id, req.params.testId, req.body)),
    );

    app.post(
      '/:id/submit',
      {
        schema: {
          tags: ['exam'],
          description: 'Grade and submit the exam. Idempotent.',
          params: IdParamsSchema,
          response: withErrors({ 200: SubmitResponseSchema }),
        },
      },
      async (req) => toSubmitResponseDto(await deps.examTakingService.submit(req.params.id)),
    );
  };
}
