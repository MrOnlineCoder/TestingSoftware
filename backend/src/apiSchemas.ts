import { Type, type TSchema } from '@sinclair/typebox';

export const ErrorResponseSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    timestamp: Type.Number(),
  },
  { $id: 'ErrorResponse' },
);

export const OkResponseSchema = Type.Object({ ok: Type.Literal(true) });

export const UuidSchema = Type.String({ format: 'uuid' });

export const IdParamsSchema = Type.Object({ id: UuidSchema });

export const DateTimeSchema = Type.String({ format: 'date-time' });

export function Nullable<T extends TSchema>(schema: T) {
  // Null first: ajv tries anyOf branches in order
  return Type.Union([Type.Null(), schema]);
}

/** Adds the common error response to a route's response map (for the docs and serialization) */
export function withErrors<T extends Record<number, TSchema>>(responses: T) {
  return { ...responses, '4xx': Type.Ref(ErrorResponseSchema), '5xx': Type.Ref(ErrorResponseSchema) };
}

export const TEACHER_SECURITY = [{ teacherSession: [] }];
