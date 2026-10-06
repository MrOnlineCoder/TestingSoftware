import { Type, type Static } from '@sinclair/typebox';
import { DateTimeSchema } from '../apiSchemas.js';
import { TestSchema, toTestDto } from '../tests/testSchemas.js';
import type { Test } from '../tests/test.js';
import { toIso } from '../utils/time.js';
import type { CollectionWithStats } from './collection.js';

export const CollectionSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  testsCount: Type.Integer(),
  activeSessionsCount: Type.Integer(),
});

export const CollectionWithTestsSchema = Type.Composite([
  CollectionSchema,
  Type.Object({ tests: Type.Array(TestSchema) }),
]);

export const CreateCollectionBodySchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
  description: Type.Optional(Type.String()),
});

export const UpdateCollectionBodySchema = Type.Partial(CreateCollectionBodySchema);

export type CollectionDto = Static<typeof CollectionSchema>;

export function toCollectionDto(c: CollectionWithStats): CollectionDto {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
    testsCount: c.testsCount,
    activeSessionsCount: c.activeSessionsCount,
  };
}

export function toCollectionWithTestsDto(c: CollectionWithStats & { tests: Test[] }) {
  return { ...toCollectionDto(c), tests: c.tests.map(toTestDto) };
}
