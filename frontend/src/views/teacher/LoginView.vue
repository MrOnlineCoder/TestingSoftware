<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isMockMode } from '@/api';
import { isApiError } from '@/api/client';
import { MOCK_PASSWORD } from '@/api/mock';
import { useModeStore } from '@/stores/mode';

const route = useRoute();
const router = useRouter();
const mode = useModeStore();

const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  if (!password.value) return;
  loading.value = true;
  error.value = '';
  try {
    await mode.login(password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/teacher')
      ? route.query.redirect
      : '/teacher/collections';
    await router.replace(redirect);
  } catch (e) {
    error.value = isApiError(e, 'UNAUTHORIZED') ? 'Неправильний пароль.' : e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <form class="login-card" @submit.prevent="submit">
      <h1>Режим викладача</h1>
      <p class="muted">Введіть пароль викладача, налаштований на сервері.</p>
      <div class="field">
        <label for="password">Пароль</label>
        <Password v-model="password" input-id="password" :feedback="false" toggle-mask fluid autofocus :invalid="!!error" />
      </div>
      <Message v-if="error" severity="error" size="small" variant="simple">{{ error }}</Message>
      <Message v-if="isMockMode" severity="info" size="small">Демо-режим: пароль «{{ MOCK_PASSWORD }}».</Message>
      <Button type="submit" label="Увійти" icon="pi pi-sign-in" :loading="loading" :disabled="!password" fluid />
      <RouterLink to="/student" class="small">Я студент</RouterLink>
    </form>
  </div>
</template>

<style scoped>
.login-wrap {
  display: flex;
  justify-content: center;
  padding: 4rem 1rem;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-card p {
  margin: 0;
}
</style>
