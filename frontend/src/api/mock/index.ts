// In-memory fake of the backend for `VITE_USE_MOCK=true`. Small on purpose: just enough logic
// (validation basics, grading, locking, deadline) to walk every screen without the real server.
import type { Api } from '../index';
import { ApiError } from '../client';
import type {
  Collection,
  CorrectAnswer,
  ExamAnswer,
  ExamSession,
  ExamSessionDetail,
  OfflineExam,
  ResultsView,
  StudentAnswer,
  StudentExamAnswer,
  Test,
  TestInput,
} from '../types';
import { uuid } from '../../utils/uuid';

export const MOCK_PASSWORD = 'mock';

interface StoredSession extends Omit<ExamSession, 'deadlineAt'> {
  tests: Test[];
  answers: ExamAnswer[];
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 120));
const iso = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;
// JSON copy: inputs often come straight from reactive state (Proxies), which structuredClone rejects
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fail(status: number, code: ApiError['code'], message: string): never {
  throw new ApiError(status, code, message);
}

function grade(test: Test, answer: StudentAnswer | null): { isCorrect: boolean | null; scoreAwarded: number | null } {
  const c = test.correctAnswer;
  if (c.type === 'free_text') return { isCorrect: null, scoreAwarded: null };
  if (!answer || answer.type !== c.type) return { isCorrect: false, scoreAwarded: 0 };
  if (c.type === 'single_choice' && answer.type === 'single_choice') {
    const ok = answer.optionId === c.optionId;
    return { isCorrect: ok, scoreAwarded: ok ? test.score : 0 };
  }
  if (c.type === 'multiple_choice' && answer.type === 'multiple_choice') {
    const right = answer.optionIds.filter((id) => c.optionIds.includes(id)).length;
    const wrong = answer.optionIds.length - right;
    const score = round2(test.score * Math.max(0, (right - wrong) / c.optionIds.length));
    return { isCorrect: score === test.score, scoreAwarded: score };
  }
  if (c.type === 'number' && answer.type === 'number') {
    const ok = answer.value !== null && Math.abs(answer.value - c.value) <= (c.tolerance ?? 0) + 1e-9;
    return { isCorrect: ok, scoreAwarded: ok ? test.score : 0 };
  }
  return { isCorrect: false, scoreAwarded: 0 };
}

function isAnswered(a: StudentAnswer | null): boolean {
  if (!a) return false;
  switch (a.type) {
    case 'single_choice':
      return a.optionId !== null;
    case 'multiple_choice':
      return a.optionIds.length > 0;
    case 'number':
      return a.value !== null;
    case 'free_text':
      return a.text.trim() !== '';
  }
}

function seed() {
  const collectionId = uuid();
  const t = iso();
  const opts = (texts: string[]) => texts.map((text) => ({ id: uuid(), text }));
  const single = opts(['Париж', 'Берлін', 'Мадрид']);
  const multi = opts(['2', '3', '4', '5']);
  const base = { collectionId, explanation: '', score: 1, createdAt: t, updatedAt: t };
  const tests: Test[] = [
    {
      ...base,
      id: uuid(),
      position: 0,
      type: 'single_choice',
      prompt: 'Яка столиця **Франції**?',
      explanation: 'Париж є столицею з 987 року.',
      options: single,
      correctAnswer: { type: 'single_choice', optionId: single[0]!.id },
    },
    {
      ...base,
      id: uuid(),
      position: 1,
      type: 'multiple_choice',
      prompt: 'Позначте всі **прості** числа.',
      score: 2,
      options: multi,
      correctAnswer: { type: 'multiple_choice', optionIds: [multi[0]!.id, multi[1]!.id, multi[3]!.id] },
    },
    {
      ...base,
      id: uuid(),
      position: 2,
      type: 'number',
      prompt: 'Чому дорівнює число π, округлене до 2 знаків після коми?',
      options: [],
      correctAnswer: { type: 'number', value: 3.14, tolerance: 0.005 },
    },
    {
      ...base,
      id: uuid(),
      position: 3,
      type: 'free_text',
      prompt: 'Поясніть одним реченням, що таке *рекурсія*.',
      options: [],
      correctAnswer: { type: 'free_text', referenceAnswer: 'Функція, яка викликає сама себе.' },
    },
  ];
  const collection: Omit<Collection, 'testsCount' | 'activeSessionsCount'> = {
    id: collectionId,
    title: 'Демонстраційний набір',
    description: 'Створено демо-режимом: по одному питанню кожного типу.',
    createdAt: t,
    updatedAt: t,
  };
  return { collections: [collection], tests, sessions: [] as StoredSession[], offline: [] as Array<OfflineExam & { tests: Test[] }> };
}

export function createMockApi(): Api {
  const db = seed();
  let authenticated = false;

  const requireTeacher = () => {
    if (!authenticated) fail(401, 'UNAUTHORIZED', 'Потрібно увійти як викладач');
  };
  const activeCount = (collectionId: string) =>
    db.sessions.filter((s) => s.collectionId === collectionId && s.status !== 'submitted').length;
  const testsOf = (collectionId: string) =>
    db.tests.filter((t) => t.collectionId === collectionId).sort((a, b) => a.position - b.position);
  const findCollection = (id: string) => db.collections.find((c) => c.id === id) ?? fail(404, 'NOT_FOUND', 'Набір тестів не знайдено');
  const withStats = (c: (typeof db.collections)[number]): Collection => ({
    ...c,
    testsCount: testsOf(c.id).length,
    activeSessionsCount: activeCount(c.id),
  });
  const assertEditable = (id: string) => {
    const c = findCollection(id);
    if (activeCount(id) > 0) fail(409, 'CONFLICT', 'У наборі є активні сесії іспитів');
    return c;
  };
  const touch = (id: string) => {
    findCollection(id).updatedAt = iso();
  };
  const findSession = (id: string) => db.sessions.find((s) => s.id === id) ?? fail(404, 'NOT_FOUND', 'Сесію іспиту не знайдено');
  const deadline = (s: StoredSession) =>
    s.startedAt && s.settings.timeLimitMinutes !== null
      ? new Date(Date.parse(s.startedAt) + s.settings.timeLimitMinutes * 60_000).toISOString()
      : null;
  const toSession = (s: StoredSession): ExamSession => {
    const { tests: _t, answers: _a, ...rest } = s;
    return clone({ ...rest, deadlineAt: deadline(s) });
  };
  const toDetail = (s: StoredSession): ExamSessionDetail => ({
    ...toSession(s),
    tests: clone(s.tests),
    answers: clone(s.answers),
    pendingManualGrading:
      s.status === 'submitted'
        ? s.answers.filter((a) => s.tests.find((t) => t.id === a.testId)?.type === 'free_text' && a.scoreAwarded === null).length
        : 0,
  });
  const doSubmit = (s: StoredSession) => {
    for (const a of s.answers) {
      const test = s.tests.find((t) => t.id === a.testId)!;
      if (test.type !== 'free_text') Object.assign(a, grade(test, isAnswered(a.answer) ? a.answer : null));
      a.locked = true;
    }
    s.status = 'submitted';
    s.submittedAt = iso();
    s.totalScore = round2(s.answers.reduce((sum, a) => sum + (a.scoreAwarded ?? 0), 0));
  };
  const enforceDeadline = (s: StoredSession) => {
    const d = deadline(s);
    if (s.status === 'in_progress' && d && Date.now() > Date.parse(d)) doSubmit(s);
  };
  const studentSession = (s: StoredSession) => {
    const session = toSession(s);
    return s.settings.showScore ? session : { ...session, totalScore: null };
  };
  const studentAnswer = (s: StoredSession, a: ExamAnswer): StudentExamAnswer => {
    const test = s.tests.find((t) => t.id === a.testId)!;
    const reveal = s.settings.showCorrectAnswer && a.locked && isAnswered(a.answer);
    const show = reveal || (s.settings.showCorrectAnswer && s.status === 'submitted');
    return {
      ...clone(a),
      isCorrect: reveal ? a.isCorrect : null,
      scoreAwarded: reveal ? a.scoreAwarded : null,
      correctAnswer: show ? clone(test.correctAnswer) : null,
      explanation: show ? test.explanation : null,
    };
  };
  const results = (s: StoredSession): ResultsView => ({
    totalScore: s.settings.showScore ? s.totalScore : null,
    maxScore: s.maxScore,
    perQuestion: s.tests.map((t) => {
      const a = s.answers.find((x) => x.testId === t.id)!;
      return {
        testId: t.id,
        answer: clone(a.answer),
        isCorrect: s.settings.showCorrectAnswer && t.type !== 'free_text' ? (a.isCorrect ?? false) : null,
        scoreAwarded: s.settings.showScore ? (a.scoreAwarded ?? (t.type === 'free_text' ? null : 0)) : null,
        correctAnswer: s.settings.showCorrectAnswer ? clone(t.correctAnswer) : null,
        explanation: s.settings.showCorrectAnswer ? t.explanation : null,
      };
    }),
  });
  const resolveTest = (input: TestInput, existing?: Test): Pick<Test, 'options' | 'correctAnswer'> => {
    const indexToId = new Map<string, string>();
    const options = (input.options ?? existing?.options ?? []).map((o, i) => {
      const id = o.id ?? uuid();
      if (!o.id) indexToId.set(String(i), id);
      return { id, text: o.text.trim() };
    });
    let correctAnswer: CorrectAnswer = clone(input.correctAnswer);
    if (correctAnswer.type === 'single_choice') correctAnswer.optionId = indexToId.get(correctAnswer.optionId) ?? correctAnswer.optionId;
    if (correctAnswer.type === 'multiple_choice')
      correctAnswer = { ...correctAnswer, optionIds: correctAnswer.optionIds.map((id) => indexToId.get(id) ?? id) };
    if (!input.prompt.trim()) fail(400, 'VALIDATION_ERROR', 'Текст питання не може бути порожнім');
    if (input.type === 'single_choice' || input.type === 'multiple_choice') {
      if (options.length < 2 || options.some((o) => !o.text)) fail(400, 'VALIDATION_ERROR', 'Питання з вибором потребує щонайменше 2 непорожніх варіантів');
      const ids = options.map((o) => o.id);
      const chosen = correctAnswer.type === 'single_choice' ? [correctAnswer.optionId] : correctAnswer.type === 'multiple_choice' ? correctAnswer.optionIds : [];
      if (chosen.length === 0 || chosen.some((id) => !ids.includes(id))) fail(400, 'VALIDATION_ERROR', 'Позначте правильні варіанти');
      return { options, correctAnswer };
    }
    return { options: [], correctAnswer };
  };

  return {
    auth: {
      async login(password) {
        await delay();
        if (password !== MOCK_PASSWORD) fail(401, 'UNAUTHORIZED', `Неправильний пароль (у демо-режимі пароль «${MOCK_PASSWORD}»)`);
        authenticated = true;
        return { ok: true };
      },
      async logout() {
        authenticated = false;
        return { ok: true };
      },
      async me() {
        await delay();
        return { authenticated };
      },
    },
    collections: {
      async list() {
        await delay();
        requireTeacher();
        return db.collections.map(withStats).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async get(id) {
        await delay();
        requireTeacher();
        return { ...withStats(findCollection(id)), tests: clone(testsOf(id)) };
      },
      async create(input) {
        await delay();
        requireTeacher();
        const c = { id: uuid(), title: input.title.trim(), description: input.description ?? '', createdAt: iso(), updatedAt: iso() };
        db.collections.push(c);
        return withStats(c);
      },
      async update(id, patch) {
        await delay();
        requireTeacher();
        const c = assertEditable(id);
        Object.assign(c, patch, { updatedAt: iso() });
        return withStats(c);
      },
      async remove(id) {
        await delay();
        requireTeacher();
        assertEditable(id);
        db.collections = db.collections.filter((c) => c.id !== id);
        db.tests = db.tests.filter((t) => t.collectionId !== id);
        db.sessions.forEach((s) => {
          if (s.collectionId === id) s.collectionId = null;
        });
      },
    },
    tests: {
      async create(collectionId, input) {
        await delay();
        requireTeacher();
        assertEditable(collectionId);
        const test: Test = {
          id: uuid(),
          collectionId,
          position: testsOf(collectionId).length,
          type: input.type,
          prompt: input.prompt,
          explanation: input.explanation ?? '',
          score: input.score ?? 1,
          ...resolveTest(input),
          createdAt: iso(),
          updatedAt: iso(),
        };
        db.tests.push(test);
        touch(collectionId);
        return clone(test);
      },
      async update(collectionId, testId, patch) {
        await delay();
        requireTeacher();
        assertEditable(collectionId);
        const test = db.tests.find((t) => t.id === testId) ?? fail(404, 'NOT_FOUND', 'Питання не знайдено');
        const merged: TestInput = {
          type: patch.type ?? test.type,
          prompt: patch.prompt ?? test.prompt,
          explanation: patch.explanation ?? test.explanation,
          score: patch.score ?? test.score,
          options: patch.options ?? test.options,
          correctAnswer: patch.correctAnswer ?? test.correctAnswer,
        };
        Object.assign(test, merged, resolveTest(merged, test), { updatedAt: iso() });
        touch(collectionId);
        return clone(test);
      },
      async remove(collectionId, testId) {
        await delay();
        requireTeacher();
        assertEditable(collectionId);
        db.tests = db.tests.filter((t) => t.id !== testId);
        testsOf(collectionId).forEach((t, i) => (t.position = i));
        touch(collectionId);
      },
      async reorder(collectionId, testIds) {
        await delay();
        requireTeacher();
        assertEditable(collectionId);
        testIds.forEach((id, i) => {
          const t = db.tests.find((x) => x.id === id);
          if (t) t.position = i;
        });
        touch(collectionId);
        return clone(testsOf(collectionId));
      },
    },
    examSessions: {
      async list(collectionId) {
        await delay();
        requireTeacher();
        db.sessions.forEach(enforceDeadline);
        return db.sessions
          .filter((s) => !collectionId || s.collectionId === collectionId)
          .map(toSession)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      async get(id) {
        await delay();
        requireTeacher();
        const s = findSession(id);
        enforceDeadline(s);
        return toDetail(s);
      },
      async create(input) {
        await delay();
        requireTeacher();
        const c = findCollection(input.collectionId);
        const tests = clone(testsOf(c.id));
        if (tests.length === 0) fail(400, 'VALIDATION_ERROR', 'У наборі немає питань');
        const s: StoredSession = {
          id: uuid(),
          collectionId: c.id,
          collectionTitle: c.title,
          studentName: input.studentName.trim(),
          studentId: input.studentId?.trim() || null,
          settings: clone(input.settings),
          status: 'created',
          origin: 'online',
          createdAt: iso(),
          startedAt: null,
          submittedAt: null,
          totalScore: null,
          maxScore: round2(tests.reduce((sum, t) => sum + t.score, 0)),
          tests,
          answers: tests.map((t) => ({ testId: t.id, answer: null, isCorrect: null, scoreAwarded: null, answeredAt: null, locked: false })),
        };
        db.sessions.push(s);
        return toSession(s);
      },
      async remove(id) {
        await delay();
        requireTeacher();
        db.sessions = db.sessions.filter((s) => s.id !== id);
      },
      async grade(id, testId, scoreAwarded) {
        await delay();
        requireTeacher();
        const s = findSession(id);
        const test = s.tests.find((t) => t.id === testId);
        if (s.status !== 'submitted' || test?.type !== 'free_text') fail(409, 'CONFLICT', 'Оцінювати вручну можна лише вільні відповіді зданих сесій');
        if (scoreAwarded < 0 || scoreAwarded > test.score) fail(400, 'VALIDATION_ERROR', `Бал має бути від 0 до ${test.score}`);
        s.answers.find((a) => a.testId === testId)!.scoreAwarded = round2(scoreAwarded);
        s.totalScore = round2(s.answers.reduce((sum, a) => sum + (a.scoreAwarded ?? 0), 0));
        return toDetail(s);
      },
    },
    exam: {
      async view(id) {
        await delay();
        const s = findSession(id);
        enforceDeadline(s);
        return {
          session: studentSession(s),
          tests: s.tests.map(({ id: tid, position, type, prompt, score, options }) => ({ id: tid, position, type, prompt, score, options: clone(options) })),
          answers: s.answers.map((a) => studentAnswer(s, a)),
          ...(s.status === 'submitted' ? { results: results(s) } : {}),
        };
      },
      async start(id) {
        await delay();
        const s = findSession(id);
        if (s.status !== 'created') fail(409, 'CONFLICT', 'Іспит уже розпочато');
        s.status = 'in_progress';
        s.startedAt = iso();
        return studentSession(s);
      },
      async answer(id, testId, value) {
        await delay();
        const s = findSession(id);
        const wasInProgress = s.status === 'in_progress';
        enforceDeadline(s);
        // 'Time is over' stays in English on purpose: same text as the real backend, the exam store recognises it
        if (wasInProgress && s.status === 'submitted') fail(409, 'CONFLICT', 'Time is over');
        if (s.status !== 'in_progress') fail(409, 'CONFLICT', 'Іспит не триває');
        const test = s.tests.find((t) => t.id === testId) ?? fail(404, 'NOT_FOUND', 'Питання не знайдено');
        const a = s.answers.find((x) => x.testId === testId)!;
        if (a.locked) fail(409, 'CONFLICT', 'Цю відповідь заблоковано, її не можна змінити');
        if (value.type !== test.type) fail(400, 'VALIDATION_ERROR', 'Тип відповіді не відповідає питанню');
        Object.assign(a, { answer: clone(value), answeredAt: iso(), isCorrect: null, scoreAwarded: null });
        if (isAnswered(value) && s.settings.showCorrectAnswer) Object.assign(a, grade(test, value), { locked: true });
        else if (isAnswered(value) && !s.settings.allowNavigation) a.locked = true;
        return studentAnswer(s, a);
      },
      async submit(id) {
        await delay();
        const s = findSession(id);
        if (s.status === 'created') fail(409, 'CONFLICT', 'Іспит ще не розпочато');
        if (s.status === 'in_progress') doSubmit(s);
        return { session: studentSession(s), results: results(s) };
      },
    },
    offlineExams: {
      async createOrReuse(collectionId) {
        await delay();
        requireTeacher();
        const c = findCollection(collectionId);
        const tests = clone(testsOf(collectionId));
        if (!tests.some((t) => t.type === 'single_choice' || t.type === 'multiple_choice'))
          fail(400, 'VALIDATION_ERROR', 'У наборі немає питань з вибором відповіді');
        const latest = db.offline.filter((o) => o.collectionId === collectionId).at(-1);
        if (latest && latest.createdAt > c.updatedAt) return { ...clone(latest), reused: true };
        const html = `<h1>${c.title}</h1><p>Демо-режим: справжній аркуш із питаннями генерує сервер.</p>`;
        const exam = {
          id: uuid(),
          collectionId,
          collectionTitle: c.title,
          createdAt: iso(),
          testsCount: tests.length,
          skippedTestIds: tests.filter((t) => t.type === 'number' || t.type === 'free_text').map((t) => t.id),
          questionsUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          answerSheetUrl: `data:text/plain;charset=utf-8,${encodeURIComponent('Демо-режим: PDF-бланк відповідей генерує сервер.')}`,
          tests,
        };
        db.offline.push(exam);
        return { ...clone(exam), reused: false };
      },
      async get(id) {
        await delay();
        requireTeacher();
        return clone(db.offline.find((o) => o.id === id) ?? fail(404, 'NOT_FOUND', 'Паперовий іспит не знайдено'));
      },
      async scan(id) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        requireTeacher();
        const exam = db.offline.find((o) => o.id === id) ?? fail(404, 'NOT_FOUND', 'Паперовий іспит не знайдено');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="594"><rect width="100%" height="100%" fill="#f4f4f5"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" fill="#71717a">демо: результат сканування</text></svg>`;
        return {
          offlineExamId: id,
          overlayImage: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          detections: exam.tests.map((t, i) => {
            if (t.type === 'single_choice') {
              const ambiguous = i % 2 === 1;
              return { testId: t.id, answer: { type: 'single_choice', optionId: t.options[0]!.id }, confidence: ambiguous ? 0.2 : 0.95, status: ambiguous ? 'ambiguous' : 'ok', raw: [] };
            }
            if (t.type === 'multiple_choice') {
              return { testId: t.id, answer: { type: 'multiple_choice', optionIds: t.options.slice(0, 2).map((o) => o.id) }, confidence: 0.9, status: 'ok', raw: [] };
            }
            return { testId: t.id, answer: null, confidence: 0, status: 'manual', raw: [] };
          }),
        };
      },
      async finalize(id, input) {
        await delay();
        requireTeacher();
        const exam = db.offline.find((o) => o.id === id) ?? fail(404, 'NOT_FOUND', 'Паперовий іспит не знайдено');
        const s: StoredSession = {
          id: uuid(),
          collectionId: exam.collectionId,
          collectionTitle: exam.collectionTitle,
          studentName: input.studentName,
          studentId: input.studentId ?? null,
          settings: { allowNavigation: true, showCorrectAnswer: true, showScore: true, timeLimitMinutes: null },
          status: 'in_progress',
          origin: 'offline',
          createdAt: iso(),
          startedAt: iso(),
          submittedAt: null,
          totalScore: null,
          maxScore: round2(exam.tests.reduce((sum, t) => sum + t.score, 0)),
          tests: clone(exam.tests),
          answers: exam.tests.map((t) => ({ testId: t.id, answer: clone(input.answers[t.id] ?? null), isCorrect: null, scoreAwarded: null, answeredAt: iso(), locked: false })),
        };
        doSubmit(s);
        db.sessions.push(s);
        return toSession(s);
      },
    },
  };
}
