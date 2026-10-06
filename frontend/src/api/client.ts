import type { ErrorCode } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, code?: ApiError['code']): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

let unauthorizedHandler: (() => void) | null = null;

/** Called on a 401 from any non-auth endpoint (set up in main.ts, avoids import cycles with router/stores) */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

/** server clock minus client clock, in ms (from the HTTP Date header; used by the exam timer) */
let serverTimeOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + serverTimeOffsetMs;
}

export function setServerTimeOffset(offsetMs: number): void {
  serverTimeOffsetMs = offsetMs;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Не вдається зʼєднатися з сервером. Чи він запущений?');
  }

  const dateHeader = response.headers.get('Date');
  if (dateHeader) {
    const serverTime = Date.parse(dateHeader);
    if (!Number.isNaN(serverTime)) {
      // the header has 1 s resolution; only correct clearly skewed client clocks
      const offset = serverTime - Date.now();
      setServerTimeOffset(Math.abs(offset) > 2000 ? offset : 0);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const err = (data ?? {}) as { code?: ErrorCode; message?: string };
    const error = new ApiError(
      response.status,
      err.code ?? 'INTERNAL_ERROR',
      err.message ?? `Помилка запиту (статус ${response.status})`,
    );
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      unauthorizedHandler?.();
    }
    throw error;
  }

  return data as T;
}
