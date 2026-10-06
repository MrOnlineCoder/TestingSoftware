<script setup lang="ts">
import Button from 'primevue/button';
import { computed } from 'vue';
import { useExamStore } from '@/stores/exam';
import { countUk, formatScore } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

const exam = useExamStore();
const showApiError = useApiError();

const session = computed(() => exam.session!);
const rules = computed(() => {
  const s = session.value.settings;
  return [
    s.timeLimitMinutes
      ? {
          icon: 'pi pi-clock',
          text: `У вас є ${countUk(s.timeLimitMinutes, ['хвилина', 'хвилини', 'хвилин'])}. Коли час вичерпається, іспит буде здано автоматично.`,
        }
      : { icon: 'pi pi-clock', text: 'Час не обмежено.' },
    s.allowNavigation
      ? { icon: 'pi pi-arrows-h', text: 'Можна пропускати питання та повертатися до них до здачі іспиту.' }
      : { icon: 'pi pi-arrow-right', text: 'Питання йдуть по черзі. Не можна пропустити питання або повернутися до нього.' },
    s.showCorrectAnswer
      ? { icon: 'pi pi-eye', text: 'Після перевірки відповіді ви побачите, чи вона правильна. Перевірені відповіді змінити не можна.' }
      : null,
    s.showScore ? { icon: 'pi pi-chart-bar', text: 'Після здачі ви побачите свій бал.' } : null,
  ].filter((r): r is { icon: string; text: string } => r !== null);
});

async function start() {
  try {
    await exam.start();
  } catch (e) {
    showApiError(e, 'Не вдалося розпочати іспит');
  }
}
</script>

<template>
  <section class="start">
    <h1>{{ session.collectionTitle }}</h1>
    <p class="muted">
      Вітаємо, <strong>{{ session.studentName }}</strong>. В іспиті {{ countUk(exam.tests.length, ['питання', 'питання', 'питань']) }},
      максимальна кількість балів: {{ formatScore(session.maxScore) }}.
    </p>
    <ul class="rules">
      <li v-for="rule in rules" :key="rule.text"><i :class="rule.icon" /> {{ rule.text }}</li>
    </ul>
    <p class="muted small">Іспит розпочнеться, щойно ви натиснете кнопку. Якщо сторінку буде оновлено, ваші відповіді збережуться.</p>
    <Button label="Почати" icon="pi pi-play" size="large" :loading="exam.busy" @click="start" />
  </section>
</template>

<style scoped>
.start {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-top: 6px solid var(--p-primary-color);
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}

.start p {
  margin: 0;
}

.rules {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.rules .pi {
  color: var(--p-primary-color);
  margin-right: 0.5rem;
}
</style>
