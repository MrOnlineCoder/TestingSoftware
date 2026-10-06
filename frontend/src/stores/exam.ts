import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/api';
import { isApiError } from '@/api/client';
import type { ExamSession, ResultsView, StudentAnswer, StudentExamAnswer, StudentExamView, StudentTest } from '@/api/types';
import { emptyAnswer, isAnswered, sameAnswer } from '@/utils/format';

export type ExamPhase = 'loading' | 'start' | 'question' | 'review' | 'results' | 'error';

const AUTOSAVE_DELAY_MS = 500;

/** State of the exam the student currently has open (/exam/:id) */
export const useExamStore = defineStore('exam', () => {
  const examId = ref<string | null>(null);
  const session = ref<ExamSession | null>(null);
  const tests = ref<StudentTest[]>([]);
  const answers = ref<Record<string, StudentExamAnswer>>({});
  /** what is currently in the inputs, possibly not saved yet */
  const drafts = ref<Record<string, StudentAnswer>>({});
  const results = ref<ResultsView | null>(null);
  const currentIndex = ref(0);
  const phase = ref<ExamPhase>('loading');
  const errorMessage = ref('');
  /** one-off message for the student, e.g. "Time is over" */
  const notice = ref('');
  /** background save failure to be shown by the view */
  const saveError = ref('');
  const busy = ref(false);

  const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
  let saveChain: Promise<unknown> = Promise.resolve();

  const settings = computed(() => session.value?.settings ?? null);
  const currentTest = computed(() => tests.value[currentIndex.value] ?? null);
  /** autosave only where saving does not lock the answer */
  const autosave = computed(() => !!settings.value?.allowNavigation && !settings.value.showCorrectAnswer);
  const answeredCount = computed(() => tests.value.filter((t) => isAnswered(answers.value[t.id]?.answer)).length);
  const isLast = computed(() => currentIndex.value >= tests.value.length - 1);
  const canGoBack = computed(() => !!settings.value?.allowNavigation && currentIndex.value > 0);

  function isLocked(testId: string): boolean {
    return !!answers.value[testId]?.locked || session.value?.status !== 'in_progress';
  }

  /** Without navigation a question cannot be skipped: it must be answered before moving on */
  const canGoForward = computed(() => {
    const test = currentTest.value;
    if (!test || settings.value?.allowNavigation) return true;
    return answers.value[test.id]?.locked || isAnswered(drafts.value[test.id]);
  });

  function applyView(view: StudentExamView): void {
    session.value = view.session;
    tests.value = view.tests;
    answers.value = Object.fromEntries(view.answers.map((a) => [a.testId, a]));
    drafts.value = Object.fromEntries(view.tests.map((t) => [t.id, answers.value[t.id]?.answer ?? emptyAnswer(t.type)]));
    results.value = view.results ?? null;
  }

  function initialPhase(): void {
    switch (session.value?.status) {
      case 'created':
        phase.value = 'start';
        break;
      case 'in_progress': {
        const allowNavigation = session.value.settings.allowNavigation;
        const first = tests.value.findIndex((t) =>
          allowNavigation ? !isAnswered(answers.value[t.id]?.answer) : !answers.value[t.id]?.locked,
        );
        currentIndex.value = first < 0 ? (allowNavigation ? 0 : tests.value.length - 1) : first;
        phase.value = first < 0 && !allowNavigation ? 'review' : 'question';
        break;
      }
      default:
        phase.value = 'results';
    }
  }

  async function load(id: string): Promise<void> {
    if (examId.value !== id) {
      phase.value = 'loading';
      notice.value = '';
    }
    examId.value = id;
    try {
      applyView(await api.exam.view(id));
      initialPhase();
    } catch (error) {
      phase.value = 'error';
      errorMessage.value = isApiError(error, 'NOT_FOUND')
        ? 'Такого іспиту не існує. Перевірте посилання, яке дав вам викладач.'
        : error instanceof Error
          ? error.message
          : String(error);
    }
  }

  /** Re-reads the session after the server refused an action (time over, already submitted...) */
  async function resync(message: string): Promise<void> {
    const before = session.value?.status;
    await load(examId.value!);
    if (before === 'in_progress' && session.value?.status === 'submitted') {
      // the server message is not localised; recognise it and show our own text
      notice.value = message === 'Time is over' ? 'Час вичерпано. Ваш іспит здано автоматично.' : message;
    }
  }

  async function start(): Promise<void> {
    busy.value = true;
    try {
      session.value = await api.exam.start(examId.value!);
      currentIndex.value = 0;
      phase.value = 'question';
    } catch (error) {
      if (isApiError(error, 'CONFLICT')) await resync(error.message);
      else throw error;
    } finally {
      busy.value = false;
    }
  }

  function setDraft(testId: string, value: StudentAnswer): void {
    drafts.value[testId] = value;
    if (!autosave.value) return;
    clearTimeout(pendingSaves.get(testId));
    pendingSaves.set(
      testId,
      setTimeout(() => void saveAnswer(testId), AUTOSAVE_DELAY_MS),
    );
  }

  /** Saves the draft of one question if it changed. Serialised, so saves never overtake each other. */
  function saveAnswer(testId: string): Promise<boolean> {
    clearTimeout(pendingSaves.get(testId));
    pendingSaves.delete(testId);
    const run = async (): Promise<boolean> => {
      const draft = drafts.value[testId];
      const saved = answers.value[testId];
      if (!draft || !examId.value || session.value?.status !== 'in_progress' || saved?.locked) return true;
      if (sameAnswer(draft, saved?.answer ?? emptyAnswer(draft.type))) return true;
      try {
        answers.value[testId] = await api.exam.answer(examId.value, testId, draft);
        saveError.value = '';
        return true;
      } catch (error) {
        if (isApiError(error, 'CONFLICT')) {
          await resync(error.message);
        } else {
          saveError.value = error instanceof Error ? error.message : String(error);
        }
        return false;
      }
    };
    const result = saveChain.then(run, run);
    saveChain = result;
    return result;
  }

  async function saveCurrent(): Promise<boolean> {
    return currentTest.value ? saveAnswer(currentTest.value.id) : true;
  }

  async function goTo(index: number): Promise<void> {
    if (index < 0 || index >= tests.value.length) return;
    busy.value = true;
    try {
      const ok = await saveCurrent();
      if (ok && phase.value !== 'results') {
        currentIndex.value = index;
        phase.value = 'question';
      }
    } finally {
      busy.value = false;
    }
  }

  async function next(): Promise<void> {
    if (isLast.value) {
      await openReview();
    } else {
      await goTo(currentIndex.value + 1);
    }
  }

  async function previous(): Promise<void> {
    if (canGoBack.value) await goTo(currentIndex.value - 1);
  }

  async function openReview(): Promise<void> {
    busy.value = true;
    try {
      const ok = await saveCurrent();
      if (ok && phase.value !== 'results') phase.value = 'review';
    } finally {
      busy.value = false;
    }
  }

  async function submit(): Promise<void> {
    if (!examId.value) return;
    busy.value = true;
    try {
      if (phase.value === 'question') await saveCurrent();
      if (session.value?.status === 'in_progress') {
        await api.exam.submit(examId.value);
      }
      // reload to get the revealed answers / results exactly as the settings allow
      await load(examId.value);
    } catch (error) {
      if (isApiError(error, 'CONFLICT')) await resync(error.message);
      else throw error;
    } finally {
      busy.value = false;
    }
  }

  /** Called by the timer at 0; the server would auto-submit on the next request anyway */
  async function onTimeUp(): Promise<void> {
    if (session.value?.status !== 'in_progress') return;
    await submit();
    notice.value = 'Час вичерпано. Ваш іспит здано автоматично.';
  }

  return {
    examId,
    session,
    tests,
    answers,
    drafts,
    results,
    currentIndex,
    phase,
    errorMessage,
    notice,
    saveError,
    busy,
    settings,
    currentTest,
    autosave,
    answeredCount,
    isLast,
    canGoBack,
    canGoForward,
    isLocked,
    load,
    start,
    setDraft,
    saveAnswer,
    saveCurrent,
    goTo,
    next,
    previous,
    openReview,
    submit,
    onTimeUp,
  };
});
