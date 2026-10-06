<script setup lang="ts">
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { ref } from 'vue';
import MarkdownView from './MarkdownView.vue';

withDefaults(defineProps<{ placeholder?: string; rows?: number; disabled?: boolean }>(), {
  placeholder: '',
  rows: 3,
  disabled: false,
});
const model = defineModel<string>({ required: true });
const preview = ref(false);
</script>

<template>
  <div class="md-editor">
    <div class="md-toolbar">
      <span class="muted small">Підтримується Markdown</span>
      <Button
        :label="preview ? 'Редагувати' : 'Перегляд'"
        :icon="preview ? 'pi pi-pencil' : 'pi pi-eye'"
        text
        size="small"
        @click="preview = !preview"
      />
    </div>
    <div v-if="preview" class="md-preview">
      <MarkdownView v-if="model.trim()" :source="model" />
      <span v-else class="muted">Нічого переглядати</span>
    </div>
    <Textarea v-else v-model="model" :rows="rows" :placeholder="placeholder" :disabled="disabled" auto-resize fluid />
  </div>
</template>

<style scoped>
.md-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.md-preview {
  border: 1px dashed var(--p-surface-300);
  border-radius: 6px;
  padding: 0.75rem;
  min-height: 3rem;
  background: var(--p-surface-0);
}
</style>
