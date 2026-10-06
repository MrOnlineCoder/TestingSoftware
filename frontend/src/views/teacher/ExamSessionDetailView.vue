<script setup lang="ts">
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isApiError } from '@/api/client';
import type { ExamAnswer, Test } from '@/api/types';
import AnswerReview from '@/components/AnswerReview.vue';
import CopyField from '@/components/CopyField.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import { useExamSessionsStore } from '@/stores/examSessions';
import { countUk, examUrl, formatDate, formatScore, numberFromInput, QUESTION_TYPE_LABELS, STATUS_LABELS, STATUS_SEVERITY } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

const POLL_MS = 5000;

const route = useRoute();
const router = useRouter();
const store = useExamSessionsStore();
const confirm = useConfirm();
const toast = useToast();
const showApiError = useApiError();

const notFound = ref(false);
const gradeInputs = reactive<Record<string, number | null>>({});
const savingGrade = ref<string | null>(null);
let poll: ReturnType<typeof setInterval> | undefined;

const sessionId = computed(() => String(route.params.id));
const session = computed(() => (store.detail?.id === sessionId.value ? store.detail : null));
const answersByTest = computed(() => new Map<string, ExamAnswer>((session.value?.answers ?? []).map((a) => [a.testId, a])));

let gradeInputsFor: string | null = null;

/** Prefills the grade inputs with stored grades; typed-in values survive background refreshes */
function syncGradeInputs() {
  if (gradeInputsFor !== sessionId.value) {
    // test ids repeat across sessions of the same suite, so start from scratch per session
    for (const key of Object.keys(gradeInputs)) delete gradeInputs[key];
    gradeInputsFor = sessionId.value;
  }
  for (const answer of session.value?.answers ?? []) {
    if (!(answer.testId in gradeInputs)) gradeInputs[answer.testId] = answer.scoreAwarded;
  }
}

async function load(silent = false) {
  try {
    await store.loadDetail(sessionId.value);
    notFound.value = false;
    syncGradeInputs();
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) notFound.value = true;
    else if (!silent) showApiError(e, 'Не вдалося завантажити сесію');
  }
}

// while the student is working, refresh so the teacher can follow along
function updatePolling() {
  clearInterval(poll);
  poll = undefined;
  if (session.value && session.value.status !== 'submitted') {
    poll = setInterval(() => void load(true), POLL_MS);
  }
}

watch(sessionId, () => void load().then(updatePolling), { immediate: true });
watch(() => session.value?.status, updatePolling);
onBeforeUnmount(() => clearInterval(poll));

async function saveGrade(test: Test) {
  const value = gradeInputs[test.id];
  if (value === null || value === undefined) return;
  savingGrade.value = test.id;
  try {
    await store.grade(test.id, value);
    toast.add({ severity: 'success', summary: 'Оцінку збережено', life: 1500 });
  } catch (e) {
    showApiError(e, 'Не вдалося зберегти оцінку');
  } finally {
    savingGrade.value = null;
  }
}

function confirmDelete() {
  if (!session.value) return;
  confirm.require({
    header: 'Видалити сесію іспиту',
    message: `Видалити сесію студента ${session.value.studentName}? Цю дію не можна скасувати.`,
    icon: 'pi pi-trash',
    acceptProps: { label: 'Видалити', severity: 'danger' },
    rejectProps: { label: 'Скасувати', severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await store.remove(sessionId.value);
        await router.push({ name: 'sessions' });
      } catch (e) {
        showApiError(e, 'Не вдалося видалити сесію');
      }
    },
  });
}

const settingChips = computed(() => {
  const s = session.value?.settings;
  if (!s) return [];
  return [
    { label: s.allowNavigation ? 'Навігацію дозволено' : 'Без навігації', on: s.allowNavigation },
    { label: s.showCorrectAnswer ? 'Правильні відповіді показуються' : 'Правильні відповіді приховано', on: s.showCorrectAnswer },
    { label: s.showScore ? 'Бал показується' : 'Бал приховано', on: s.showScore },
    { label: s.timeLimitMinutes ? `Обмеження: ${s.timeLimitMinutes} хв` : 'Без обмеження часу', on: !!s.timeLimitMinutes },
  ];
});
</script>

<template>
  <div class="page page-narrow">
    <RouterLink to="/teacher/sessions" class="small back"><i class="pi pi-arrow-left" /> Сесії іспитів</RouterLink>

    <div v-if="notFound" class="empty-state">
      <i class="pi pi-question-circle" />
      Сесію іспиту не знайдено.
    </div>
    <div v-else-if="!session" class="empty-state"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" /></div>

    <template v-else>
      <section class="card header-card">
        <div class="row row-wrap head-row">
          <div class="grow">
            <h1>{{ session.studentName }}</h1>
            <div class="muted">
              <span v-if="session.studentId">ID {{ session.studentId }} · </span>
              <RouterLink v-if="session.collectionId" :to="{ name: 'collection', params: { id: session.collectionId } }">
                {{ session.collectionTitle }}
              </RouterLink>
              <span v-else>{{ session.collectionTitle }} (видалено)</span>
            </div>
          </div>
          <div class="total">
            <div class="total-score">
              {{ formatScore(session.totalScore) }}<span class="muted"> / {{ formatScore(session.maxScore) }}</span>
            </div>
            <Tag :value="STATUS_LABELS[session.status]" :severity="STATUS_SEVERITY[session.status]" />
          </div>
        </div>

        <div class="row row-wrap chips">
          <Tag v-for="chip in settingChips" :key="chip.label" :value="chip.label" :severity="chip.on ? 'contrast' : 'secondary'" />
          <Tag :value="session.origin === 'offline' ? 'Паперовий (офлайн)' : 'Онлайн'" severity="secondary" />
        </div>

        <dl class="times small">
          <div><dt>Створено</dt><dd>{{ formatDate(session.createdAt) }}</dd></div>
          <div><dt>Розпочато</dt><dd>{{ formatDate(session.startedAt) }}</dd></div>
          <div><dt>Здано</dt><dd>{{ formatDate(session.submittedAt) }}</dd></div>
          <div v-if="session.deadlineAt"><dt>Крайній термін</dt><dd>{{ formatDate(session.deadlineAt) }}</dd></div>
        </dl>

        <div v-if="session.status !== 'submitted' && session.origin === 'online'" class="col">
          <span class="small muted">Посилання на іспит для студента (ця сторінка оновлюється автоматично):</span>
          <CopyField :value="examUrl(session.id)" />
        </div>

        <div class="row" style="justify-content: flex-end">
          <Button label="Видалити сесію" icon="pi pi-trash" severity="danger" text @click="confirmDelete" />
        </div>
      </section>

      <Message v-if="session.pendingManualGrading > 0" severity="warn">
        {{ countUk(session.pendingManualGrading, ['вільна відповідь очікує', 'вільні відповіді очікують', 'вільних відповідей очікують']) }} ручного оцінювання. До оцінювання вони рахуються як 0 балів.
      </Message>

      <section v-for="(test, index) in session.tests" :key="test.id" class="card q">
        <div class="q-head">
          <span class="q-number">{{ index + 1 }}.</span>
          <span class="muted small">{{ QUESTION_TYPE_LABELS[test.type] }} · {{ test.score }} б.</span>
        </div>
        <MarkdownView :source="test.prompt" />
        <AnswerReview
          :type="test.type"
          :options="test.options"
          :answer="answersByTest.get(test.id)?.answer ?? null"
          :correct-answer="test.correctAnswer"
          :is-correct="answersByTest.get(test.id)?.isCorrect ?? null"
          :score-awarded="answersByTest.get(test.id)?.scoreAwarded ?? null"
          :max-score="test.score"
          audience="teacher"
        />
        <div v-if="test.type === 'free_text' && session.status === 'submitted'" class="row grade-row">
          <label :for="`grade-${test.id}`" class="small">Бали</label>
          <InputNumber
            v-model="gradeInputs[test.id]"
            :input-id="`grade-${test.id}`"
            :min="0"
            :max="test.score"
            :max-fraction-digits="2"
            :use-grouping="false"
            show-buttons
            :step="0.5"
            input-class="grade-input"
            @input="gradeInputs[test.id] = numberFromInput($event.value)"
          />
          <span class="muted small">/ {{ test.score }}</span>
          <Button
            label="Зберегти оцінку"
            icon="pi pi-check"
            size="small"
            :loading="savingGrade === test.id"
            :disabled="gradeInputs[test.id] === null || gradeInputs[test.id] === undefined || gradeInputs[test.id] === answersByTest.get(test.id)?.scoreAwarded"
            @click="saveGrade(test)"
          />
        </div>
        <details v-if="test.explanation" class="explanation small">
          <summary>Пояснення</summary>
          <MarkdownView :source="test.explanation" />
        </details>
      </section>

      <section class="card footer">
        <strong>Разом: {{ formatScore(session.totalScore) }} / {{ formatScore(session.maxScore) }}</strong>
        <span v-if="session.pendingManualGrading > 0" class="muted">
          · очікують оцінювання: {{ session.pendingManualGrading }}
        </span>
      </section>
    </template>
  </div>
</template>

<style scoped>
.back {
  text-decoration: none;
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.card {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.head-row {
  align-items: flex-start;
  gap: 1rem;
}

.total {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
}

.total-score {
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1;
}

.chips {
  gap: 0.4rem;
}

.times {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  margin: 0;
}

.times dt {
  color: var(--p-text-muted-color);
}

.times dd {
  margin: 0;
}

.q-head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.q-number {
  font-weight: 700;
  font-size: 1.1rem;
}

.grade-row :deep(.grade-input) {
  width: 5rem;
}

.explanation summary {
  cursor: pointer;
  color: var(--p-text-muted-color);
}

.footer {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
</style>
