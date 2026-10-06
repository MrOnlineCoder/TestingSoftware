<script setup lang="ts">
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ExamLayout from './layouts/ExamLayout.vue';
import TeacherLayout from './layouts/TeacherLayout.vue';

const route = useRoute();
const layout = computed(() => (route.meta.layout === 'exam' ? ExamLayout : TeacherLayout));
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
  <Toast position="top-right" />
  <ConfirmDialog />
</template>
