import * as auth from './auth';
import * as collections from './collections';
import * as exam from './exam';
import * as examSessions from './examSessions';
import { createMockApi } from './mock';
import * as offlineExams from './offlineExams';
import * as tests from './tests';

const realApi = { auth, collections, tests, examSessions, exam, offlineExams };

export type Api = typeof realApi;

export const isMockMode = import.meta.env.VITE_USE_MOCK === 'true';

/**
 * All views and stores go through this object. With VITE_USE_MOCK=true it is an in-memory fake
 * with the same signatures; otherwise the mock factory is never called and is dropped from the build.
 */
export const api: Api = isMockMode ? createMockApi() : realApi;
