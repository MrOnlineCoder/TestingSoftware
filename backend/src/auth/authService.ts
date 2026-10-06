import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError, ErrorCode } from '../errors.js';
import type { SessionStore } from './sessionStore.js';

export const TEACHER_SESSION_COOKIE = 'sid';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export class AuthService {
  private readonly passwordHash: Buffer;

  constructor(
    teacherPassword: string,
    private readonly sessionStore: SessionStore,
  ) {
    this.passwordHash = sha256(teacherPassword);
  }

  /** Returns a new session id on success */
  login(password: string): string {
    // hashing first gives equal-length buffers, so timingSafeEqual never leaks the password length
    if (!timingSafeEqual(sha256(password), this.passwordHash)) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Wrong password');
    }
    return this.sessionStore.create();
  }

  logout(sessionId: string | undefined): void {
    if (sessionId) {
      this.sessionStore.delete(sessionId);
    }
  }

  isValidSession(sessionId: string | undefined): boolean {
    return sessionId !== undefined && sessionId !== '' && this.sessionStore.exists(sessionId);
  }
}
