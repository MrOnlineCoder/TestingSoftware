import { request } from './client';
import type { Test, TestInput } from './types';

export function create(collectionId: string, input: TestInput): Promise<Test> {
  return request('POST', `/api/collections/${collectionId}/tests`, input);
}

export function update(collectionId: string, testId: string, patch: Partial<TestInput>): Promise<Test> {
  return request('PATCH', `/api/collections/${collectionId}/tests/${testId}`, patch);
}

export function remove(collectionId: string, testId: string): Promise<void> {
  return request('DELETE', `/api/collections/${collectionId}/tests/${testId}`);
}

export function reorder(collectionId: string, testIds: string[]): Promise<Test[]> {
  return request('PUT', `/api/collections/${collectionId}/tests/order`, { testIds });
}
