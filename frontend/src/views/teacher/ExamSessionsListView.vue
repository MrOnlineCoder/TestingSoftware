<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ExamSession } from '@/api/types';
import { useCollectionsStore } from '@/stores/collections';
import { useExamSessionsStore } from '@/stores/examSessions';
import { formatDate, formatScore, STATUS_LABELS, STATUS_SEVERITY } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

const route = useRoute();
const router = useRouter();
const store = useExamSessionsStore();
const collections = useCollectionsStore();
const confirm = useConfirm();
const showApiError = useApiError();

const collectionFilter = ref<string | null>(typeof route.query.collectionId === 'string' ? route.query.collectionId : null);

const collectionOptions = computed(() => [
  { label: 'Усі набори тестів', value: null },
  ...collections.items.map((c) => ({ label: c.title, value: c.id })),
]);

async function load() {
  try {
    await store.fetchAll(collectionFilter.value ?? undefined);
  } catch (e) {
    showApiError(e, 'Не вдалося завантажити сесії іспитів');
  }
}

watch(collectionFilter, (value) => {
  void router.replace({ query: value ? { collectionId: value } : {} });
  void load();
});

onMounted(() => {
  void load();
  collections.fetchAll().catch(() => undefined);
});

function confirmDelete(session: ExamSession) {
  confirm.require({
    header: 'Видалити сесію іспиту',
    message: `Видалити сесію студента ${session.studentName}? Відповіді та результати буде видалено назавжди.`,
    icon: 'pi pi-trash',
    acceptProps: { label: 'Видалити', severity: 'danger' },
    rejectProps: { label: 'Скасувати', severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await store.remove(session.id);
      } catch (e) {
        showApiError(e, 'Не вдалося видалити сесію');
      }
    },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Сесії іспитів</h1>
      <div class="row">
        <Select
          v-model="collectionFilter"
          :options="collectionOptions"
          option-label="label"
          option-value="value"
          placeholder="Усі набори тестів"
          style="min-width: 16rem"
        />
        <Button v-tooltip.bottom="'Оновити'" icon="pi pi-refresh" severity="secondary" outlined aria-label="Оновити" @click="load" />
      </div>
    </div>

    <DataTable
      :value="store.items"
      :loading="store.loading"
      data-key="id"
      row-hover
      sort-field="createdAt"
      :sort-order="-1"
      class="clickable"
      @row-click="router.push({ name: 'session', params: { id: $event.data.id } })"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-inbox" />
          Сесій іспитів ще немає. Розпочніть сесію зі сторінки набору тестів.
        </div>
      </template>
      <Column field="collectionTitle" header="Набір тестів" sortable>
        <template #body="{ data }">
          {{ data.collectionTitle }}
          <span v-if="data.collectionId === null" v-tooltip.top="'Набір видалено; результати збережено'" class="muted small">
            (видалено)
          </span>
        </template>
      </Column>
      <Column field="studentName" header="Студент" sortable />
      <Column field="studentId" header="ID студента">
        <template #body="{ data }">{{ data.studentId ?? '–' }}</template>
      </Column>
      <Column header="Бали" sort-field="totalScore" sortable>
        <template #body="{ data }">
          <span v-if="data.totalScore !== null">{{ formatScore(data.totalScore) }} / {{ formatScore(data.maxScore) }}</span>
          <span v-else class="muted">–</span>
        </template>
      </Column>
      <Column field="status" header="Статус" sortable>
        <template #body="{ data }">
          <Tag :value="STATUS_LABELS[data.status as ExamSession['status']]" :severity="STATUS_SEVERITY[data.status as ExamSession['status']]" />
        </template>
      </Column>
      <Column field="origin" header="Формат">
        <template #body="{ data }">
          <span class="row small"><i :class="data.origin === 'offline' ? 'pi pi-print' : 'pi pi-desktop'" /> {{ data.origin === 'offline' ? 'паперовий' : 'онлайн' }}</span>
        </template>
      </Column>
      <Column field="createdAt" header="Створено" sortable>
        <template #body="{ data }">{{ formatDate(data.createdAt) }}</template>
      </Column>
      <Column style="width: 4rem">
        <template #body="{ data }">
          <Button v-tooltip.left="'Видалити'" icon="pi pi-trash" text rounded severity="danger" aria-label="Видалити" @click.stop="confirmDelete(data)" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.clickable :deep(tbody tr) {
  cursor: pointer;
}
</style>
