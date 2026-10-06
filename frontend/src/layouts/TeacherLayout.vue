<script setup lang="ts">
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isMockMode } from '@/api';
import { useModeStore, type AppMode } from '@/stores/mode';

const route = useRoute();
const router = useRouter();
const mode = useModeStore();

const modeOptions = [
  { label: 'Викладач', value: 'teacher' },
  { label: 'Студент', value: 'student' },
];

const selectedMode = computed({
  get: () => mode.mode,
  set: (value: AppMode | null) => {
    if (!value) return;
    mode.mode = value;
    void router.push(value === 'student' ? '/student' : '/teacher');
  },
});

async function logout() {
  await mode.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <RouterLink to="/teacher" class="brand"><i class="pi pi-check-square" /> Система тестування</RouterLink>
      <nav v-if="!route.meta.hideNav" class="nav">
        <RouterLink to="/teacher/collections" class="nav-link">Набори тестів</RouterLink>
        <RouterLink to="/teacher/sessions" class="nav-link">Сесії іспитів</RouterLink>
      </nav>
      <div class="grow" />
      <Tag v-if="isMockMode" value="Демо-режим" severity="warn" />
      <SelectButton v-model="selectedMode" :options="modeOptions" option-label="label" option-value="value" size="small" />
      <Button
        v-if="mode.teacherAuthenticated && !route.meta.hideNav"
        icon="pi pi-sign-out"
        label="Вийти"
        text
        size="small"
        @click="logout"
      />
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.25rem;
  background: var(--p-surface-0);
  border-bottom: 1px solid var(--p-surface-200);
  flex-wrap: wrap;
}

.brand {
  font-weight: 700;
  color: var(--p-text-color);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand .pi {
  color: var(--p-primary-color);
}

.nav {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  text-decoration: none;
  color: var(--p-text-muted-color);
  font-weight: 500;
}

.nav-link:hover {
  background: var(--p-surface-100);
}

.nav-link.router-link-active {
  color: var(--p-primary-color);
  background: var(--p-primary-50);
}
</style>
