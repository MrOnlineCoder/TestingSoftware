import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api';
import type { Collection, CreateCollectionInput } from '@/api/types';

export const useCollectionsStore = defineStore('collections', () => {
  const items = ref<Collection[]>([]);
  const loading = ref(false);

  async function fetchAll(): Promise<void> {
    loading.value = true;
    try {
      items.value = await api.collections.list();
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateCollectionInput): Promise<Collection> {
    const collection = await api.collections.create(input);
    items.value = [collection, ...items.value];
    return collection;
  }

  async function remove(id: string): Promise<void> {
    await api.collections.remove(id);
    items.value = items.value.filter((c) => c.id !== id);
  }

  return { items, loading, fetchAll, create, remove };
});
