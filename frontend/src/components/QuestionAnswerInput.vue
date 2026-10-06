<script setup lang="ts">
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import RadioButton from 'primevue/radiobutton';
import Textarea from 'primevue/textarea';
import { computed } from 'vue';
import type { ChoiceOption, QuestionType, StudentAnswer } from '@/api/types';
import { emptyAnswer, numberFromInput, OPTION_LETTERS } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    test: { id: string; type: QuestionType; options: ChoiceOption[] };
    modelValue: StudentAnswer | null;
    disabled?: boolean;
    compact?: boolean;
  }>(),
  { disabled: false, compact: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: StudentAnswer] }>();

const value = computed(() =>
  props.modelValue && props.modelValue.type === props.test.type ? props.modelValue : emptyAnswer(props.test.type),
);

const singleValue = computed({
  get: () => (value.value.type === 'single_choice' ? value.value.optionId : null),
  set: (optionId: string | null) => emit('update:modelValue', { type: 'single_choice', optionId }),
});

const multipleValue = computed({
  get: () => (value.value.type === 'multiple_choice' ? value.value.optionIds : []),
  set: (optionIds: string[]) =>
    // keep option order stable regardless of click order
    emit('update:modelValue', {
      type: 'multiple_choice',
      optionIds: props.test.options.map((o) => o.id).filter((id) => optionIds.includes(id)),
    }),
});

const numberValue = computed(() => (value.value.type === 'number' ? value.value.value : null));
const textValue = computed({
  get: () => (value.value.type === 'free_text' ? value.value.text : ''),
  set: (text: string) => emit('update:modelValue', { type: 'free_text', text }),
});

function onNumberInput(event: { value: string | number | null | undefined }) {
  emit('update:modelValue', { type: 'number', value: numberFromInput(event.value) });
}

const inputName = computed(() => `q-${props.test.id}`);
</script>

<template>
  <div class="answer-input" :class="{ compact }">
    <template v-if="test.type === 'single_choice'">
      <label
        v-for="(option, index) in test.options"
        :key="option.id"
        class="choice"
        :class="{ selected: singleValue === option.id, disabled }"
      >
        <RadioButton v-model="singleValue" :input-id="`${inputName}-${option.id}`" :name="inputName" :value="option.id" :disabled="disabled" />
        <span class="letter">{{ OPTION_LETTERS[index] }}</span>
        <span class="text">{{ option.text }}</span>
      </label>
    </template>

    <template v-else-if="test.type === 'multiple_choice'">
      <p v-if="!compact" class="muted small hint">Позначте всі правильні варіанти.</p>
      <label
        v-for="(option, index) in test.options"
        :key="option.id"
        class="choice"
        :class="{ selected: multipleValue.includes(option.id), disabled }"
      >
        <Checkbox v-model="multipleValue" :input-id="`${inputName}-${option.id}`" :value="option.id" :disabled="disabled" />
        <span class="letter">{{ OPTION_LETTERS[index] }}</span>
        <span class="text">{{ option.text }}</span>
      </label>
    </template>

    <template v-else-if="test.type === 'number'">
      <InputNumber
        :model-value="numberValue"
        :input-id="inputName"
        :disabled="disabled"
        :use-grouping="false"
        :max-fraction-digits="8"
        :placeholder="compact ? 'Число' : 'Введіть число'"
        @input="onNumberInput"
      />
    </template>

    <template v-else>
      <Textarea
        v-model="textValue"
        :disabled="disabled"
        :rows="compact ? 2 : 5"
        auto-resize
        fluid
        :placeholder="compact ? 'Текст відповіді' : 'Введіть відповідь'"
      />
    </template>
  </div>
</template>

<style scoped>
.answer-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hint {
  margin: 0;
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--p-surface-200);
  border-radius: 8px;
  background: var(--p-surface-0);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.choice:hover:not(.disabled) {
  border-color: var(--p-primary-300);
}

.choice.selected {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.choice.disabled {
  cursor: default;
}

.letter {
  font-weight: 700;
  color: var(--p-text-muted-color);
  width: 1.2rem;
}

.compact {
  gap: 0.25rem;
}

.compact .choice {
  padding: 0.3rem 0.5rem;
  gap: 0.5rem;
}
</style>
