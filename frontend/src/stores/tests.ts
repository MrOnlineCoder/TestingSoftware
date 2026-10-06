import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/api';
import type { CollectionWithTests, CreateCollectionInput, Test, TestInput } from '@/api/types';

/** The collection currently open in the editor, with its tests */
export const useTestsStore = defineStore('tests', () => {
  const collection = ref<CollectionWithTests | null>(null);
  const loading = ref(false);

  const tests = computed(() => collection.value?.tests ?? []);
  const readOnly = computed(() => (collection.value?.activeSessionsCount ?? 0) > 0);

  function setTests(next: Test[]): void {
    if (!collection.value) return;
    collection.value.tests = [...next].sort((a, b) => a.position - b.position);
    collection.value.testsCount = next.length;
  }

  async function load(id: string): Promise<void> {
    loading.value = true;
    try {
      collection.value = await api.collections.get(id);
    } finally {
      loading.value = false;
    }
  }

  async function updateCollection(patch: Partial<CreateCollectionInput>): Promise<void> {
    if (!collection.value) return;
    const updated = await api.collections.update(collection.value.id, patch);
    collection.value = { ...collection.value, ...updated };
  }

  async function createTest(input: TestInput): Promise<Test> {
    const test = await api.tests.create(collection.value!.id, input);
    setTests([...tests.value, test]);
    return test;
  }

  async function updateTest(testId: string, patch: Partial<TestInput>): Promise<Test> {
    const test = await api.tests.update(collection.value!.id, testId, patch);
    setTests(tests.value.map((t) => (t.id === testId ? test : t)));
    return test;
  }

  async function deleteTest(testId: string): Promise<void> {
    await api.tests.remove(collection.value!.id, testId);
    setTests(tests.value.filter((t) => t.id !== testId).map((t, i) => ({ ...t, position: i })));
  }

  async function move(testId: string, direction: -1 | 1): Promise<void> {
    const ids = tests.value.map((t) => t.id);
    const from = ids.indexOf(testId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    setTests(await api.tests.reorder(collection.value!.id, ids));
  }

  return { collection, loading, tests, readOnly, load, updateCollection, createTest, updateTest, deleteTest, move };
});
