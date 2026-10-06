import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { api } from '@/api';

export type AppMode = 'teacher' | 'student';
const STORAGE_KEY = 'testing-software.mode';

function readMode(): AppMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'student' ? 'student' : 'teacher';
  } catch {
    return 'teacher';
  }
}

export const useModeStore = defineStore('mode', () => {
  const mode = ref<AppMode>(readMode());
  /** null = not checked yet */
  const teacherAuthenticated = ref<boolean | null>(null);

  watch(mode, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // storage unavailable: mode just is not remembered
    }
  });

  async function ensureTeacherAuth(): Promise<boolean> {
    if (teacherAuthenticated.value === null) {
      try {
        teacherAuthenticated.value = (await api.auth.me()).authenticated;
      } catch {
        teacherAuthenticated.value = false;
      }
    }
    return teacherAuthenticated.value;
  }

  async function login(password: string): Promise<void> {
    await api.auth.login(password);
    teacherAuthenticated.value = true;
    mode.value = 'teacher';
  }

  async function logout(): Promise<void> {
    try {
      await api.auth.logout();
    } finally {
      teacherAuthenticated.value = false;
    }
  }

  return { mode, teacherAuthenticated, ensureTeacherAuth, login, logout };
});
