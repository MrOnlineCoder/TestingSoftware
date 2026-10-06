# Frontend Implementation Plan

Target: an AI agent implements this independently of the backend. Read `specs/plan.md` (product spec),
`specs/api-contract.md` (binding HTTP contract) and this file. During development the backend may not exist yet:
build against the contract, and provide a tiny in-memory mock mode (see §6) so the UI can be exercised alone.

## 0. Ground rules

- Location: `frontend/` in the repo root. Standalone Vite project, its own `package.json`, no monorepo tooling.
- Stack: Vue 3 (`<script setup lang="ts">`), Vite, TypeScript strict, Pinia, vue-router 4, PrimeVue 4 (Aura theme)
  + `primeicons`, native `fetch` wrapped in one small client. Markdown: `marked` + `DOMPurify` for rendering prompts.
- Keep it simple: plain PrimeVue components (DataTable, Button, Dialog, InputText, Textarea, Dropdown/Select,
  RadioButton, Checkbox, InputNumber, Toast, ConfirmDialog, Tag, Card, ProgressBar). No custom design system.
  Minimal CSS, PrimeFlex or plain flex utilities are fine.
- No unit/e2e tests. Add `npm run typecheck` (`vue-tsc --noEmit`) and `npm run lint`.
- `vite.config.ts`: dev server on 5173, `server.proxy['/api'] → http://localhost:3000`. `npm run build` outputs to
  `dist/`; the backend serves that directory in production (single origin, LAN shareable).
- Mirror the contract's TS types verbatim in `src/api/types.ts` (copy them; do not import across projects).

## 1. Project layout

```
frontend/src/
  main.ts                  # PrimeVue, Pinia, router, ToastService, ConfirmationService
  App.vue                  # <RouterView/>; layout chosen per route meta (teacher layout vs exam layout)
  router/index.ts
  api/
    client.ts              # fetch wrapper: JSON, credentials 'include', throws ApiError{code,message,status}
    types.ts               # contract types
    auth.ts collections.ts tests.ts examSessions.ts exam.ts offlineExams.ts   # one function per endpoint
    mock/                  # §6 — in-memory implementation behind the same function signatures
  stores/
    mode.ts                # 'teacher' | 'student', persisted in localStorage; teacherAuthenticated flag
    collections.ts tests.ts examSessions.ts   # teacher data
    exam.ts                # the student's current exam session state
  layouts/
    TeacherLayout.vue      # top bar: nav links (Test suites, Exam sessions), mode switcher, logout
    ExamLayout.vue         # top bar: student name, timer button/countdown
  components/
    MarkdownView.vue       # renders sanitized markdown
    MarkdownEditor.vue     # Textarea + live preview toggle
    QuestionEditor.vue     # inline editor for one Test (Google-Forms-like card)
    QuestionAnswerInput.vue# renders the input for a StudentTest by type, v-model StudentAnswer
    AnswerReview.vue       # shows given answer vs correct answer (teacher results + student results)
    ExamTimer.vue
  views/
    teacher/
      LoginView.vue
      CollectionsListView.vue
      CollectionDetailView.vue
      ExamSessionsListView.vue
      ExamSessionDetailView.vue
      OfflineExamDialog.vue       # download docs (see ocr-plan.md)
      OfflineScanView.vue         # upload scan, review detections, finalize (see ocr-plan.md)
    student/
      StudentInfoView.vue         # static text: "Open the exam link your teacher gave you"
      ExamView.vue                # start → questions → review/submit → results, driven by exam store
```

## 2. Routes

| Path | View | Layout | Guard |
|---|---|---|---|
| `/` | redirect to `/teacher` if mode=teacher else `/student` | – | – |
| `/teacher/login` | LoginView | Teacher (no nav) | – |
| `/teacher` | redirect `/teacher/collections` | – | teacher auth |
| `/teacher/collections` | CollectionsListView | Teacher | teacher auth |
| `/teacher/collections/:id` | CollectionDetailView | Teacher | teacher auth |
| `/teacher/sessions` | ExamSessionsListView | Teacher | teacher auth |
| `/teacher/sessions/:id` | ExamSessionDetailView | Teacher | teacher auth |
| `/teacher/offline/:offlineExamId/scan` | OfflineScanView | Teacher | teacher auth |
| `/student` | StudentInfoView (static text only, no input) | Exam | – |
| `/exam/:id` | ExamView | Exam | – |

Teacher auth guard: on first navigation call `GET /api/auth/teacher/me`; if not authenticated → `/teacher/login?redirect=`.
Mode switcher in the top bar sets the mode store and navigates to `/teacher` or `/student`.

## 3. Teacher mode screens

### 3.1 Login
Password field + button. On 401 show inline error. On success go to redirect or `/teacher/collections`.

### 3.2 Collections list
DataTable: title (link), created date, questions count, active sessions count. Toolbar: "New test suite" (Dialog with
title + description). Row actions: open, delete (ConfirmDialog; on 409 show toast "Suite has active exam sessions").

### 3.3 Collection detail (Google-Forms style)
- Header: editable title/description (inline, save on blur), "Start exam session" button, "Offline exam" button,
  banner "Read-only: N active sessions" when `activeSessionsCount > 0` (disable all editing).
- List of `QuestionEditor` cards in order. Each card: type Select, prompt MarkdownEditor, score InputNumber,
  type-specific block:
  - single/multiple choice: list of options (InputText + remove), "Add option"; RadioButton (single) or Checkbox
    (multiple) next to each option marks the correct one(s).
  - number: correct value InputNumber + tolerance InputNumber.
  - free text: reference answer Textarea (optional, for the teacher's eyes only; not auto-graded).
  - explanation MarkdownEditor (collapsed by default).
  Card footer: Save (PATCH, disabled until dirty), Delete, move up/down (calls reorder endpoint).
- "Add question" button at bottom creates a card in local "new" state; first Save does POST.
- Client-side validation mirrors contract rules; surface server `VALIDATION_ERROR` messages in a toast.
- "Start exam session" Dialog: student name (required), student ID, three checkboxes (allow navigation, show
  correct answers immediately, show final score), time limit minutes (optional). On create: show the exam URL
  (`${location.origin}/exam/${id}`) with copy button and "Open" link, and a note that other devices on the LAN
  must use the teacher machine's IP instead of localhost.

### 3.4 Exam sessions list
DataTable: suite title, student name, student id, score (`total/max` or `–`), status Tag, origin, created date.
Filter Select by collection. Row: open details, delete (confirm).

### 3.5 Exam session detail
Header card with session info and settings. Then one card per snapshot test: question number, prompt (markdown),
`AnswerReview` (student's answer, correct answer, correct/partial/incorrect Tag, score awarded / max; multiple
choice may award fractional points). For free-text
questions show the student's text, the reference answer, and an InputNumber + "Save grade" that calls the manual
grade endpoint (Tag "Needs grading" while `scoreAwarded === null`). Footer: total, plus "N answers await grading".

### 3.6 Offline exam (bonus) — see `ocr-plan.md` §"Frontend".

## 4. Student mode screens (`/exam/:id`, `ExamView`)

The `exam` store holds `{ session, tests, answers, results, currentIndex, phase }` where
`phase: 'loading' | 'start' | 'question' | 'review' | 'results' | 'error'`. Derive the initial phase from the
loaded session: `created` → start; `in_progress` → question (first unanswered, or 0); `submitted` → results.

- Top bar (ExamLayout): student name, question progress `3 / 10`, timer (ExamTimer counts down from
  `session.deadlineAt`; when it reaches 0 the store calls `submit()` and moves to results).
- Start page: suite title, number of questions, time limit, rules (navigation allowed or not, etc.), "Start" button
  → `POST /start`.
- Question page: one question; `MarkdownView` prompt; `QuestionAnswerInput` by type:
  single → RadioButton list; multiple → Checkbox list; number → InputNumber; free text → Textarea.
  Buttons: Previous (only if `allowNavigation` and index > 0), Next / "Go to review" on last. Answers are saved
  with `PUT /answers/:testId` when the student leaves the question (Next/Previous/Review) and when the value
  changes with a 500 ms debounce. If the response contains `isCorrect` (showCorrectAnswer mode) show an inline
  result panel (correct/incorrect, correct answer) and lock the inputs. If `allowNavigation === false` lock
  the input after Next. Handle 409 "Time is over" by reloading the session (→ results).
  If `allowNavigation` show a question palette (numbered buttons, answered ones highlighted) for jumping.
- Review page: list of all questions with the given answer summary and "Edit" (if navigation allowed) +
  "Submit" button with ConfirmDialog. → `POST /submit`.
- Results page: if `results.totalScore !== null` show score big; per question: prompt, your answer, and
  if present: correct answer, correct/incorrect tag, explanation. Free-text questions show "Reviewed by the
  teacher" instead of a correct/incorrect tag, and the model answer if `showCorrectAnswer`. If nothing is allowed to be shown,
  display "Your answers have been submitted."
- Closed/submitted sessions opened later render the results page directly.
- Persist nothing locally beyond what the server returns; a page refresh reloads state via `GET /api/exam/:id`.

## 5. API client

`client.ts`: `request<T>(method, path, body?, opts?)` → parses JSON, on non-2xx throws `ApiError` with the contract's
`{code,message}`; 401 on a teacher route resets `mode.teacherAuthenticated` and routes to login. All API modules are
thin typed wrappers. Toast helper `showApiError(err)` used by views.

## 6. Mock mode (for developing without the backend)

`VITE_USE_MOCK=true` swaps the api modules for `api/mock/*` which implement the same functions over an in-memory
store seeded with one collection containing one question of each type. Keep this small; it exists only so the
frontend agent can run and verify every screen. Not shipped in the production build path.

## 7. Implementation order

1. Scaffold Vite + Vue + TS + PrimeVue + Pinia + router; layouts, mode switcher, routes with placeholder views.
2. API client + types + mock mode.
3. Teacher: login, collections list, collection detail with question editor (all four types), session creation dialog.
4. Teacher: sessions list + detail with AnswerReview.
5. Student: full exam flow including timer, locking rules, results.
6. `frontend/README.md`: run, build, env vars, mock mode.
7. Offline exam screens per `ocr-plan.md` (last).

## 8. Definition of done

- `npm run dev` with `VITE_USE_MOCK=true` lets a reviewer walk every screen; with the mock off it works against the
  real backend on `localhost:3000`.
- `npm run build`, `typecheck`, `lint` pass.
- Every setting of an exam session visibly changes the student experience (navigation, immediate feedback, score
  visibility, timer).
