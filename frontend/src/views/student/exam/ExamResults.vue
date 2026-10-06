<script setup lang="ts">
import { computed } from 'vue';
import AnswerReview from '@/components/AnswerReview.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import { useExamStore } from '@/stores/exam';
import { formatScore } from '@/utils/format';

const exam = useExamStore();

const results = computed(() => exam.results);
const settings = computed(() => exam.settings!);
const testsById = computed(() => new Map(exam.tests.map((t) => [t.id, t])));
const percent = computed(() => {
  const r = results.value;
  if (!r || r.totalScore === null || r.maxScore === 0) return null;
  return Math.round((r.totalScore / r.maxScore) * 100);
});
const pendingFreeText = computed(
  () => results.value?.perQuestion.filter((q) => testsById.value.get(q.testId)?.type === 'free_text' && q.answer).length ?? 0,
);
</script>

<template>
  <div v-if="results" class="col gap">
    <section class="summary">
      <i class="pi pi-check-circle" />
      <template v-if="results.totalScore !== null">
        <div class="score">{{ formatScore(results.totalScore) }} <span class="muted">/ {{ formatScore(results.maxScore) }}</span></div>
        <div v-if="percent !== null" class="muted">{{ percent }}%</div>
        <p v-if="pendingFreeText > 0" class="muted small">
          Вільні відповіді оцінює викладач, тож бал ще може зрости.
        </p>
      </template>
      <h1 v-else>Ваші відповіді здано.</h1>
      <p v-if="results.totalScore !== null" class="muted small">Ваші відповіді здано.</p>
    </section>

    <section v-for="(q, index) in results.perQuestion" :key="q.testId" class="question">
      <template v-if="testsById.get(q.testId)">
        <div class="q-head">
          <span class="q-number">{{ index + 1 }}.</span>
          <span class="muted small">{{ formatScore(testsById.get(q.testId)!.score) }} б.</span>
        </div>
        <MarkdownView :source="testsById.get(q.testId)!.prompt" />
        <AnswerReview
          :type="testsById.get(q.testId)!.type"
          :options="testsById.get(q.testId)!.options"
          :answer="q.answer"
          :correct-answer="q.correctAnswer"
          :is-correct="q.isCorrect"
          :score-awarded="q.scoreAwarded"
          :max-score="settings.showScore ? testsById.get(q.testId)!.score : null"
          audience="student"
        />
        <div v-if="q.explanation" class="explanation">
          <div class="muted small">Пояснення</div>
          <MarkdownView :source="q.explanation" />
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.gap {
  gap: 1rem;
}

.summary {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-top: 6px solid var(--p-primary-color);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.summary > .pi {
  font-size: 2.25rem;
  color: var(--p-primary-color);
}

.summary p {
  margin: 0;
}

.score {
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1.1;
}

.question {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.q-head {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}

.q-number {
  font-weight: 700;
}

.explanation {
  border-left: 3px solid var(--p-primary-200);
  padding-left: 0.75rem;
}
</style>
