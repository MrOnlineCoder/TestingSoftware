import { useToast } from 'primevue/usetoast';
import { isApiError } from '@/api/client';

/** Toast helper for API errors; returns a function to call from catch blocks */
export function useApiError() {
  const toast = useToast();
  return function showApiError(error: unknown, summary = 'Щось пішло не так'): void {
    if (isApiError(error, 'UNAUTHORIZED')) {
      return; // handled globally: redirect to login
    }
    const detail = error instanceof Error ? error.message : String(error);
    toast.add({ severity: 'error', summary, detail, life: 6000 });
  };
}
