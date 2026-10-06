import { request } from './client';

export function login(password: string): Promise<{ ok: true }> {
  return request('POST', '/api/auth/teacher/login', { password });
}

export function logout(): Promise<{ ok: true }> {
  return request('POST', '/api/auth/teacher/logout');
}

export function me(): Promise<{ authenticated: boolean }> {
  return request('GET', '/api/auth/teacher/me');
}
