<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ExamTimer from '@/components/ExamTimer.vue';
import { useExamStore } from '@/stores/exam';

const route = useRoute();
const exam = useExamStore();

const inExam = computed(() => route.name === 'exam' && exam.session !== null && exam.phase !== 'error');
const showTimer = computed(
  () => inExam.value && exam.session?.status === 'in_progress' && exam.session.deadlineAt !== null,
);
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <template v-if="inExam && exam.session">
        <div class="student">
          <i class="pi pi-user" />
          <span class="name">{{ exam.session.studentName }}</span>
          <span v-if="exam.session.studentId" class="muted small">({{ exam.session.studentId }})</span>
        </div>
        <span class="muted small title">{{ exam.session.collectionTitle }}</span>
        <div class="grow" />
        <span v-if="exam.phase === 'question'" class="progress">
          {{ exam.currentIndex + 1 }} / {{ exam.tests.length }}
        </span>
        <ExamTimer v-if="showTimer" :deadline-at="exam.session.deadlineAt!" @expired="exam.onTimeUp()" />
      </template>
      <template v-else>
        <span class="brand"><i class="pi pi-check-square" /> Система тестування</span>
      </template>
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
  min-height: 3.4rem;
  background: var(--p-surface-0);
  border-bottom: 1px solid var(--p-surface-200);
}

.brand {
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand .pi,
.student .pi {
  color: var(--p-primary-color);
}

.student {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.name {
  font-weight: 600;
}

.progress {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 600px) {
  .title {
    display: none;
  }
}
</style>
