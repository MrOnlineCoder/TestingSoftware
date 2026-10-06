<script setup lang="ts">
import Tag from 'primevue/tag';
import { computed } from 'vue';
import type { ChoiceOption, CorrectAnswer, QuestionType, StudentAnswer } from '@/api/types';
import { formatScore, isAnswered, OPTION_LETTERS } from '@/utils/format';

/**
 * Given answer vs correct answer for one question. Used by the teacher's session detail and
 * the student's results page; fields the student may not see are simply passed as null.
 */
const props = defineProps<{
  type: QuestionType;
  options: ChoiceOption[];
  answer: StudentAnswer | null;
  correctAnswer: CorrectAnswer | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  maxScore: number | null;
  audience: 'teacher' | 'student';
}>();

const answered = computed(() => isAnswered(props.answer));

const selectedIds = computed<string[]>(() => {
  if (props.answer?.type === 'single_choice') return props.answer.optionId ? [props.answer.optionId] : [];
  if (props.answer?.type === 'multiple_choice') return props.answer.optionIds;
  return [];
});

const correctIds = computed<string[] | null>(() => {
  if (props.correctAnswer?.type === 'single_choice') return [props.correctAnswer.optionId];
  if (props.correctAnswer?.type === 'multiple_choice') return props.correctAnswer.optionIds;
  return null;
});

const verdict = computed<{ label: string; severity: 'success' | 'warn' | 'danger' | 'info' | 'secondary' } | null>(() => {
  if (props.type === 'free_text') {
    if (props.audience === 'student') return { label: 'Перевіряє викладач', severity: 'info' };
    if (!answered.value) return { label: 'Без відповіді', severity: 'secondary' };
    return props.scoreAwarded === null ? { label: 'Потребує оцінювання', severity: 'warn' } : { label: 'Оцінено', severity: 'info' };
  }
  if (props.isCorrect === null) return null;
  if (props.isCorrect) return { label: 'Правильно', severity: 'success' };
  if ((props.scoreAwarded ?? 0) > 0) return { label: 'Частково правильно', severity: 'warn' };
  return { label: answered.value ? 'Неправильно' : 'Без відповіді', severity: answered.value ? 'danger' : 'secondary' };
});

function optionClass(id: string) {
  const selected = selectedIds.value.includes(id);
  const correct = correctIds.value?.includes(id) ?? false;
  return {
    selected,
    correct: correctIds.value !== null && correct,
    wrong: correctIds.value !== null && selected && !correct,
  };
}

function optionIcon(id: string): string {
  const selected = selectedIds.value.includes(id);
  if (props.type === 'single_choice') return selected ? 'pi pi-circle-fill' : 'pi pi-circle';
  return selected ? 'pi pi-check-square' : 'pi pi-stop';
}
</script>

<template>
  <div class="review">
    <div class="review-head">
      <Tag v-if="verdict" :value="verdict.label" :severity="verdict.severity" />
      <span v-if="scoreAwarded !== null && maxScore !== null" class="score">
        {{ formatScore(scoreAwarded) }} / {{ formatScore(maxScore) }} б.
      </span>
    </div>

    <ul v-if="type === 'single_choice' || type === 'multiple_choice'" class="options">
      <li v-for="(option, index) in options" :key="option.id" :class="optionClass(option.id)">
        <i :class="optionIcon(option.id)" />
        <span class="letter">{{ OPTION_LETTERS[index] }}</span>
        <span class="grow">{{ option.text }}</span>
        <span v-if="optionClass(option.id).correct" class="mark ok"><i class="pi pi-check" /> правильна</span>
        <span v-else-if="optionClass(option.id).wrong" class="mark bad"><i class="pi pi-times" /></span>
      </li>
      <li v-if="!answered" class="muted small not-answered">Жоден варіант не вибрано</li>
    </ul>

    <div v-else-if="type === 'number'" class="kv">
      <div>
        <span class="muted">Відповідь:</span>
        <strong>{{ answer?.type === 'number' && answer.value !== null ? answer.value : 'Без відповіді' }}</strong>
      </div>
      <div v-if="correctAnswer?.type === 'number'">
        <span class="muted">Правильна:</span>
        <strong>{{ correctAnswer.value }}</strong>
        <span v-if="correctAnswer.tolerance" class="muted"> (± {{ correctAnswer.tolerance }})</span>
      </div>
    </div>

    <div v-else class="kv">
      <div class="text-block">
        <div class="muted small">Відповідь</div>
        <div v-if="answer?.type === 'free_text' && answer.text.trim()" class="answer-text">{{ answer.text }}</div>
        <div v-else class="muted">Без відповіді</div>
      </div>
      <div v-if="correctAnswer?.type === 'free_text' && correctAnswer.referenceAnswer" class="text-block">
        <div class="muted small">{{ audience === 'teacher' ? 'Еталонна відповідь' : 'Зразок відповіді' }}</div>
        <div class="answer-text reference">{{ correctAnswer.referenceAnswer }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.review-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.score {
  font-weight: 600;
}

.options {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.options li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid transparent;
}

.options li.selected {
  border-color: var(--p-surface-300);
  background: var(--p-surface-100);
}

.options li.correct {
  border-color: var(--p-green-400);
  background: var(--p-green-50);
}

.options li.wrong {
  border-color: var(--p-red-300);
  background: var(--p-red-50);
}

.letter {
  font-weight: 700;
  color: var(--p-text-muted-color);
}

.mark {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.mark.ok {
  color: var(--p-green-700);
}

.mark.bad {
  color: var(--p-red-600);
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.text-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.answer-text {
  white-space: pre-wrap;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: var(--p-surface-100);
}

.answer-text.reference {
  background: var(--p-green-50);
  border: 1px solid var(--p-green-200);
}

.not-answered {
  padding-left: 0.6rem;
}
</style>
