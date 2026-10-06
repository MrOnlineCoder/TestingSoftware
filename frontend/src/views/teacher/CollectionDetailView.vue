<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { isApiError } from '@/api/client';
import type { TestInput } from '@/api/types';
import QuestionEditor from '@/components/QuestionEditor.vue';
import StartSessionDialog from '@/components/StartSessionDialog.vue';
import { useTestsStore } from '@/stores/tests';
import { countUk } from '@/utils/format';
import { uuid } from '@/utils/uuid';
import { useApiError } from '@/utils/useApiError';
import OfflineExamDialog from './OfflineExamDialog.vue';

const route = useRoute();
const store = useTestsStore();
const toast = useToast();
const showApiError = useApiError();

const title = ref('');
const description = ref('');
const newDrafts = ref<string[]>([]);
const startDialog = ref(false);
const offlineDialog = ref(false);
const notFound = ref(false);

const collectionId = computed(() => String(route.params.id));
const collection = computed(() => store.collection);

async function load() {
  notFound.value = false;
  newDrafts.value = [];
  try {
    await store.load(collectionId.value);
    title.value = store.collection?.title ?? '';
    description.value = store.collection?.description ?? '';
    if (store.tests.length === 0 && !store.readOnly) newDrafts.value = [uuid()];
  } catch (e) {
    if (isApiError(e, 'NOT_FOUND')) notFound.value = true;
    else showApiError(e, 'Не вдалося завантажити набір тестів');
  }
}

watch(collectionId, load, { immediate: true });

/** A 409 means sessions were started meanwhile: reload to switch to read-only */
async function handleMutationError(e: unknown, summary: string) {
  if (isApiError(e, 'CONFLICT')) {
    toast.add({ severity: 'warn', summary: 'Набір доступний лише для читання', detail: e.message, life: 5000 });
    await load();
  } else {
    showApiError(e, summary);
  }
}

async function saveHeader() {
  if (!collection.value || store.readOnly) return;
  const patch: { title?: string; description?: string } = {};
  if (title.value.trim() && title.value.trim() !== collection.value.title) patch.title = title.value.trim();
  if (description.value !== collection.value.description) patch.description = description.value;
  if (!title.value.trim()) title.value = collection.value.title;
  if (Object.keys(patch).length === 0) return;
  try {
    await store.updateCollection(patch);
    toast.add({ severity: 'success', summary: 'Збережено', life: 1500 });
  } catch (e) {
    title.value = collection.value.title;
    description.value = collection.value.description;
    await handleMutationError(e, 'Не вдалося зберегти');
  }
}

function saveExisting(testId: string) {
  return async (input: TestInput): Promise<boolean> => {
    try {
      await store.updateTest(testId, input);
      toast.add({ severity: 'success', summary: 'Питання збережено', life: 1500 });
      return true;
    } catch (e) {
      await handleMutationError(e, 'Не вдалося зберегти питання');
      return false;
    }
  };
}

function saveNew(key: string) {
  return async (input: TestInput): Promise<boolean> => {
    try {
      await store.createTest(input);
      newDrafts.value = newDrafts.value.filter((k) => k !== key);
      toast.add({ severity: 'success', summary: 'Питання додано', life: 1500 });
      return true;
    } catch (e) {
      await handleMutationError(e, 'Не вдалося додати питання');
      return false;
    }
  };
}

async function deleteTest(testId: string) {
  try {
    await store.deleteTest(testId);
  } catch (e) {
    await handleMutationError(e, 'Не вдалося видалити питання');
  }
}

async function move(testId: string, direction: -1 | 1) {
  try {
    await store.move(testId, direction);
  } catch (e) {
    await handleMutationError(e, 'Не вдалося змінити порядок');
  }
}

function addQuestion() {
  newDrafts.value.push(uuid());
}

async function onSessionCreated() {
  // the suite becomes read-only while the session is active
  await load();
}
</script>

<template>
  <div class="page page-narrow">
    <div v-if="notFound" class="empty-state">
      <i class="pi pi-question-circle" />
      Набір тестів не знайдено. <RouterLink to="/teacher/collections">Повернутися до списку</RouterLink>
    </div>

    <div v-else-if="!collection || store.loading && collection.id !== collectionId" class="empty-state">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" />
    </div>

    <template v-else>
      <RouterLink to="/teacher/collections" class="small back"><i class="pi pi-arrow-left" /> Набори тестів</RouterLink>

      <header class="suite-header">
        <div class="grow col">
          <InputText
            v-model="title"
            class="title-input"
            :disabled="store.readOnly"
            aria-label="Назва"
            @blur="saveHeader"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <Textarea
            v-model="description"
            class="description-input"
            placeholder="Опис (необовʼязково)"
            rows="1"
            auto-resize
            :disabled="store.readOnly"
            aria-label="Опис"
            @blur="saveHeader"
          />
        </div>
        <div class="col actions">
          <Button label="Розпочати сесію іспиту" icon="pi pi-play" :disabled="store.tests.length === 0" @click="startDialog = true" />
          <Button label="Паперовий іспит" icon="pi pi-print" severity="secondary" outlined :disabled="store.tests.length === 0" @click="offlineDialog = true" />
        </div>
      </header>

      <Message v-if="store.readOnly" severity="warn" class="banner">
        Лише для читання: {{ countUk(collection.activeSessionsCount, ['активна сесія', 'активні сесії', 'активних сесій']) }} іспиту.
        Редагування знову стане доступним, коли їх буде здано або видалено.
        <RouterLink :to="{ name: 'sessions', query: { collectionId: collection.id } }">Переглянути сесії</RouterLink>
      </Message>

      <div class="questions">
        <QuestionEditor
          v-for="(test, index) in store.tests"
          :key="test.id"
          :test="test"
          :number="index + 1"
          :read-only="store.readOnly"
          :can-move-up="index > 0"
          :can-move-down="index < store.tests.length - 1"
          :save="saveExisting(test.id)"
          @delete="deleteTest(test.id)"
          @move="move(test.id, $event)"
        />
        <template v-if="!store.readOnly">
          <QuestionEditor
            v-for="(key, index) in newDrafts"
            :key="key"
            :test="null"
            :number="store.tests.length + index + 1"
            :read-only="false"
            :can-move-up="false"
            :can-move-down="false"
            :save="saveNew(key)"
            @discard="newDrafts = newDrafts.filter((k) => k !== key)"
          />
        </template>
      </div>

      <div v-if="!store.readOnly" class="add-row">
        <Button label="Додати питання" icon="pi pi-plus" severity="secondary" outlined @click="addQuestion" />
      </div>

      <StartSessionDialog
        v-model:visible="startDialog"
        :collection-id="collection.id"
        :collection-title="collection.title"
        @created="onSessionCreated"
      />
      <OfflineExamDialog v-model:visible="offlineDialog" :collection-id="collection.id" />
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

.suite-header {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-top: 6px solid var(--p-primary-color);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.title-input {
  font-size: 1.5rem;
  font-weight: 700;
  border-color: transparent;
  box-shadow: none;
  padding-left: 0.4rem;
}

.description-input {
  border-color: transparent;
  box-shadow: none;
  padding-left: 0.4rem;
  resize: none;
}

.title-input:hover:not(:disabled),
.description-input:hover:not(:disabled),
.title-input:focus,
.description-input:focus {
  border-color: var(--p-surface-300);
}

.actions {
  min-width: 13rem;
}

.banner {
  margin-bottom: 1rem;
}

.questions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.add-row {
  display: flex;
  justify-content: center;
  margin-top: 1.25rem;
}
</style>
