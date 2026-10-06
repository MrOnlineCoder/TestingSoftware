<script setup lang="ts">
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import FileUpload, { type FileUploadUploaderEvent } from 'primevue/fileupload';
import Image from 'primevue/image';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import { useToast } from 'primevue/usetoast';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import type { DetectionStatus, OfflineExamDetail, StudentAnswer, Test } from '@/api/types';
import QuestionAnswerInput from '@/components/QuestionAnswerInput.vue';
import { countUk, formatDate, isAnswered, QUESTION_TYPE_LABELS } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

interface Row {
  answer: StudentAnswer | null;
  status: DetectionStatus | null;
  confidence: number | null;
  /** ambiguous detections must be confirmed (or edited) by the teacher */
  confirmed: boolean;
}

const STATUS_TAGS: Record<DetectionStatus, { label: string; severity: 'success' | 'warn' | 'secondary' | 'info' }> = {
  ok: { label: 'Розпізнано', severity: 'success' },
  ambiguous: { label: 'Перевірити', severity: 'warn' },
  empty: { label: 'Порожньо', severity: 'secondary' },
  manual: { label: 'Ввести вручну', severity: 'info' },
};

const route = useRoute();
const router = useRouter();
const toast = useToast();
const showApiError = useApiError();

const exam = ref<OfflineExamDetail | null>(null);
const loadError = ref('');
const rows = reactive<Record<string, Row>>({});
const overlay = ref<string | null>(null);
const scanError = ref('');
const scanning = ref(false);
const studentName = ref('');
const studentId = ref('');
const finalizing = ref(false);
const uploadKey = ref(0);

const offlineExamId = computed(() => String(route.params.offlineExamId));
const unconfirmed = computed(() => Object.values(rows).filter((r) => r.status === 'ambiguous' && !r.confirmed).length);
const canFinalize = computed(() => !!studentName.value.trim() && unconfirmed.value === 0 && !finalizing.value);

function isOnSheet(test: Test): boolean {
  return test.type === 'single_choice' || test.type === 'multiple_choice';
}

function resetRows() {
  for (const key of Object.keys(rows)) delete rows[key];
  for (const test of exam.value?.tests ?? []) {
    rows[test.id] = { answer: null, status: isOnSheet(test) ? null : 'manual', confidence: null, confirmed: false };
  }
}

async function load() {
  loadError.value = '';
  try {
    exam.value = await api.offlineExams.get(offlineExamId.value);
    resetRows();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
}
watch(offlineExamId, load, { immediate: true });

async function onUpload(event: FileUploadUploaderEvent) {
  const file = Array.isArray(event.files) ? event.files[0] : event.files;
  uploadKey.value++; // re-create the uploader so the same file can be chosen again
  if (!file) return;
  scanning.value = true;
  scanError.value = '';
  try {
    const result = await api.offlineExams.scan(offlineExamId.value, file);
    overlay.value = result.overlayImage;
    for (const d of result.detections) {
      const row = rows[d.testId];
      if (!row) continue;
      // keep what the teacher already typed for questions that are not on the sheet
      if (d.status === 'manual') continue;
      Object.assign(row, { answer: d.answer, status: d.status, confidence: d.confidence, confirmed: false });
    }
    const ambiguous = result.detections.filter((d) => d.status === 'ambiguous').length;
    toast.add({
      severity: ambiguous ? 'warn' : 'success',
      summary: 'Бланк розпізнано',
      detail: ambiguous
        ? `Потребують підтвердження: ${countUk(ambiguous, ['відповідь', 'відповіді', 'відповідей'])}.`
        : 'Перевірте відповіді та завершіть.',
      life: 4000,
    });
  } catch (e) {
    scanError.value = e instanceof Error ? e.message : String(e);
  } finally {
    scanning.value = false;
  }
}

function onAnswerEdited(testId: string, value: StudentAnswer) {
  const row = rows[testId]!;
  row.answer = value;
  row.confirmed = true;
}

async function finalize() {
  if (!exam.value || !canFinalize.value) return;
  finalizing.value = true;
  try {
    const answers: Record<string, StudentAnswer | null> = {};
    for (const test of exam.value.tests) {
      const answer = rows[test.id]?.answer ?? null;
      answers[test.id] = isAnswered(answer) ? answer : null;
    }
    const session = await api.offlineExams.finalize(offlineExamId.value, {
      studentName: studentName.value.trim(),
      studentId: studentId.value.trim() || null,
      answers,
    });
    toast.add({ severity: 'success', summary: 'Сесію іспиту створено', life: 2500 });
    await router.push({ name: 'session', params: { id: session.id } });
  } catch (e) {
    showApiError(e, 'Не вдалося завершити');
  } finally {
    finalizing.value = false;
  }
}

function scanAnother() {
  resetRows();
  overlay.value = null;
  scanError.value = '';
  studentName.value = '';
  studentId.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function promptPreview(prompt: string): string {
  const plain = prompt.replace(/[#*_`>[\]()!$]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > 70 ? `${plain.slice(0, 67)}…` : plain;
}
</script>

<template>
  <div class="page">
    <Message v-if="loadError" severity="error">{{ loadError }}</Message>
    <div v-else-if="!exam" class="empty-state"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" /></div>

    <template v-else>
      <RouterLink
        v-if="exam.collectionId"
        :to="{ name: 'collection', params: { id: exam.collectionId } }"
        class="small back"
      >
        <i class="pi pi-arrow-left" /> {{ exam.collectionTitle }}
      </RouterLink>
      <div class="page-header">
        <div>
          <h1>Сканування бланків відповідей</h1>
          <span class="muted small">{{ exam.collectionTitle }} · версія для друку від {{ formatDate(exam.createdAt) }}</span>
        </div>
        <Button label="Сканувати інший бланк" icon="pi pi-refresh" severity="secondary" outlined @click="scanAnother" />
      </div>

      <div class="layout">
        <section class="card scan-panel">
          <FileUpload
            :key="uploadKey"
            mode="basic"
            accept="image/png,image/jpeg"
            :max-file-size="20 * 1024 * 1024"
            custom-upload
            auto
            choose-label="Завантажити скан або фото"
            choose-icon="pi pi-camera"
            :disabled="scanning"
            @uploader="onUpload"
          />
          <p class="muted small" style="margin: 0">PNG або JPEG. Мають бути видимі всі чотири чорні квадрати в кутах.</p>
          <div v-if="scanning" class="center"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" /> <span class="muted">Розпізнавання…</span></div>
          <Message v-if="scanError" severity="error">{{ scanError }}</Message>
          <Image v-if="overlay && !scanning" :src="overlay" alt="Розпізнані позначки" preview image-class="overlay" />
          <p v-if="overlay && !scanning" class="muted small legend">
            <span class="dot green" /> зафарбовано <span class="dot orange" /> нечітко <span class="dot grey" /> порожньо
          </p>
          <div v-if="!overlay && !scanning" class="placeholder muted small">
            <i class="pi pi-image" />
            Тут зʼявиться розпізнаний бланк. Також можна ввести всі відповіді вручну.
          </div>
        </section>

        <section class="card review-panel">
          <div class="row row-wrap student">
            <div class="field grow">
              <label for="studentName">Імʼя студента</label>
              <InputText id="studentName" v-model="studentName" fluid placeholder="Як написано на бланку" />
            </div>
            <div class="field grow">
              <label for="studentId">ID студента <span class="muted small">(необовʼязково)</span></label>
              <InputText id="studentId" v-model="studentId" fluid />
            </div>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Питання</th>
                <th>Відповідь</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(test, index) in exam.tests"
                :key="test.id"
                :class="{ attention: rows[test.id]?.status === 'ambiguous' && !rows[test.id]?.confirmed }"
              >
                <td class="num">{{ index + 1 }}</td>
                <td class="prompt">
                  <div class="small muted">{{ QUESTION_TYPE_LABELS[test.type] }}</div>
                  <div class="small">{{ promptPreview(test.prompt) }}</div>
                </td>
                <td class="answer">
                  <QuestionAnswerInput
                    :test="test"
                    :model-value="rows[test.id]?.answer ?? null"
                    compact
                    @update:model-value="onAnswerEdited(test.id, $event)"
                  />
                  <div v-if="test.type === 'free_text'" class="muted small">Оцінюється вручну на сторінці сесії.</div>
                </td>
                <td class="status">
                  <template v-if="rows[test.id]?.status">
                    <Tag :value="STATUS_TAGS[rows[test.id]!.status!].label" :severity="STATUS_TAGS[rows[test.id]!.status!].severity" />
                    <div v-if="rows[test.id]!.confidence !== null && rows[test.id]!.status !== 'manual'" class="muted small">
                      {{ Math.round(rows[test.id]!.confidence! * 100) }}%
                    </div>
                    <label v-if="rows[test.id]!.status === 'ambiguous'" class="row small confirm">
                      <Checkbox v-model="rows[test.id]!.confirmed" binary />
                      Так
                    </label>
                  </template>
                  <span v-else class="muted small">не скановано</span>
                </td>
              </tr>
            </tbody>
          </table>

          <Message v-if="unconfirmed > 0" severity="warn" size="small">
            Нечітких відповідей: {{ unconfirmed }}. Виправте їх або позначте «Так», щоб підтвердити.
          </Message>
          <div class="row" style="justify-content: flex-end">
            <Button
              label="Завершити та оцінити"
              icon="pi pi-check"
              :disabled="!canFinalize"
              :loading="finalizing"
              @click="finalize"
            />
          </div>
        </section>
      </div>
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

.layout {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) 3fr;
  gap: 1rem;
  align-items: start;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.card {
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.scan-panel {
  position: sticky;
  top: 4.5rem;
}

.scan-panel :deep(.overlay) {
  width: 100%;
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
}

.center {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: center;
  padding: 1rem;
}

.placeholder {
  border: 2px dashed var(--p-surface-200);
  border-radius: 8px;
  padding: 2.5rem 1rem;
  text-align: center;
}

.placeholder .pi {
  font-size: 1.75rem;
  display: block;
  margin-bottom: 0.5rem;
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}

.dot {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 2px solid;
  margin-left: 0.4rem;
}

.dot.green {
  border-color: #16a34a;
}

.dot.orange {
  border-color: #f97316;
}

.dot.grey {
  border-color: #9ca3af;
}

.student {
  gap: 1rem;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
}

.review-table th {
  text-align: left;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-weight: 600;
  padding: 0.4rem;
  border-bottom: 1px solid var(--p-surface-200);
}

.review-table td {
  padding: 0.5rem 0.4rem;
  border-bottom: 1px solid var(--p-surface-100);
  vertical-align: top;
}

.review-table tr.attention {
  background: var(--p-orange-50);
}

.num {
  font-weight: 700;
  width: 2rem;
}

.prompt {
  max-width: 14rem;
}

.answer {
  min-width: 12rem;
}

.status {
  width: 6rem;
}

.confirm {
  margin-top: 0.3rem;
  cursor: pointer;
}
</style>
