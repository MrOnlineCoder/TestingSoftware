import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { OkResponseSchema, withErrors } from '../apiSchemas.js';
import type { Deps } from '../deps.js';
import { TEACHER_SESSION_COOKIE } from './authService.js';

export function makeAuthRoutes(deps: Deps): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.post(
      '/teacher/login',
      {
        schema: {
          tags: ['auth'],
          description: 'Log in to teacher mode. Sets the `sid` session cookie on success.',
          body: Type.Object({ password: Type.String() }),
          response: withErrors({ 200: OkResponseSchema }),
        },
      },
      async (req, reply) => {
        const sessionId = deps.authService.login(req.body.password);
        reply.setCookie(TEACHER_SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: 'lax', path: '/' });
        return { ok: true as const };
      },
    );

    app.post(
      '/teacher/logout',
      {
        schema: {
          tags: ['auth'],
          description: 'Log out of teacher mode',
          response: withErrors({ 200: OkResponseSchema }),
        },
      },
      async (req, reply) => {
        deps.authService.logout(req.cookies[TEACHER_SESSION_COOKIE]);
        reply.clearCookie(TEACHER_SESSION_COOKIE, { path: '/' });
        return { ok: true as const };
      },
    );

    app.get(
      '/teacher/me',
      {
        schema: {
          tags: ['auth'],
          description: 'Whether the current browser is logged in as teacher (never 401)',
          response: withErrors({ 200: Type.Object({ authenticated: Type.Boolean() }) }),
        },
      },
      async (req) => ({ authenticated: deps.authService.isValidSession(req.cookies[TEACHER_SESSION_COOKIE]) }),
    );
  };
}
