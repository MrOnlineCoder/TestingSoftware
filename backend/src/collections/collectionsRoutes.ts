import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { IdParamsSchema, TEACHER_SECURITY, withErrors } from '../apiSchemas.js';
import { requireTeacher } from '../auth/requireTeacher.js';
import type { Deps } from '../deps.js';
import {
  CollectionSchema,
  CollectionWithTestsSchema,
  CreateCollectionBodySchema,
  toCollectionDto,
  toCollectionWithTestsDto,
  UpdateCollectionBodySchema,
} from './collectionSchemas.js';

export function makeCollectionsRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.addHook('preHandler', requireTeacher(deps));

    app.get(
      '/',
      {
        schema: {
          tags: ['collections'],
          description: 'All collections, newest first',
          security: TEACHER_SECURITY,
          response: withErrors({ 200: Type.Array(CollectionSchema) }),
        },
      },
      async () => (await deps.collectionsService.list()).map(toCollectionDto),
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['collections'],
          security: TEACHER_SECURITY,
          body: CreateCollectionBodySchema,
          response: withErrors({ 201: CollectionSchema }),
        },
      },
      async (req, reply) => {
        const collection = await deps.collectionsService.create(req.body);
        return reply.code(201).send(toCollectionDto(collection));
      },
    );

    app.get(
      '/:id',
      {
        schema: {
          tags: ['collections'],
          description: 'Collection with its tests sorted by position',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 200: CollectionWithTestsSchema }),
        },
      },
      async (req) => toCollectionWithTestsDto(await deps.collectionsService.get(req.params.id)),
    );

    app.patch(
      '/:id',
      {
        schema: {
          tags: ['collections'],
          description: '409 if the collection has active exam sessions',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          body: UpdateCollectionBodySchema,
          response: withErrors({ 200: CollectionSchema }),
        },
      },
      async (req) => toCollectionDto(await deps.collectionsService.update(req.params.id, req.body)),
    );

    app.delete(
      '/:id',
      {
        schema: {
          tags: ['collections'],
          description:
            '409 if the collection has active exam sessions. Submitted sessions are kept with collectionId = null.',
          security: TEACHER_SECURITY,
          params: IdParamsSchema,
          response: withErrors({ 204: Type.Null() }),
        },
      },
      async (req, reply) => {
        await deps.collectionsService.delete(req.params.id);
        return reply.code(204).send(null);
      },
    );
  };
}
