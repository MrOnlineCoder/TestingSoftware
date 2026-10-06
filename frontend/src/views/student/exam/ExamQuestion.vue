<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed } from 'vue';
import type { StudentAnswer } from '@/api/types';
import MarkdownView from '@/components/MarkdownView.vue';
import QuestionAnswerInput from '@/components/QuestionAnswerInput.vue';
import { useExamStore } from '@/stores/exam';
import { describeCorrectAnswer, formatScore, isAnswered } from '@/utils/format';

const exam = useExamStore();

const test = computed(() => exam.currentTest!);
const saved = computed(() => exam.answers[test.value.id]);
const draft = computed(() => exam.drafts[test.value.id] ?? null);
const settings = computed(() => exam.settings!);
const locked = computed(() => exam.isLocked(test.value.id));
const revealed = computed(() => saved.value?.correctAnswer ?? null);

const verdict = computed(() => {
  const a = saved.value;
  if (!a || !revealed.value) return null;
  if (test.value.type === 'free_text') return { severity: 'info' as const, text: 'Вашу відповідь перевірить викладач.' };
  if (a.isCorrect) return { severity: 'success' as const, text: 'Правильно!' };
  if ((a.scoreAwarded ?? 0) > 0) {
    return {
      severity: 'warn' as const,
      text: `Частково правильно: ${formatScore(a.scoreAwarded)} з ${formatScore(test.value.score)} б.`,
    };
  }
  return { severity: 'error' as const, text: 'Неправильно.' };
});

function isAnsweredAt(testId: string): boolean {
  return isAnswered(exam.answers[testId]?.answer) || isAnswered(exam.drafts[testId]);
}

function onInput(value: StudentAnswer) {
  exam.setDraft(test.value.id, value);
}
</script>

<template>
  <div class="col gap">
    <nav v-if="settings.allowNavigation" class="palette" aria-label="Питання">
      <Button
        v-for="(t, index) in exam.tests"
        :key="t.id"
        :label="String(index + 1)"
        size="small"
        :severity="index === exam.currentIndex ? undefined : 'secondary'"
        :outlined="index !== exam.currentIndex && !isAnsweredAt(t.id)"
        :class="{ answered: isAnsweredAt(t.id) && index !== exam.currentIndex }"
        :aria-label="`Питання ${index + 1}${isAnsweredAt(t.id) ? ', є відповідь' : ''}`"
        :disabled="exam.busy"
        @click="exam.goTo(index)"
      />
      <Button label="Огляд" icon="pi pi-list-check" size="small" text :disabled="exam.busy" @click="exam.openReview()" />
    </nav>

    <section class="question">
      <div class="q-head">
        <span class="q-number">Питання {{ exam.currentIndex + 1 }} з {{ exam.tests.length }}</span>
        <span class="muted small">{{ formatScore(test.score) }} б.</span>
      </div>
      <MarkdownView :source="test.prompt" class="prompt" />

      <QuestionAnswerInput :key="test.id" :test="test" :model-value="draft" :disabled="locked || exam.busy" @update:model-value="onInput" />

      <Message v-if="verdict" :severity="verdict.severity">
        <div class="col">
          <strong>{{ verdict.text }}</strong>
          <span v-if="revealed && test.type !== 'free_text'">Правильна відповідь: {{ describeCorrectAnswer(test.options, revealed) }}</span>
          <span v-else-if="revealed?.type === 'free_text' && revealed.referenceAnswer">Зразок відповіді: {{ revealed.referenceAnswer }}</span>
          <MarkdownView v-if="saved?.explanation" :source="saved.explanation" class="small" />
        </div>
      </Message>
      <p v-else-if="locked && saved?.locked" class="muted small"><i class="pi pi-lock" /> Вашу відповідь збережено, змінити її вже не можна.</p>
      <p v-else-if="!settings.allowNavigation" class="muted small">
        <i class="pi pi-info-circle" /> Дайте відповідь, щоб продовжити. Повернутися до цього питання пізніше не можна.
      </p>
      <p v-else-if="exam.autosave" class="muted small"><i class="pi pi-save" /> Відповіді зберігаються автоматично.</p>
    </section>

    <div class="actions">
      <Button v-if="exam.canGoBack" label="Назад" icon="pi pi-arrow-left" severity="secondary" outlined :disabled="exam.busy" @click="exam.previous()" />
      <div class="grow" />
      <Button
        v-if="settings.showCorrectAnswer && !locked"
        label="Перевірити відповідь"
        icon="pi pi-check-circle"
        severity="secondary"
        :disabled="!isAnswered(draft) || exam.busy"
        @click="exam.saveCurrent()"
      />
      <Button
        :label="exam.isLast ? 'Огляд і здача' : 'Далі'"
        :icon="exam.isLast ? 'pi pi-list-check' : 'pi pi-arrow-right'"
        icon-pos="right"
        :disabled="!exam.canGoForward || exam.busy"
        :loading="exam.busy"
        @click="exam.next()"
      />
    </div>
  </div>
</template>

<style scoped>
.gap {
  gap: 1rem;
}

.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.palette .p-button {
  min-width: 2.4rem;
}

.palette .answered {
  background: var(--p-primary-100);
  border-color: var(--p-primary-200);
  color: var(--p-primary-800);
}

.question {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.question p {
  margin: 0;
}

.q-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.q-number {
  font-weight: 700;
  color: var(--p-text-muted-color);
}

.prompt {
  font-size: 1.1rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
