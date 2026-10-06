import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { CreateExamSessionInput, ExamSession, ExamSessionDetail } from '@/api/types';

export const useExamSessionsStore = defineStore('examSessions', () => {
  const items = ref<ExamSession[]>([]);
  const loading = ref(false);
  const detail = ref<ExamSessionDetail | null>(null);

  async function fetchAll(collectionId?: string): Promise<void> {
    loading.value = true;
    try {
      items.value = await api.examSessions.list(collectionId);
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateExamSessionInput): Promise<ExamSession> {
    const session = await api.examSessions.create(input);
    items.value = [session, ...items.value];
    return session;
  }

  async function remove(id: string): Promise<void> {
    await api.examSessions.remove(id);
    items.value = items.value.filter((s) => s.id !== id);
  }

  async function loadDetail(id: string): Promise<void> {
    detail.value = await api.examSessions.get(id);
  }

  async function grade(testId: string, scoreAwarded: number): Promise<void> {
    if (!detail.value) return;
    detail.value = await api.examSessions.grade(detail.value.id, testId, scoreAwarded);
  }

  return { items, loading, detail, fetchAll, create, remove, loadDetail, grade };
});
