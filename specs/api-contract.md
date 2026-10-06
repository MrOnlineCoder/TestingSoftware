# API Contract (shared between backend and frontend)

Both the backend agent and the frontend agent implement against this document. If something here
is ambiguous, the backend agent decides and updates this file; the frontend agent reads it before coding.

Base URL: `http://localhost:3000` in development (frontend dev server proxies `/api` to it).
All endpoints are prefixed with `/api`. All request/response bodies are JSON unless noted.
All IDs are UUID v4 strings. All timestamps are ISO-8601 strings in UTC.

## Conventions

- Errors: HTTP status + body `{ "code": "<ERROR_CODE>", "message": "<human text>", "timestamp": <ms epoch> }`.
- Error codes (enum `ErrorCode`): `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
  `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).
- Teacher-only endpoints require a valid teacher session cookie (`sid`, httpOnly). Otherwise 401 `UNAUTHORIZED`.
- Student/exam endpoints require no auth; the exam session UUID in the URL is the capability token.
- Lists are not paginated (MVP, local app).

## Shared types

```ts
type QuestionType = 'single_choice' | 'multiple_choice' | 'number' | 'free_text';

interface ChoiceOption { id: string; text: string; }   // id = UUID, text = plain text (short)

// Stored on a Test. Shape depends on `type`.
type CorrectAnswer =
  | { type: 'single_choice'; optionId: string }
  | { type: 'multiple_choice'; optionIds: string[] }            // partial credit, see Grading rules
  | { type: 'number'; value: number; tolerance?: number }       // |given - value| <= tolerance (default 0)
  | { type: 'free_text'; referenceAnswer: string };            // NOT auto-graded. Reference text shown to the teacher only.

// Given by a student. Shape depends on question type.
type StudentAnswer =
  | { type: 'single_choice'; optionId: string | null }
  | { type: 'multiple_choice'; optionIds: string[] }
  | { type: 'number'; value: number | null }
  | { type: 'free_text'; text: string };

// Grading rules (implemented once in the backend grader, mirrored in UI texts):
// - single_choice: full score iff optionId matches.
// - multiple_choice: score × max(0, (correctSelected − wrongSelected) / totalCorrect), rounded to 2 decimals.
//   isCorrect = true only when the awarded score equals the full score.
// - number: full score iff |given − value| <= tolerance.
// - free_text: not auto-graded; teacher grades manually (scoreAwarded null until then).
// - unanswered: 0.

interface Collection {
  id: string; title: string; description: string;
  createdAt: string; updatedAt: string;
  testsCount: number;            // computed
  activeSessionsCount: number;   // computed: sessions with status 'created' | 'in_progress'
}

interface Test {
  id: string; collectionId: string;
  position: number;              // 0-based order within the collection
  type: QuestionType;
  prompt: string;                // markdown
  explanation: string;           // markdown, may be empty; shown on results page if allowed
  score: number;                 // > 0, default 1
  options: ChoiceOption[];       // only for single_choice / multiple_choice, else []
  correctAnswer: CorrectAnswer;
  createdAt: string; updatedAt: string;
}

// Test as exposed to a student: no correctAnswer, no explanation.
type StudentTest = Omit<Test, 'correctAnswer' | 'explanation' | 'collectionId' | 'createdAt' | 'updatedAt'>;

type ExamSessionStatus = 'created' | 'in_progress' | 'submitted';
type ExamSessionOrigin = 'online' | 'offline';

interface ExamSessionSettings {
  allowNavigation: boolean;      // student may go back / skip questions
  showCorrectAnswer: boolean;    // student sees correctness + correct answer right after answering, and on results page
  showScore: boolean;            // student sees final score on results page
  timeLimitMinutes: number | null;
}

interface ExamSession {
  id: string; collectionId: string | null; collectionTitle: string;   // collectionId null if the suite was deleted later
  studentName: string; studentId: string | null;
  settings: ExamSessionSettings;
  status: ExamSessionStatus; origin: ExamSessionOrigin;
  createdAt: string; startedAt: string | null; submittedAt: string | null;
  deadlineAt: string | null;     // startedAt + timeLimit, null if no limit or not started
  totalScore: number | null;     // null until submitted
  maxScore: number;              // sum of question scores in the snapshot
}

interface ExamAnswer {
  testId: string;
  answer: StudentAnswer | null;  // null = not answered
  isCorrect: boolean | null;     // null until graded (session submitted, or immediately if showCorrectAnswer). Always null for free_text.
  scoreAwarded: number | null;   // for free_text: null until the teacher grades it manually
  answeredAt: string | null;
  locked: boolean;               // [backend] true once the answer can no longer be changed (see PUT /api/exam/:id/answers/:testId)
}
```

Sessions snapshot the collection's tests at creation time. Results always refer to the snapshot.

## Auth (teacher mode)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/teacher/login` | `{ password }` | 200 `{ ok: true }` + sets `sid` cookie; 401 on wrong password |
| POST | `/api/auth/teacher/logout` | – | 200 `{ ok: true }` |
| GET | `/api/auth/teacher/me` | – | 200 `{ authenticated: boolean }` (never 401) |

## Collections (teacher)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/collections` | – | `Collection[]` sorted by createdAt desc |
| POST | `/api/collections` | `{ title, description? }` | 201 `Collection` |
| GET | `/api/collections/:id` | – | `Collection & { tests: Test[] }` (tests sorted by position) |
| PATCH | `/api/collections/:id` | `{ title?, description? }` | `Collection`; 409 `CONFLICT` if activeSessionsCount > 0 |
| DELETE | `/api/collections/:id` | – | 204; 409 `CONFLICT` if activeSessionsCount > 0. Submitted sessions are kept (snapshot); their `collectionId` becomes null. |

## Tests (teacher)

All mutations return 409 `CONFLICT` if the parent collection has active sessions.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/collections/:collectionId/tests` | `{ type, prompt, explanation?, score?, options?, correctAnswer }` | 201 `Test` (appended at the end) |
| PATCH | `/api/collections/:collectionId/tests/:testId` | any subset of the above | `Test` |
| DELETE | `/api/collections/:collectionId/tests/:testId` | – | 204 (positions of following tests are compacted) |
| PUT | `/api/collections/:collectionId/tests/order` | `{ testIds: string[] }` (all ids, new order) | `Test[]` |

Validation rules (400 `VALIDATION_ERROR`):
- `single_choice` / `multiple_choice`: at least 2 options, non-empty texts; `correctAnswer.optionId(s)` must exist in options; multiple_choice needs ≥ 1 correct.
- `number`: `tolerance` ≥ 0 if given.
- `free_text`: `referenceAnswer` is any string (may be empty). Free-text questions are never auto-graded.
- `score` > 0. `prompt` non-empty.

[backend] Option ids: send `{ id, text }` to keep an existing option (ids stay stable on PATCH, so correct answers
stay valid). Options sent **without** `id` get a server-generated UUID; `correctAnswer.optionId(s)` may then refer
to such an option by its 0-based index in the `options` array written as a string (e.g. `"0"`). The frontend may
also generate UUIDs itself (`crypto.randomUUID()`) and send them as ids. On PATCH, `options` replaces the whole
list; changing `type` requires sending `correctAnswer` too. For number/free_text, `options` is always stored as `[]`.

## Exam sessions (teacher)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/exam-sessions` | query `?collectionId=` optional | `ExamSession[]` sorted by createdAt desc |
| POST | `/api/exam-sessions` | `{ collectionId, studentName, studentId?, settings: ExamSessionSettings }` | 201 `ExamSession`; 400 if collection has 0 tests |
| GET | `/api/exam-sessions/:id` | – | `ExamSession & { tests: Test[], answers: ExamAnswer[] }` (full, including correct answers) |
| DELETE | `/api/exam-sessions/:id` | – | 204 |
| PATCH | `/api/exam-sessions/:id/answers/:testId/grade` | `{ scoreAwarded: number }` (0 ≤ x ≤ test.score) | [backend] Same shape as `GET /api/exam-sessions/:id` (session with recomputed `totalScore`, tests, answers, `pendingManualGrading`). Only for `free_text` tests of a `submitted` session; 409 otherwise. |

Scoring with free-text questions: `maxScore` includes free-text scores. `totalScore` after submit counts
free-text answers as 0 until the teacher grades them; the session detail exposes `pendingManualGrading: number`
(count of ungraded free-text answers) so the UI can show "N answers await manual grading".

## Exam taking (student, no auth)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/exam/:id` | – | `{ session: ExamSession, tests: StudentTest[], answers: ExamAnswer[] }`. If `status === 'submitted'`: additionally `results: ResultsView` (see below). `isCorrect`/`scoreAwarded` in answers are populated only if `settings.showCorrectAnswer` and the question was answered. |
| POST | `/api/exam/:id/start` | – | `ExamSession` with `status: 'in_progress'`, `startedAt`, `deadlineAt`. 409 if already started/submitted. |
| PUT | `/api/exam/:id/answers/:testId` | `StudentAnswer` | `ExamAnswer`. If `settings.showCorrectAnswer` the response includes `isCorrect`, `scoreAwarded`, and `correctAnswer`, and the answer is **locked** (further PUT → 409). If `allowNavigation === false` the answer is also locked once set. 409 if session not in progress. 410-like behaviour: if deadline passed, server auto-submits and responds 409 `CONFLICT` with message "Time is over". |
| POST | `/api/exam/:id/submit` | – | `{ session: ExamSession, results: ResultsView }`. Grades every question, sets `totalScore`, `status: 'submitted'`. Idempotent (second call returns the same). |

```ts
interface ResultsView {
  totalScore: number | null;       // null if !settings.showScore
  maxScore: number;
  perQuestion: Array<{
    testId: string;
    answer: StudentAnswer | null;
    isCorrect: boolean | null;     // null if !settings.showCorrectAnswer, always null for free_text
    scoreAwarded: number | null;   // null if !settings.showScore
    correctAnswer: CorrectAnswer | null;  // null if !settings.showCorrectAnswer; for free_text the referenceAnswer is shown as the "model answer"
    explanation: string | null;    // null if !settings.showCorrectAnswer
  }>;
}
```

[backend] Student-facing details:
- Answers returned by `GET /api/exam/:id` and `PUT .../answers/:testId` additionally carry
  `correctAnswer: CorrectAnswer | null` and `explanation: string | null`. They are non-null only when
  `settings.showCorrectAnswer` and the answer is locked (or the session is submitted), so a page reload or going
  back to an earlier question can still show the revealed correct answer.
- `session.totalScore` in student responses is `null` unless `settings.showScore`.
- An "empty" answer (`optionId: null`, `optionIds: []`, `value: null`, blank text) is saved but neither locks nor
  reveals anything.
- `PUT .../answers/:testId` and `POST .../submit` return 409 when the exam has not been started yet.

Deadline handling: any student endpoint called after `deadlineAt` first auto-submits the session, then
behaves as if status is `submitted`. The frontend keeps its own countdown from `deadlineAt` and calls
`submit` when it hits zero.

## Offline exams (teacher) — see `ocr-plan.md` for details

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/offline-exams/:id` | – | [backend] `OfflineExam & { tests: Test[] }` (snapshot tests, for the scan review screen) |
| POST | `/api/collections/:id/offline-exams` | – | 201 `OfflineExam & { reused: boolean }`. Reuses the latest offline exam for this collection if it was created after the collection's `updatedAt` (test edits must bump `updatedAt`); otherwise creates a new one. 400 if the collection has no choice questions or they do not fit one page. |
| GET | `/api/offline-exams/:id/questions.html` | – | printable HTML of the questions |
| GET | `/api/offline-exams/:id/answer-sheet.pdf` | – | the OMR answer sheet PDF |
| POST | `/api/offline-exams/:id/scans` | multipart, one file field named `file`, PNG or JPEG, ≤ 20 MB | `ScanResult` (see below). Nothing is stored. 400 with a readable message if markers / QR cannot be found or the sheet belongs to another exam. |
| POST | `/api/offline-exams/:id/finalize` | `{ studentName, studentId?, answers: Record<testId, StudentAnswer \| null> }` | 201 `ExamSession` (origin `offline`, status `submitted`, graded). `answers` may include number/free-text answers typed in by the teacher from the paper; omitted tests count as unanswered. |

```ts
// [backend] offline exam shapes
interface OfflineExam {
  id: string; collectionId: string | null; collectionTitle: string; createdAt: string;
  testsCount: number;
  skippedTestIds: string[];      // number / free_text questions: not on the answer sheet, typed in during review
  questionsUrl: string;          // /api/offline-exams/:id/questions.html (open in a new tab, has a Print button)
  answerSheetUrl: string;        // /api/offline-exams/:id/answer-sheet.pdf
}

interface ScanResult {
  offlineExamId: string;
  detections: Array<{            // one per snapshot test, in snapshot order
    testId: string;
    answer: StudentAnswer | null;   // for 'ambiguous' single choice: best guess (darkest bubble)
    confidence: number;             // 0..1
    status: 'ok' | 'ambiguous' | 'empty' | 'manual';   // manual = number / free_text
    raw: Array<{ bubbleIndex: number; optionId: string; fillRatio: number }>;
  }>;
  overlayImage: string;          // PNG data URL of the rectified sheet with coloured circles
}
```

Question numbers on the answer sheet and in the questions document are `index + 1` in snapshot order
(number/free-text questions keep their number but have no row on the sheet).

