import { createRouter, createWebHistory } from 'vue-router';
import { useModeStore } from '@/stores/mode';

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'teacher' | 'exam';
    requiresTeacher?: boolean;
    /** teacher layout without navigation (login page) */
    hideNav?: boolean;
    title?: string;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => (useModeStore().mode === 'student' ? '/student' : '/teacher'),
    },
    {
      path: '/teacher/login',
      name: 'login',
      component: () => import('@/views/teacher/LoginView.vue'),
      meta: { layout: 'teacher', hideNav: true, title: 'Вхід для викладача' },
    },
    { path: '/teacher', redirect: '/teacher/collections' },
    {
      path: '/teacher/collections',
      name: 'collections',
      component: () => import('@/views/teacher/CollectionsListView.vue'),
      meta: { layout: 'teacher', requiresTeacher: true, title: 'Набори тестів' },
    },
    {
      path: '/teacher/collections/:id',
      name: 'collection',
      component: () => import('@/views/teacher/CollectionDetailView.vue'),
      meta: { layout: 'teacher', requiresTeacher: true, title: 'Набір тестів' },
    },
    {
      path: '/teacher/sessions',
      name: 'sessions',
      component: () => import('@/views/teacher/ExamSessionsListView.vue'),
      meta: { layout: 'teacher', requiresTeacher: true, title: 'Сесії іспитів' },
    },
    {
      path: '/teacher/sessions/:id',
      name: 'session',
      component: () => import('@/views/teacher/ExamSessionDetailView.vue'),
      meta: { layout: 'teacher', requiresTeacher: true, title: 'Сесія іспиту' },
    },
    {
      path: '/teacher/offline/:offlineExamId/scan',
      name: 'offline-scan',
      component: () => import('@/views/teacher/OfflineScanView.vue'),
      meta: { layout: 'teacher', requiresTeacher: true, title: 'Сканування бланків' },
    },
    {
      path: '/student',
      name: 'student',
      component: () => import('@/views/student/StudentInfoView.vue'),
      meta: { layout: 'exam', title: 'Студент' },
    },
    {
      path: '/exam/:id',
      name: 'exam',
      component: () => import('@/views/student/ExamView.vue'),
      meta: { layout: 'exam', title: 'Іспит' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const mode = useModeStore();
  if (to.meta.requiresTeacher) {
    if (!(await mode.ensureTeacherAuth())) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    mode.mode = 'teacher';
  }
  if (to.name === 'student') {
    mode.mode = 'student';
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Система тестування` : 'Система тестування';
});
