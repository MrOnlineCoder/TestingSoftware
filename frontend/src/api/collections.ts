import { request } from './client';
import type { Collection, CollectionWithTests, CreateCollectionInput } from './types';

export function list(): Promise<Collection[]> {
  return request('GET', '/api/collections');
}

export function get(id: string): Promise<CollectionWithTests> {
  return request('GET', `/api/collections/${id}`);
}

export function create(input: CreateCollectionInput): Promise<Collection> {
  return request('POST', '/api/collections', input);
}

export function update(id: string, patch: Partial<CreateCollectionInput>): Promise<Collection> {
  return request('PATCH', `/api/collections/${id}`, patch);
}

export function remove(id: string): Promise<void> {
  return request('DELETE', `/api/collections/${id}`);
}
