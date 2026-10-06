import path from 'node:path';
import dotenv from 'dotenv-safe';

export interface AppConfig {
  port: number;
  host: string;
  teacherPassword: string;
  databasePath: string;
  staticDir: string | null;
  logLevel: string;
  isDevelopment: boolean;
  /** Folder with HTML templates and other bundled resources */
  resourcesDir: string;
  /** Folder for runtime files (sqlite database, cached PDFs) */
  dataDir: string;
  migrationsDir: string;
}

/** Backend root folder; the same for `src/` (tsx) and `dist/` (compiled) */
export const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');

export function loadAppConfig(): AppConfig {
  dotenv.config({
    path: path.join(BACKEND_ROOT, '.env'),
    example: path.join(BACKEND_ROOT, '.env.example'),
    allowEmptyValues: true,
  });

  const teacherPassword = process.env.TEACHER_PASSWORD ?? '';
  if (teacherPassword.trim() === '') {
    throw new Error('TEACHER_PASSWORD must be set in .env and must not be empty');
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${process.env.PORT}"`);
  }

  const databasePath = path.resolve(BACKEND_ROOT, process.env.DATABASE_PATH || './data/app.db');
  const staticDir = process.env.STATIC_DIR ? path.resolve(BACKEND_ROOT, process.env.STATIC_DIR) : null;

  return {
    port,
    host: process.env.HOST || '0.0.0.0',
    teacherPassword,
    databasePath,
    staticDir,
    logLevel: process.env.LOG_LEVEL || 'info',
    isDevelopment: process.env.NODE_ENV !== 'production',
    resourcesDir: path.join(BACKEND_ROOT, 'resources'),
    dataDir: path.dirname(databasePath),
    migrationsDir: path.join(BACKEND_ROOT, 'drizzle'),
  };
}
