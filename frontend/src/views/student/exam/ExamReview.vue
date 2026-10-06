<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { computed } from 'vue';
import { useExamStore } from '@/stores/exam';
import { countUk, describeAnswer, isAnswered } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

const exam = useExamStore();
const confirm = useConfirm();
const showApiError = useApiError();

const items = computed(() =>
  exam.tests.map((test, index) => {
    const answer = exam.answers[test.id]?.answer ?? null;
    return { test, index, answered: isAnswered(answer), summary: describeAnswer(test.options, answer) };
  }),
);
const unanswered = computed(() => items.value.filter((i) => !i.answered).length);

function firstLine(markdown: string): string {
  const line = markdown.split('\n').find((l) => l.trim()) ?? '';
  const plain = line.replace(/[#*_`>]/g, '').trim();
  return plain.length > 90 ? `${plain.slice(0, 87)}…` : plain;
}

function submit() {
  confirm.require({
    header: 'Здати іспит',
    message:
      unanswered.value > 0
        ? `Без відповіді: ${countUk(unanswered.value, ['питання', 'питання', 'питань'])}. Все одно здати? Після цього змінити відповіді не можна.`
        : 'Здати відповіді? Після цього змінити їх не можна.',
    icon: 'pi pi-send',
    acceptProps: { label: 'Здати', severity: 'primary' },
    rejectProps: { label: 'Ще ні', severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await exam.submit();
      } catch (e) {
        showApiError(e, 'Не вдалося здати іспит');
      }
    },
  });
}
</script>

<template>
  <div class="col gap">
    <h1>Перевірте свої відповіді</h1>
    <Message v-if="unanswered > 0" severity="warn">
      Ще без відповіді: {{ countUk(unanswered, ['питання', 'питання', 'питань']) }}.
    </Message>

    <ul class="list">
      <li v-for="item in items" :key="item.test.id" :class="{ missing: !item.answered }">
        <span class="num">{{ item.index + 1 }}.</span>
        <div class="grow">
          <div class="prompt">{{ firstLine(item.test.prompt) }}</div>
          <div class="small" :class="item.answered ? '' : 'muted'">{{ item.summary }}</div>
        </div>
        <Button
          v-if="exam.settings?.allowNavigation"
          :label="exam.answers[item.test.id]?.locked ? 'Переглянути' : 'Змінити'"
          size="small"
          text
          @click="exam.goTo(item.index)"
        />
      </li>
    </ul>

    <div class="row" style="justify-content: flex-end">
      <Button label="Здати іспит" icon="pi pi-send" size="large" :loading="exam.busy" @click="submit" />
    </div>
  </div>
</template>

<style scoped>
.gap {
  gap: 1rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
}

.list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--p-surface-100);
}

.list li:last-child {
  border-bottom: none;
}

.list li.missing {
  background: var(--p-orange-50);
}

.num {
  font-weight: 700;
  width: 2rem;
}

.prompt {
  font-weight: 500;
}
</style>
