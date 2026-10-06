import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { IdParamsSchema, TEACHER_SECURITY, withErrors } from '../apiSchemas.js';
import { requireTeacher } from '../auth/requireTeacher.js';
import type { Deps } from '../deps.js';
import {
  CreateExamSessionBodySchema,
  ExamSessionDetailSchema,
  ExamSessionSchema,
  GradeBodySchema,
  ListExamSessionsQuerySchema,
  SessionTestParamsSchema,
  toExamSessionDetailDto,
  toExamSessionDto,
} from './examSessionSchemas.js';

/** Teacher-side exam session management, mounted under /api/exam-sessions */
export function makeExamSessionsRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.addHook('preHandler', requireTeacher(deps));

    app.get(
      '/',
      {
        schema: {
          tags: ['exam-sessions'],
          description: 'All exam sessions, newest first, optionally filtered by collection',
          security: TEACHER_SECURITY,
          querystring: ListExamSessionsQuerySchema,
          response: withErrors({ 200: Type.Array(ExamSessionSchema) }),
        },
      },
      async (req) => (await deps.examSessionsService.list(req.query)).map(toExamSessionDto),
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['exam-sessions'],
          description: 'Create a session from the current tests of a collection (snapshot). 400 if it has no tests.',
          security: TEACHER_SECURITY,
          body: CreateExamSessionBodySchema,
          response: withErrors({ 201: ExamSessionSchema }),
        },
      },
      async (req, reply) => {
        const session = await deps.examSessionsService.create(req.body);
        return reply.code(201).send(toExamSessionDto(session));
      },
    );

    app.get(
      '/:id',
      {
        schema: {
          tags: ['exam-sessions'],
          description: 'Full session including snapshot tests with correct answers and all answers',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 200: ExamSessionDetailSchema }),
        },
      },
      async (req) => toExamSessionDetailDto(await deps.examSessionsService.get(req.params.id)),
    );

    app.delete(
      '/:id',
      {
        schema: {
          tags: ['exam-sessions'],
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 204: Type.Null() }),
        },
      },
      async (req, reply) => {
        await deps.examSessionsService.delete(req.params.id);
        return reply.code(204).send(null);
      },
    );

    app.patch(
      '/:id/answers/:testId/grade',
      {
        schema: {
          tags: ['exam-sessions'],
          description:
            'Manually grade a free-text answer of a submitted session (0 ≤ scoreAwarded ≤ test score). ' +
            'Returns the session detail with the recomputed totalScore.',
          security: TEACHER_SECURITY,
          params: SessionTestParamsSchema,
          body: GradeBodySchema,
          response: withErrors({ 200: ExamSessionDetailSchema }),
        },
      },
      async (req) =>
        toExamSessionDetailDto(
          await deps.examSessionsService.gradeFreeText(req.params.id, req.params.testId, req.body.scoreAwarded),
        ),
    );
  };
}
