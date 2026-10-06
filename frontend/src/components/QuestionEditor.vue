<script setup lang="ts">
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { computed, ref, watch } from 'vue';
import type { QuestionType, Test, TestInput } from '@/api/types';
import { numberFromInput, OPTION_LETTERS, QUESTION_TYPE_LABELS } from '@/utils/format';
import { uuid } from '@/utils/uuid';
import MarkdownEditor from './MarkdownEditor.vue';
import MarkdownView from './MarkdownView.vue';

interface Draft {
  type: QuestionType;
  prompt: string;
  explanation: string;
  score: number | null;
  options: Array<{ id: string; text: string }>;
  correctIds: string[];
  numberValue: number | null;
  tolerance: number | null;
  referenceAnswer: string;
}

const props = defineProps<{
  /** null = new question, not saved yet */
  test: Test | null;
  number: number;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** resolves to true when saved */
  save: (input: TestInput) => Promise<boolean>;
}>();
const emit = defineEmits<{ delete: []; move: [direction: -1 | 1]; discard: [] }>();
const confirm = useConfirm();

const typeOptions = (Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((value) => ({
  value,
  label: QUESTION_TYPE_LABELS[value],
}));

function fromTest(test: Test | null): Draft {
  if (!test) {
    return {
      type: 'single_choice',
      prompt: '',
      explanation: '',
      score: 1,
      options: [
        { id: uuid(), text: '' },
        { id: uuid(), text: '' },
      ],
      correctIds: [],
      numberValue: null,
      tolerance: null,
      referenceAnswer: '',
    };
  }
  const c = test.correctAnswer;
  return {
    type: test.type,
    prompt: test.prompt,
    explanation: test.explanation,
    score: test.score,
    options: test.options.map((o) => ({ ...o })),
    correctIds: c.type === 'single_choice' ? [c.optionId] : c.type === 'multiple_choice' ? [...c.optionIds] : [],
    numberValue: c.type === 'number' ? c.value : null,
    tolerance: c.type === 'number' ? (c.tolerance ?? null) : null,
    referenceAnswer: c.type === 'free_text' ? c.referenceAnswer : '',
  };
}

// JSON copy, not structuredClone: ref values are reactive Proxies, which structuredClone rejects
function cloneDraft(d: Draft): Draft {
  return JSON.parse(JSON.stringify(d)) as Draft;
}

const initial = ref<Draft>(fromTest(props.test));
const draft = ref<Draft>(cloneDraft(initial.value));
const saving = ref(false);
const showErrors = ref(false);
const showExplanation = ref(false);

// after a save the parent passes the updated test back: that is the new clean state
watch(
  () => props.test,
  (test) => {
    initial.value = fromTest(test);
    draft.value = cloneDraft(initial.value);
    showErrors.value = false;
  },
);

const isNew = computed(() => props.test === null);
const isChoice = computed(() => draft.value.type === 'single_choice' || draft.value.type === 'multiple_choice');
const dirty = computed(() => isNew.value || JSON.stringify(draft.value) !== JSON.stringify(initial.value));

watch(
  () => draft.value.type,
  (type) => {
    if (type === 'single_choice' || type === 'multiple_choice') {
      while (draft.value.options.length < 2) draft.value.options.push({ id: uuid(), text: '' });
    }
    if (type === 'single_choice' && draft.value.correctIds.length > 1) {
      draft.value.correctIds = draft.value.correctIds.slice(0, 1);
    }
  },
);

const singleCorrect = computed({
  get: () => draft.value.correctIds[0] ?? null,
  set: (id: string | null) => (draft.value.correctIds = id ? [id] : []),
});

const validationError = computed<string | null>(() => {
  const d = draft.value;
  if (!d.prompt.trim()) return 'Текст питання не може бути порожнім.';
  if (d.score === null || d.score <= 0) return 'Кількість балів має бути більшою за 0.';
  if (isChoice.value) {
    if (d.options.length < 2) return 'Додайте щонайменше 2 варіанти.';
    if (d.options.some((o) => !o.text.trim())) return 'Варіанти не можуть бути порожніми.';
    if (d.correctIds.filter((id) => d.options.some((o) => o.id === id)).length === 0) {
      return d.type === 'single_choice' ? 'Позначте правильний варіант.' : 'Позначте щонайменше один правильний варіант.';
    }
  }
  if (d.type === 'number') {
    if (d.numberValue === null) return 'Введіть правильне число.';
    if (d.tolerance !== null && d.tolerance < 0) return 'Допустима похибка має бути не меншою за 0.';
  }
  return null;
});

function toInput(d: Draft): TestInput {
  const base = { type: d.type, prompt: d.prompt, explanation: d.explanation, score: d.score ?? 1 };
  switch (d.type) {
    case 'single_choice':
      return { ...base, options: d.options, correctAnswer: { type: 'single_choice', optionId: d.correctIds[0]! } };
    case 'multiple_choice':
      return {
        ...base,
        options: d.options,
        correctAnswer: {
          type: 'multiple_choice',
          optionIds: d.options.map((o) => o.id).filter((id) => d.correctIds.includes(id)),
        },
      };
    case 'number':
      return {
        ...base,
        options: [],
        correctAnswer: {
          type: 'number',
          value: d.numberValue!,
          ...(d.tolerance !== null && d.tolerance > 0 ? { tolerance: d.tolerance } : {}),
        },
      };
    case 'free_text':
      return { ...base, options: [], correctAnswer: { type: 'free_text', referenceAnswer: d.referenceAnswer } };
  }
}

function addOption() {
  draft.value.options.push({ id: uuid(), text: '' });
}

function removeOption(id: string) {
  draft.value.options = draft.value.options.filter((o) => o.id !== id);
  draft.value.correctIds = draft.value.correctIds.filter((c) => c !== id);
}

async function onSave() {
  showErrors.value = true;
  if (validationError.value) return;
  saving.value = true;
  try {
    const ok = await props.save(toInput(draft.value));
    if (ok) showErrors.value = false;
  } finally {
    saving.value = false;
  }
}

function onDelete() {
  if (isNew.value) {
    emit('discard');
    return;
  }
  confirm.require({
    header: 'Видалити питання',
    message: `Видалити питання ${props.number}? Цю дію не можна скасувати.`,
    icon: 'pi pi-trash',
    acceptProps: { label: 'Видалити', severity: 'danger' },
    rejectProps: { label: 'Скасувати', severity: 'secondary', outlined: true },
    accept: () => emit('delete'),
  });
}

function revert() {
  draft.value = cloneDraft(initial.value);
  showErrors.value = false;
}
</script>

<template>
  <section class="q-card" :class="{ dirty: dirty && !readOnly, 'is-new': isNew }">
    <!-- read-only rendering while exam sessions are active -->
    <template v-if="readOnly && test">
      <div class="q-head">
        <span class="q-number">{{ number }}.</span>
        <span class="muted small">{{ QUESTION_TYPE_LABELS[test.type] }} · {{ test.score }} б.</span>
      </div>
      <MarkdownView :source="test.prompt" />
      <ul v-if="test.options.length" class="ro-options">
        <li v-for="(o, i) in test.options" :key="o.id" :class="{ correct: draft.correctIds.includes(o.id) }">
          <strong>{{ OPTION_LETTERS[i] }}.</strong> {{ o.text }}
          <i v-if="draft.correctIds.includes(o.id)" class="pi pi-check" />
        </li>
      </ul>
      <p v-else-if="test.correctAnswer.type === 'number'" class="small">
        Правильна відповідь: <strong>{{ test.correctAnswer.value }}</strong>
        <span v-if="test.correctAnswer.tolerance"> ± {{ test.correctAnswer.tolerance }}</span>
      </p>
      <p v-else-if="test.correctAnswer.type === 'free_text' && test.correctAnswer.referenceAnswer" class="small">
        Еталон: {{ test.correctAnswer.referenceAnswer }}
      </p>
    </template>

    <template v-else>
      <div class="q-head">
        <span class="q-number">{{ number }}.</span>
        <Select v-model="draft.type" :options="typeOptions" option-label="label" option-value="value" class="type-select" />
        <div class="grow" />
        <label class="row small score">
          Бали
          <InputNumber v-model="draft.score" :min="0" :max="1000" :max-fraction-digits="2" :use-grouping="false" input-class="score-input" @input="draft.score = numberFromInput($event.value)" />
        </label>
      </div>

      <MarkdownEditor v-model="draft.prompt" placeholder="Текст питання" :rows="2" />

      <!-- choice options -->
      <div v-if="isChoice" class="options">
        <p class="muted small hint">
          {{ draft.type === 'single_choice' ? 'Виберіть правильний варіант:' : 'Позначте всі правильні варіанти:' }}
        </p>
        <div v-for="(option, index) in draft.options" :key="option.id" class="option-row">
          <RadioButton
            v-if="draft.type === 'single_choice'"
            v-model="singleCorrect"
            v-tooltip.left="'Правильна відповідь'"
            :value="option.id"
            :name="`correct-${test?.id ?? 'new'}`"
          />
          <Checkbox v-else v-model="draft.correctIds" v-tooltip.left="'Правильна відповідь'" :value="option.id" />
          <span class="letter">{{ OPTION_LETTERS[index] }}</span>
          <InputText v-model="option.text" :placeholder="`Варіант ${index + 1}`" class="grow" />
          <Button
            icon="pi pi-times"
            text
            rounded
            severity="secondary"
            :disabled="draft.options.length <= 2"
            aria-label="Видалити варіант"
            @click="removeOption(option.id)"
          />
        </div>
        <Button
          label="Додати варіант"
          icon="pi pi-plus"
          text
          size="small"
          class="add-option"
          :disabled="draft.options.length >= OPTION_LETTERS.length"
          @click="addOption"
        />
      </div>

      <div v-else-if="draft.type === 'number'" class="row row-wrap number-row">
        <div class="field">
          <label>Правильне значення</label>
          <InputNumber v-model="draft.numberValue" :use-grouping="false" :max-fraction-digits="8" placeholder="напр. 3,14" @input="draft.numberValue = numberFromInput($event.value)" />
        </div>
        <div class="field">
          <label>Допустима похибка (±, необовʼязково)</label>
          <InputNumber v-model="draft.tolerance" :min="0" :use-grouping="false" :max-fraction-digits="8" placeholder="0" @input="draft.tolerance = numberFromInput($event.value)" />
        </div>
      </div>

      <div v-else class="field">
        <label>Еталонна відповідь <span class="muted small">(необовʼязково, бачите лише ви; вільні відповіді оцінюються вручну)</span></label>
        <Textarea v-model="draft.referenceAnswer" rows="2" auto-resize fluid />
      </div>

      <div class="explanation">
        <Button
          :label="showExplanation ? 'Сховати пояснення' : draft.explanation ? 'Пояснення (заповнено)' : 'Додати пояснення'"
          :icon="showExplanation ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          text
          size="small"
          @click="showExplanation = !showExplanation"
        />
        <MarkdownEditor
          v-if="showExplanation"
          v-model="draft.explanation"
          placeholder="Показується студенту на сторінці результатів (якщо показ правильних відповідей увімкнено)"
          :rows="2"
        />
      </div>

      <div class="q-footer">
        <span v-if="showErrors && validationError" class="error-text">{{ validationError }}</span>
        <span v-else-if="dirty && !isNew" class="muted small">Є незбережені зміни</span>
        <div class="grow" />
        <template v-if="!isNew">
          <Button v-tooltip.top="'Перемістити вгору'" icon="pi pi-arrow-up" text rounded severity="secondary" :disabled="!canMoveUp" aria-label="Перемістити вгору" @click="emit('move', -1)" />
          <Button v-tooltip.top="'Перемістити вниз'" icon="pi pi-arrow-down" text rounded severity="secondary" :disabled="!canMoveDown" aria-label="Перемістити вниз" @click="emit('move', 1)" />
        </template>
        <Button v-tooltip.top="isNew ? 'Відкинути' : 'Видалити'" icon="pi pi-trash" text rounded severity="danger" aria-label="Видалити" @click="onDelete" />
        <Button v-if="dirty && !isNew" label="Скасувати зміни" severity="secondary" text @click="revert" />
        <Button :label="isNew ? 'Додати питання' : 'Зберегти'" icon="pi pi-check" :disabled="!dirty" :loading="saving" @click="onSave" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.q-card {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-left: 4px solid var(--p-surface-200);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.q-card.dirty {
  border-left-color: var(--p-primary-color);
}

.q-card.is-new {
  border-style: dashed;
  border-left-style: solid;
}

.q-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.q-number {
  font-weight: 700;
  font-size: 1.1rem;
}

.type-select {
  min-width: 11rem;
}

.score :deep(.score-input) {
  width: 4.5rem;
}

.hint {
  margin: 0 0 0.25rem;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.letter {
  font-weight: 700;
  color: var(--p-text-muted-color);
  width: 1rem;
}

.add-option {
  align-self: flex-start;
}

.number-row {
  gap: 1rem;
  align-items: flex-start;
}

.explanation {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.explanation > :first-child {
  align-self: flex-start;
}

.q-footer {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-top: 1px solid var(--p-surface-100);
  padding-top: 0.75rem;
}

.ro-options {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ro-options li.correct {
  color: var(--p-green-700);
  font-weight: 600;
}
</style>
