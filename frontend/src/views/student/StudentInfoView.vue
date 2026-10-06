<script setup lang="ts">
import { useModeStore } from '@/stores/mode';

const mode = useModeStore();
</script>

<template>
  <div class="page page-narrow">
    <div class="info">
      <i class="pi pi-link" />
      <h1>Відкрийте посилання на іспит, яке дав вам викладач</h1>
      <p class="muted">
        Кожен іспит має власну адресу, наприклад <code>/exam/…</code>. Попросіть посилання у викладача.
        На цій сторінці нічого робити не потрібно.
      </p>
      <RouterLink to="/teacher" class="small muted teacher-link" @click="mode.mode = 'teacher'">Режим викладача</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.info {
  text-align: center;
  padding: 4rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.info > .pi {
  font-size: 2.5rem;
  color: var(--p-primary-color);
}

.info p {
  max-width: 36rem;
  margin: 0;
}

.teacher-link {
  margin-top: 2rem;
}
</style>
