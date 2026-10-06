import fs from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import fastify, { type FastifyError } from 'fastify';
import { ErrorResponseSchema } from './apiSchemas.js';
import { TEACHER_SESSION_COOKIE } from './auth/authService.js';
import { makeAuthRoutes } from './auth/authRoutes.js';
import { makeCollectionsRoutes } from './collections/collectionsRoutes.js';
import type { Deps } from './deps.js';
import { AppError, ErrorCode, errorCodeToHttpStatus } from './errors.js';
import { makeExamRoutes } from './examSessions/examRoutes.js';
import { makeExamSessionsRoutes } from './examSessions/examSessionsRoutes.js';
import { makeOfflineExamsRoutes } from './offlineExams/offlineExamsRoutes.js';
import { makeTestsRoutes } from './tests/testsRoutes.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number';
}

export async function buildServer(deps: Deps) {
  const { config } = deps;

  const app = fastify({
    logger: { level: config.logLevel },
    ajv: {
      // no coercion: e.g. `null` must not silently become 0 in a number answer
      customOptions: { coerceTypes: false },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addSchema(ErrorResponseSchema);

  await app.register(fastifyCookie);
  if (config.isDevelopment) {
    await app.register(fastifyCors, { origin: 'http://localhost:5173', credentials: true });
  }
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'Testing Software API', version: '1.0.0' },
      tags: [
        { name: 'auth', description: 'Teacher login' },
        { name: 'collections', description: 'Test suites (teacher)' },
        { name: 'tests', description: 'Questions inside a collection (teacher)' },
        { name: 'exam-sessions', description: 'Exam session management (teacher)' },
        { name: 'exam', description: 'Exam taking (student, no auth)' },
        { name: 'offline-exams', description: 'Printable / scanned exams (teacher)' },
      ],
      components: {
        securitySchemes: {
          teacherSession: { type: 'apiKey', in: 'cookie', name: TEACHER_SESSION_COOKIE },
        },
      },
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  app.setSchemaErrorFormatter((errors, dataVar) => {
    const error = errors[0];
    const field = error?.instancePath ? `${dataVar}${error.instancePath.replaceAll('/', '.')}` : dataVar;
    return new AppError(ErrorCode.VALIDATION_ERROR, error ? `${field} ${error.message ?? 'is invalid'}` : 'Invalid request');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(errorCodeToHttpStatus(error.code)).send({
        code: error.code,
        message: error.message,
        timestamp: Date.now(),
      });
    }
    // Fastify's own client errors: malformed JSON, payload too large, unsupported media type...
    if (isFastifyError(error) && error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(400).send({
        code: ErrorCode.VALIDATION_ERROR,
        message: error.message,
        timestamp: Date.now(),
      });
    }
    request.log.error({ err: error }, `Unhandled error at ${request.method} ${request.url}`);
    return reply.status(500).send({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      timestamp: Date.now(),
    });
  });

  app.get(
    '/api/health',
    {
      schema: {
        description: 'Health check',
        response: { 200: Type.Object({ ok: Type.Literal(true) }) },
      },
    },
    async () => ({ ok: true as const }),
  );

  await app.register(makeAuthRoutes(deps), { prefix: '/api/auth' });
  await app.register(makeCollectionsRoutes(deps), { prefix: '/api/collections' });
  await app.register(makeTestsRoutes(deps), { prefix: '/api/collections/:collectionId/tests' });
  await app.register(makeExamSessionsRoutes(deps), { prefix: '/api/exam-sessions' });
  await app.register(makeExamRoutes(deps), { prefix: '/api/exam' });
  await app.register(makeOfflineExamsRoutes(deps), { prefix: '/api' });

  const indexHtml = config.staticDir ? path.join(config.staticDir, 'index.html') : null;
  if (config.staticDir && indexHtml && fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: config.staticDir, wildcard: false });
  } else if (config.staticDir) {
    app.log.warn(`STATIC_DIR is set but ${indexHtml} does not exist; frontend will not be served`);
  }
  const serveSpa = config.staticDir !== null && indexHtml !== null && fs.existsSync(indexHtml);

  app.setNotFoundHandler(async (request, reply) => {
    const isApi = request.url.startsWith('/api') || request.url.startsWith('/docs');
    if (serveSpa && request.method === 'GET' && !isApi) {
      // SPA fallback: client-side routes like /exam/<id> are handled by the frontend router
      return reply.type('text/html').sendFile('index.html');
    }
    throw new AppError(ErrorCode.NOT_FOUND, `Route ${request.method} ${request.url} not found`);
  });

  return app;
}
