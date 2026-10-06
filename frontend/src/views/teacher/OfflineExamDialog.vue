<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import { ref, watch } from 'vue';
import { api } from '@/api';
import type { OfflineExam } from '@/api/types';
import { countUk, formatDate } from '@/utils/format';

const props = defineProps<{ collectionId: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const loading = ref(false);
const error = ref('');
const exam = ref<(OfflineExam & { reused: boolean }) | null>(null);

watch(visible, async (open) => {
  if (!open) return;
  loading.value = true;
  error.value = '';
  exam.value = null;
  try {
    exam.value = await api.offlineExams.createOrReuse(props.collectionId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <Dialog v-model:visible="visible" header="Паперовий іспит (офлайн)" modal :style="{ width: '34rem' }">
    <div v-if="loading" class="center"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" /></div>
    <Message v-else-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="exam" class="col gap">
      <p class="muted small" style="margin: 0">
        Версія для друку від {{ formatDate(exam.createdAt) }}
        <template v-if="exam.reused">(відтоді набір не змінювався)</template>.
        {{ countUk(exam.testsCount, ['питання', 'питання', 'питань']) }}<template v-if="exam.skippedTestIds.length">,
          з них {{ exam.skippedTestIds.length }} з відповіддю на аркуші з питаннями (число / вільна відповідь)</template>.
      </p>
      <ol class="steps">
        <li>Роздрукуйте <strong>аркуш із питаннями</strong> (по одному на студента).</li>
        <li>Роздрукуйте <strong>бланк відповідей</strong>; студенти зафарбовують кружечки чорною ручкою.</li>
        <li>Відскануйте або сфотографуйте кожен заповнений бланк і завантажте його на сторінці сканування.</li>
      </ol>
      <div class="col">
        <Button as="a" :href="exam.questionsUrl" target="_blank" rel="noopener" label="Відкрити аркуш із питаннями" icon="pi pi-file" severity="secondary" outlined />
        <Button as="a" :href="exam.answerSheetUrl" target="_blank" rel="noopener" label="Завантажити бланк відповідей (PDF)" icon="pi pi-download" severity="secondary" outlined />
        <Button
          as="router-link"
          :to="{ name: 'offline-scan', params: { offlineExamId: exam.id } }"
          label="Сканувати бланки"
          icon="pi pi-camera"
          @click="visible = false"
        />
      </div>
      <p class="muted small" style="margin: 0">
        Не змішуйте роздруківки різних версій: бланки зіставляються зі своєю версією за QR-кодом.
      </p>
    </div>
  </Dialog>
</template>

<style scoped>
.center {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.gap {
  gap: 1rem;
}

.steps {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>
