import Aura from '@primeuix/themes/aura';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { createApp } from 'vue';
import 'primeicons/primeicons.css';
import { setUnauthorizedHandler } from './api/client';
import App from './App.vue';
import { UK_LOCALE } from './primevueLocale';
import { router } from './router';
import { useModeStore } from './stores/mode';
import './style.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    // light theme only; the app is meant for classroom screens/projectors
    options: { darkModeSelector: '.app-dark' },
  },
  locale: UK_LOCALE,
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', Tooltip);

// A 401 from a teacher endpoint means the server restarted (sessions are in memory) or the user logged out elsewhere
setUnauthorizedHandler(() => {
  const mode = useModeStore(pinia);
  mode.teacherAuthenticated = false;
  const current = router.currentRoute.value;
  if (current.meta.requiresTeacher) {
    void router.push({ name: 'login', query: { redirect: current.fullPath } });
  }
});

app.mount('#app');
