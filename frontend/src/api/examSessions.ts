import { request } from './client';
import type { CreateExamSessionInput, ExamSession, ExamSessionDetail } from './types';

export function list(collectionId?: string): Promise<ExamSession[]> {
  const query = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : '';
  return request('GET', `/api/exam-sessions${query}`);
}

export function get(id: string): Promise<ExamSessionDetail> {
  return request('GET', `/api/exam-sessions/${id}`);
}

export function create(input: CreateExamSessionInput): Promise<ExamSession> {
  return request('POST', '/api/exam-sessions', input);
}

export function remove(id: string): Promise<void> {
  return request('DELETE', `/api/exam-sessions/${id}`);
}

export function grade(id: string, testId: string, scoreAwarded: number): Promise<ExamSessionDetail> {
  return request('PATCH', `/api/exam-sessions/${id}/answers/${testId}/grade`, { scoreAwarded });
}
