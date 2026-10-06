<script setup lang="ts">
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { useExamStore } from '@/stores/exam';
import ExamQuestion from './exam/ExamQuestion.vue';
import ExamResults from './exam/ExamResults.vue';
import ExamReview from './exam/ExamReview.vue';
import ExamStart from './exam/ExamStart.vue';

const route = useRoute();
const exam = useExamStore();
const toast = useToast();

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') void exam.load(id);
  },
  { immediate: true },
);

watch(
  () => exam.saveError,
  (message) => {
    if (message) toast.add({ severity: 'error', summary: 'Вашу відповідь не збережено', detail: message, life: 6000 });
  },
);
</script>

<template>
  <div class="page page-narrow">
    <div v-if="exam.phase === 'loading'" class="empty-state"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" /></div>
    <div v-else-if="exam.phase === 'error'" class="empty-state">
      <i class="pi pi-exclamation-circle" />
      {{ exam.errorMessage }}
    </div>
    <template v-else>
      <Message v-if="exam.notice" severity="warn" class="notice">{{ exam.notice }}</Message>
      <ExamStart v-if="exam.phase === 'start'" />
      <ExamQuestion v-else-if="exam.phase === 'question'" />
      <ExamReview v-else-if="exam.phase === 'review'" />
      <ExamResults v-else-if="exam.phase === 'results'" />
    </template>
  </div>
</template>

<style scoped>
.notice {
  margin-bottom: 1rem;
}
</style>
