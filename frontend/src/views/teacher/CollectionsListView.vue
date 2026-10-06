<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { isApiError } from '@/api/client';
import type { Collection } from '@/api/types';
import { useCollectionsStore } from '@/stores/collections';
import { formatDate } from '@/utils/format';
import { useApiError } from '@/utils/useApiError';

const store = useCollectionsStore();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const showApiError = useApiError();

const dialogVisible = ref(false);
const newTitle = ref('');
const newDescription = ref('');
const creating = ref(false);

onMounted(() => store.fetchAll().catch((e) => showApiError(e, 'Не вдалося завантажити набори тестів')));

function openCreate() {
  newTitle.value = '';
  newDescription.value = '';
  dialogVisible.value = true;
}

async function create() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  try {
    const collection = await store.create({ title: newTitle.value.trim(), description: newDescription.value });
    dialogVisible.value = false;
    await router.push({ name: 'collection', params: { id: collection.id } });
  } catch (e) {
    showApiError(e, 'Не вдалося створити набір тестів');
  } finally {
    creating.value = false;
  }
}

function confirmDelete(collection: Collection) {
  confirm.require({
    header: 'Видалити набір тестів',
    message: `Видалити «${collection.title}» разом з усіма питаннями? Результати завершених іспитів збережуться.`,
    icon: 'pi pi-trash',
    acceptProps: { label: 'Видалити', severity: 'danger' },
    rejectProps: { label: 'Скасувати', severity: 'secondary', outlined: true },
    accept: async () => {
      try {
        await store.remove(collection.id);
        toast.add({ severity: 'success', summary: 'Набір тестів видалено', life: 2500 });
      } catch (e) {
        if (isApiError(e, 'CONFLICT')) {
          toast.add({ severity: 'warn', summary: 'У наборі є активні сесії іспитів', detail: 'Спершу завершіть або видаліть їх.', life: 5000 });
        } else {
          showApiError(e, 'Не вдалося видалити набір тестів');
        }
      }
    },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Набори тестів</h1>
      <Button label="Новий набір тестів" icon="pi pi-plus" @click="openCreate" />
    </div>

    <DataTable
      :value="store.items"
      :loading="store.loading"
      data-key="id"
      row-hover
      class="clickable"
      @row-click="router.push({ name: 'collection', params: { id: $event.data.id } })"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-folder-open" />
          Наборів тестів ще немає. Створіть перший, щоб додавати питання.
        </div>
      </template>
      <Column field="title" header="Назва">
        <template #body="{ data }">
          <RouterLink :to="{ name: 'collection', params: { id: data.id } }" class="title-link" @click.stop>
            {{ data.title }}
          </RouterLink>
          <div v-if="data.description" class="muted small ellipsis">{{ data.description }}</div>
        </template>
      </Column>
      <Column field="createdAt" header="Створено" sortable>
        <template #body="{ data }">{{ formatDate(data.createdAt) }}</template>
      </Column>
      <Column field="testsCount" header="Питань" sortable style="width: 8rem" />
      <Column field="activeSessionsCount" header="Активних сесій" style="width: 10rem">
        <template #body="{ data }">
          <Tag v-if="data.activeSessionsCount > 0" :value="String(data.activeSessionsCount)" severity="info" />
          <span v-else class="muted">0</span>
        </template>
      </Column>
      <Column style="width: 4rem">
        <template #body="{ data }">
          <Button
            v-tooltip.left="'Видалити'"
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            aria-label="Видалити"
            @click.stop="confirmDelete(data)"
          />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="dialogVisible" header="Новий набір тестів" modal :style="{ width: '32rem' }">
      <form class="col" @submit.prevent="create">
        <div class="field">
          <label for="title">Назва</label>
          <InputText id="title" v-model="newTitle" autofocus fluid />
        </div>
        <div class="field">
          <label for="description">Опис <span class="muted small">(необовʼязково)</span></label>
          <Textarea id="description" v-model="newDescription" rows="3" auto-resize fluid />
        </div>
        <div class="row" style="justify-content: flex-end">
          <Button label="Скасувати" severity="secondary" text @click="dialogVisible = false" />
          <Button type="submit" label="Створити" icon="pi pi-check" :loading="creating" :disabled="!newTitle.trim()" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.title-link {
  font-weight: 600;
  text-decoration: none;
}

.ellipsis {
  max-width: 40ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clickable :deep(tbody tr) {
  cursor: pointer;
}
</style>
