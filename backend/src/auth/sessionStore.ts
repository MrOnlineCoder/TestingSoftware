import { randomBytes } from 'node:crypto';

export interface TeacherSession {
  createdAt: Date;
}

export interface SessionStore {
  create(): string;
  exists(sessionId: string): boolean;
  delete(sessionId: string): void;
}

/** Sessions live in memory and never expire; restarting the process logs everybody out. */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, TeacherSession>();

  create(): string {
    const sessionId = randomBytes(32).toString('hex');
    this.sessions.set(sessionId, { createdAt: new Date() });
    return sessionId;
  }

  exists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
