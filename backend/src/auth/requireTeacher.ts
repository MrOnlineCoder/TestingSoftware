import type { preHandlerAsyncHookHandler } from 'fastify';
import type { Deps } from '../deps.js';
import { AppError, ErrorCode } from '../errors.js';
import { TEACHER_SESSION_COOKIE } from './authService.js';

/** HTTP glue only: the actual check lives in AuthService */
export function requireTeacher(deps: Deps): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!deps.authService.isValidSession(request.cookies[TEACHER_SESSION_COOKIE])) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Teacher login required');
    }
  };
}
