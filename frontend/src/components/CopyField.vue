<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { ref } from 'vue';

const props = defineProps<{ value: string; openLabel?: string }>();
const toast = useToast();
const input = ref<{ $el: HTMLInputElement } | null>(null);

async function copy() {
  try {
    // the Clipboard API only exists in secure contexts (https / localhost)
    await navigator.clipboard.writeText(props.value);
  } catch {
    const el = input.value?.$el;
    el?.select();
    document.execCommand('copy');
  }
  toast.add({ severity: 'success', summary: 'Посилання скопійовано', life: 2000 });
}
</script>

<template>
  <div class="row">
    <InputText ref="input" :model-value="value" readonly class="grow" @focus="($event.target as HTMLInputElement).select()" />
    <Button v-tooltip.top="'Копіювати'" icon="pi pi-copy" severity="secondary" outlined aria-label="Копіювати" @click="copy" />
    <Button as="a" :href="value" target="_blank" rel="noopener" :label="openLabel ?? 'Відкрити'" icon="pi pi-external-link" severity="secondary" outlined />
  </div>
</template>
