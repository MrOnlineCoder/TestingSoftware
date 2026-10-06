import { request } from './client';
import type { ExamSession, FinalizeOfflineExamInput, OfflineExam, OfflineExamDetail, ScanResult } from './types';

export function createOrReuse(collectionId: string): Promise<OfflineExam & { reused: boolean }> {
  return request('POST', `/api/collections/${collectionId}/offline-exams`);
}

export function get(id: string): Promise<OfflineExamDetail> {
  return request('GET', `/api/offline-exams/${id}`);
}

export function scan(id: string, file: File): Promise<ScanResult> {
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/api/offline-exams/${id}/scans`, form);
}

export function finalize(id: string, input: FinalizeOfflineExamInput): Promise<ExamSession> {
  return request('POST', `/api/offline-exams/${id}/finalize`, input);
}
