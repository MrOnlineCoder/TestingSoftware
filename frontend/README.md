# Testing Software – Frontend

Vue 3 + TypeScript + Vite, Pinia, vue-router 4, PrimeVue 4 (Aura). Talks to the backend only through
`specs/api-contract.md` (types mirrored in `src/api/types.ts`).

## Run

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173, /api is proxied to http://localhost:3000 (start the backend first)
npm run dev:mock       # same, but against an in-memory mock; no backend needed
```

In mock mode the teacher password is `mock`, and one demo suite with one question of each type is preloaded.
Data lives in memory and is lost on page reload. The offline exam documents and the scan result are placeholders in
mock mode. Everything else (sessions, locking, timer, grading) behaves like the real backend.

## Build / serve

```bash
npm run build          # type-checks, then outputs dist/
```

The backend serves `dist/` when started with `STATIC_DIR=../frontend/dist` (see `backend/README.md`), which gives one
origin for UI and API. Students on the local network then open `http://<teacher-ip>:3000/exam/<session-id>`.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `VITE_USE_MOCK` | `false` | `true` swaps the API for the in-memory mock (`src/api/mock`). `npm run dev:mock` sets it for you. |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `dev:mock` | Vite dev server on port 5173 (also reachable from the LAN) |
| `npm run build` | `vue-tsc` + production build into `dist/` |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint + eslint-plugin-vue) |

## Structure

```
src/
  api/          client.ts (fetch wrapper, ApiError), one module per resource, index.ts picks real vs mock
  stores/       mode (teacher/student + auth), collections, tests (open suite), examSessions, exam (student flow)
  layouts/      TeacherLayout (nav, mode switcher), ExamLayout (student name, progress, timer)
  components/   QuestionEditor, QuestionAnswerInput, AnswerReview, Markdown{View,Editor}, ExamTimer, StartSessionDialog, CopyField
  views/        teacher/* and student/* (ExamView switches between start → question → review → results)
```

## Behaviour notes

- **Saving answers.** Answers are auto-saved 500 ms after a change only when that cannot lock them, i.e. navigation is
  allowed and correct answers are not shown immediately. In the other modes the server locks an answer as soon as it
  is saved. So it is saved with **Check answer** (immediate feedback mode) or when the student moves on, and a misclick
  is never locked in by accident.
- **No navigation.** Questions are shown in order. *Next* is enabled only once the question is answered, and there is
  no way back.
- **Timer.** Counts down from `deadlineAt`, corrected for the client clock's offset to the server's `Date` header (LAN
  devices often have skewed clocks). At zero the exam is submitted. If the server already auto-submitted, any request
  returns 409 and the view reloads into the results. The timer button hides or shows the remaining time, and it is
  always visible during the last minute.
- **Teacher session detail** refreshes every 5 s while the session is not submitted.
- **Exam links** use `location.origin`. When the teacher works on `localhost`, the start dialog reminds them to share the
  LAN IP instead.
