<script setup lang="ts">
import Button from 'primevue/button';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { serverNow } from '@/api/client';

const props = defineProps<{ deadlineAt: string }>();
const emit = defineEmits<{ expired: [] }>();

const now = ref(serverNow());
const hidden = ref(false);
let interval: ReturnType<typeof setInterval> | undefined;
let fired = false;

const remainingMs = computed(() => Math.max(0, Date.parse(props.deadlineAt) - now.value));
const urgent = computed(() => remainingMs.value <= 60_000);
const label = computed(() => {
  const total = Math.ceil(remainingMs.value / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
});

function tick() {
  now.value = serverNow();
  if (remainingMs.value <= 0 && !fired) {
    fired = true;
    emit('expired');
  }
}

watch(
  () => props.deadlineAt,
  () => {
    fired = false;
    tick();
  },
);

onMounted(() => {
  tick();
  interval = setInterval(tick, 250);
});
onBeforeUnmount(() => clearInterval(interval));
</script>

<template>
  <!-- click hides/shows the countdown; in the last minute it is always visible -->
  <Button
    v-tooltip.bottom="hidden && !urgent ? 'Показати час, що залишився' : 'Сховати час, що залишився'"
    icon="pi pi-clock"
    :label="hidden && !urgent ? undefined : label"
    :severity="urgent ? 'danger' : 'secondary'"
    :outlined="!urgent"
    class="timer"
    aria-label="Час, що залишився"
    @click="hidden = !hidden"
  />
</template>

<style scoped>
.timer :deep(.p-button-label) {
  font-variant-numeric: tabular-nums;
  min-width: 3.2em;
}
</style>
