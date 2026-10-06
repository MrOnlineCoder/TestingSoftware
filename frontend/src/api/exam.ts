import { request } from './client';
import type { ExamSession, ResultsView, StudentAnswer, StudentExamAnswer, StudentExamView } from './types';

export function view(id: string): Promise<StudentExamView> {
  return request('GET', `/api/exam/${id}`);
}

export function start(id: string): Promise<ExamSession> {
  return request('POST', `/api/exam/${id}/start`);
}

export function answer(id: string, testId: string, value: StudentAnswer): Promise<StudentExamAnswer> {
  return request('PUT', `/api/exam/${id}/answers/${testId}`, value);
}

export function submit(id: string): Promise<{ session: ExamSession; results: ResultsView }> {
  return request('POST', `/api/exam/${id}/submit`);
}
