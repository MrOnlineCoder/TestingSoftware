# Backend Implementation Plan

Target: an AI agent implements this independently of the frontend. Read `specs/plan.md` (product spec),
`specs/api-contract.md` (the HTTP contract, binding) and this file. The frontend is built separately and
only talks to you via the contract.

## 0. Ground rules

- Location: `backend/` in the repo root. Standalone npm project, its own `package.json`, no monorepo tooling.
- Stack: Node.js 24+, TypeScript (strict, no `any`), Fastify 5, Drizzle ORM on `better-sqlite3`, drizzle-kit for migrations.
- Follow the SeamlessNodejsTemplate principles (https://github.com/MrOnlineCoder/SeamlessNodejsTemplate):
  feature folders, anemic entities as interfaces, `*Repository` interfaces implemented by Drizzle classes,
  manual DI in `src/deps.ts`, single `AppError(code, message)` + `ErrorCode` enum + one Fastify error handler,
  UUIDs generated in the application layer (`makeEntityId()` → `crypto.randomUUID()`), config via `dotenv-safe`
  with `.env.example`, no business logic in routes, no auth/db plugins as Fastify middlewares.
  Deviations from the template: SQLite instead of PostgreSQL; no mailer, no tests (spec says none), no Docker needed.
- Validation: Fastify route `schema` using `@sinclair/typebox` (gives TS types for free) + `@fastify/swagger` and
  `@fastify/swagger-ui` at `/docs`. Business validation (e.g. correct option id exists) lives in services, not schemas.
- No unit/e2e tests. Do add `npm run typecheck` and `npm run lint` (ESLint flat config, typescript-eslint).

## 1. Project layout

```
backend/
  .env.example            # TEACHER_PASSWORD, PORT=3000, HOST=0.0.0.0, DATABASE_PATH=./data/app.db, STATIC_DIR (optional), LOG_LEVEL
  package.json
  tsconfig.json
  drizzle.config.ts
  drizzle/                # generated SQL migrations (committed)
  data/                   # sqlite file (gitignored)
  src/
    index.ts              # load config, build deps, run migrations, start server
    config.ts             # typed config from env (dotenv-safe)
    server.ts             # buildServer(deps): registers plugins, routes, error handler, static frontend
    deps.ts               # manual DI: db, repositories, services → exported `Deps` object
    errors.ts             # AppError, ErrorCode, errorCodeToHttpStatus
    db/
      client.ts           # better-sqlite3 + drizzle instance, PRAGMA journal_mode=WAL, foreign_keys=ON
      schema.ts           # re-exports every feature's table
      migrate.ts          # drizzle migrator run at startup
    utils/id.ts, utils/time.ts
    auth/                 # teacher password login, in-memory sessions
      authService.ts, authRoutes.ts, sessionStore.ts, requireTeacher.ts (a preHandler factory, HTTP-level only)
    collections/
      collection.ts (entity), collectionsTable.ts, collectionsRepository.ts (+Drizzle impl), collectionsService.ts, collectionsRoutes.ts
    tests/
      test.ts (entity + QuestionType, CorrectAnswer, ChoiceOption types), testsTable.ts, testsRepository.ts, testsService.ts, testsRoutes.ts
    grading/
      grader.ts           # pure function: grade(test, studentAnswer) → { isCorrect, scoreAwarded }
    examSessions/
      examSession.ts (entity), examSessionsTable.ts, examAnswersTable.ts, examSessionsRepository.ts,
      examSessionsService.ts (teacher side), examTakingService.ts (student side), examSessionsRoutes.ts, examRoutes.ts
    offlineExams/         # see ocr-plan.md; implement LAST, behind the rest
  resources/              # HTML templates (eta) for printable question sheet
```

## 2. Database schema (Drizzle, SQLite)

Use `text` for UUIDs, `integer({ mode: 'timestamp_ms' })` for dates, `text({ mode: 'json' })` for JSON columns.

- `collections`: id PK, title, description (default ''), created_at, updated_at.
- `tests`: id PK, collection_id FK → collections (on delete cascade), position int, type text, prompt text,
  explanation text default '', score real, options json, correct_answer json, created_at, updated_at.
  Index on (collection_id, position).
- `exam_sessions`: id PK, collection_id nullable FK (on delete **set null**; the service additionally forbids deleting
  a collection with active sessions; submitted sessions survive thanks to the snapshot), collection_title text
  (denormalised), student_name, student_id nullable, settings json,
  status text, origin text, tests_snapshot json (array of full `Test` objects at creation), created_at,
  started_at nullable, submitted_at nullable, total_score real nullable, max_score real.
- `exam_answers`: id PK, session_id FK → exam_sessions (cascade), test_id text, answer json nullable,
  is_correct int nullable, score_awarded real nullable, locked int default 0, answered_at nullable.
  Unique (session_id, test_id).
- `offline_exams`: see `ocr-plan.md`.

Migrations: `drizzle-kit generate` output committed under `drizzle/`; `migrate.ts` applies them on boot.
`npm run db:generate` script for the agent to regenerate after schema edits.

## 3. Feature details

### 3.1 Config & bootstrap
- `config.ts`: `{ port, host, teacherPassword, databasePath, staticDir?, logLevel }`. Fail fast if password empty.
- `index.ts`: create data dir if missing, run migrations, `buildServer(deps).listen({ host, port })`.
- `server.ts`: register `@fastify/cookie`, `@fastify/cors` (dev only, origin `http://localhost:5173`, credentials true),
  `@fastify/multipart` (for scans), swagger. If `STATIC_DIR` set, register `@fastify/static` serving the built
  frontend with SPA fallback (`setNotFoundHandler` → `index.html` for non-`/api` GETs). This gives a single
  LAN-shareable origin (`http://<teacher-ip>:3000/exam/<id>`).
- Error handler: `AppError` → mapped status + `{ code, message, timestamp }`; Fastify validation error →
  400 `VALIDATION_ERROR` with the validation message; anything else → log + 500 `INTERNAL_ERROR`.

### 3.2 Auth
- `sessionStore.ts`: in-memory `Map<sessionId, { createdAt }>`; sessions never expire for MVP (process restart logs out).
- `authService.login(password)`: constant-time compare (`crypto.timingSafeEqual` on hashes) against config; returns session id.
- `requireTeacher(deps)` returns a Fastify `preHandler` that reads the `sid` cookie and throws `AppError(UNAUTHORIZED)`.
  This is HTTP glue, so it is allowed to be a hook; the logic (`authService.isValidSession`) is in the service.
- Cookie: `sid`, httpOnly, sameSite lax, path `/`.

### 3.3 Collections & tests
- `collectionsService`: list (with computed `testsCount`, `activeSessionsCount` via one grouped query each), get, create,
  update, delete. `assertEditable(collectionId)` throws `CONFLICT` if active sessions exist; reuse in tests service.
- `testsService`: create (position = max+1), update, delete (compact positions), reorder (validate the id set equals
  the collection's test ids). Every test mutation bumps the parent collection's `updatedAt` (used by offline-exam reuse). `validateTestPayload(type, options, correctAnswer)` implements the rules in the contract.
  Option ids are generated server-side if the client sends options without ids; keep existing ids on update so
  correct answers remain stable.
- `Test.options` must be `[]` for number/free_text.

### 3.4 Grading (`grading/grader.ts`)
Pure, no deps, exported function. Rules:
- single_choice: correct iff `optionId === correct.optionId`.
- multiple_choice (partial credit): `correctSelected` = selected ∩ correct, `wrongSelected` = selected \ correct;
  `scoreAwarded = round2(test.score * max(0, (correctSelected - wrongSelected) / totalCorrect))`;
  `isCorrect = scoreAwarded === test.score`.
- number: correct iff `value !== null && Math.abs(value - correct.value) <= (correct.tolerance ?? 0)`.
- free_text: **never auto-graded**. Returns `{ isCorrect: null, scoreAwarded: null }`; the teacher may set
  `scoreAwarded` manually later (`examSessionsService.gradeFreeText`). Counts as 0 in `totalScore` until graded.
- single_choice / number: `scoreAwarded = isCorrect ? test.score : 0`. Unanswered (any type except free_text) →
  `isCorrect=false, scoreAwarded=0`.
Also export `normaliseStudentAnswer(test, answer)` that rejects answers whose `type` does not match the test type
and option ids that do not exist (→ `VALIDATION_ERROR`).

### 3.5 Exam sessions (teacher side, `examSessionsService`)
- `create(input)`: load collection + tests; 400 if no tests; snapshot tests; `maxScore = sum(score)`;
  create one `exam_answers` row per test with `answer=null`. Status `created`.
- `list(filter)`, `get(id)` → session + snapshot tests + answers + `pendingManualGrading`, `delete(id)`.
- `gradeFreeText(sessionId, testId, scoreAwarded)`: 409 unless submitted and test is free_text; clamp to
  `[0, test.score]` else 400; store and recompute `totalScore = sum(scoreAwarded ?? 0)`.

### 3.6 Exam taking (student side, `examTakingService`)
- `view(id)`: load session; `enforceDeadline(session)` (if `in_progress` and now > deadline → `submit`). Return
  session, `StudentTest[]` (strip `correctAnswer`, `explanation`), answers (strip grading fields unless
  `showCorrectAnswer`), and `results` when submitted (built by `buildResultsView(session, settings)` which nulls
  fields according to the settings exactly as in the contract).
- `start(id)`: 409 unless `created`; set `startedAt`, `status`, `deadlineAt` = startedAt + limit (computed, not stored;
  derive from `settings.timeLimitMinutes`).
- `answer(id, testId, studentAnswer)`: 409 unless `in_progress` (after `enforceDeadline`); 404 if testId not in
  snapshot; 409 if `locked`; validate and store; if `settings.showCorrectAnswer` → grade now, store `isCorrect`,
  `scoreAwarded`, `locked=1`, and return correctness + `correctAnswer` (for free_text: no correctness, but still
  lock and return the `referenceAnswer`); else if `!allowNavigation` → `locked=1`.
- `submit(id)`: idempotent; grade all answers, store totals, set `submitted`, `submittedAt`.
All multi-row writes run inside a `better-sqlite3` transaction (`db.transaction`).

### 3.7 Offline exams
Implement after everything above works. Full spec in `specs/ocr-plan.md` (sections "Backend").

## 4. Scripts (package.json)

- `dev`: `tsx watch src/index.ts`
- `build`: `tsc -p tsconfig.json` → `dist/`
- `start`: `node dist/index.js`
- `typecheck`, `lint`, `db:generate` (`drizzle-kit generate`), `db:migrate` (runs `migrate.ts` standalone)

## 5. Implementation order (each step should compile)

1. Scaffold: package.json, tsconfig, eslint, config, errors, db client + empty schema, server with health route `/api/health`, swagger.
2. Auth feature; verify login/logout/me with curl.
3. Collections + tests features, migrations; verify CRUD via swagger UI.
4. Grader + exam sessions (teacher) + exam taking (student) + deadline handling.
5. Static frontend serving + README (`backend/README.md`: how to run, env vars, how to share on LAN).
6. Offline exams per `ocr-plan.md`.

## 6. Definition of done

- `npm run dev` starts on a clean checkout after `cp .env.example .env` and setting a password; DB auto-created.
- Every endpoint in `api-contract.md` exists, is documented in swagger, and returns the specified shapes.
- `npm run typecheck && npm run lint` pass with zero `any`.
- A manual smoke script in README (curl sequence: login → create collection → add 4 tests of each type →
  create session → start → answer → submit → view results) works end to end.
