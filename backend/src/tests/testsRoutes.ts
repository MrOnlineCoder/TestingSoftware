import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { TEACHER_SECURITY, UuidSchema, withErrors } from '../apiSchemas.js';
import { requireTeacher } from '../auth/requireTeacher.js';
import type { Deps } from '../deps.js';
import {
  CollectionTestParamsSchema,
  CreateTestBodySchema,
  ReorderTestsBodySchema,
  TestSchema,
  toTestDto,
  UpdateTestBodySchema,
} from './testSchemas.js';

const CollectionParamsSchema = Type.Object({ collectionId: UuidSchema });

/** Mounted under /api/collections/:collectionId/tests */
export function makeTestsRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.addHook('preHandler', requireTeacher(deps));

    app.post(
      '/',
      {
        schema: {
          tags: ['tests'],
          description: 'Append a test to the collection. 409 if the collection has active sessions.',
          security: TEACHER_SECURITY,
          params: CollectionParamsSchema,
          body: CreateTestBodySchema,
          response: withErrors({ 201: TestSchema }),
        },
      },
      async (req, reply) => {
        const test = await deps.testsService.create(req.params.collectionId, req.body);
        return reply.code(201).send(toTestDto(test));
      },
    );

    // registered before '/:testId' style routes so that "order" is never treated as an id
    app.put(
      '/order',
      {
        schema: {
          tags: ['tests'],
          description: 'Reorder tests; `testIds` must list every test of the collection exactly once',
          security: TEACHER_SECURITY,
          params: CollectionParamsSchema,
          body: ReorderTestsBodySchema,
          response: withErrors({ 200: Type.Array(TestSchema) }),
        },
      },
      async (req) => (await deps.testsService.reorder(req.params.collectionId, req.body.testIds)).map(toTestDto),
    );

    app.patch(
      '/:testId',
      {
        schema: {
          tags: ['tests'],
          description: 'Update any subset of fields. Option ids sent back are kept stable.',
          security: TEACHER_SECURITY,
          params: CollectionTestParamsSchema,
          body: UpdateTestBodySchema,
          response: withErrors({ 200: TestSchema }),
        },
      },
      async (req) => toTestDto(await deps.testsService.update(req.params.collectionId, req.params.testId, req.body)),
    );

    app.delete(
      '/:testId',
      {
        schema: {
          tags: ['tests'],
          description: 'Delete a test; positions of following tests are compacted',
          security: TEACHER_SECURITY,
          params: CollectionTestParamsSchema,
          response: withErrors({ 204: Type.Null() }),
        },
      },
      async (req, reply) => {
        await deps.testsService.delete(req.params.collectionId, req.params.testId);
        return reply.code(204).send(null);
      },
    );
  };
}
