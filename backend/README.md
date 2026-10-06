# Testing Software – Backend

Fastify 5 + TypeScript + Drizzle ORM on SQLite. Implements `specs/api-contract.md`.
Interactive API docs (Swagger UI): <http://localhost:3000/docs>.

## Run

Requires Node.js 24+.

```bash
cd backend
npm install
cp .env.example .env        # then set TEACHER_PASSWORD
npm run dev                 # http://localhost:3000, DB file is created and migrated automatically
```

Production-style run (one origin for API + frontend):

```bash
npm run build               # compiles to dist/
STATIC_DIR=../frontend/dist NODE_ENV=production npm start
```

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `TEACHER_PASSWORD` | – (required) | Password for teacher mode. The server refuses to start if empty. |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` makes the app reachable from the local network. |
| `DATABASE_PATH` | `./data/app.db` | SQLite file, relative to `backend/`. Folder is created if missing. |
| `STATIC_DIR` | empty | Folder with the built frontend. If set, it is served at `/` with SPA fallback (`/exam/<id>` etc. return `index.html`). |
| `LOG_LEVEL` | `info` | pino log level |
| `NODE_ENV` | – | Not in `.env.example`. Anything other than `production` enables CORS for the Vite dev server (`http://localhost:5173`). |

All variables listed in `.env.example` must be present in `.env` (dotenv-safe), empty values are allowed except the password.

## Sharing exams on the local network

1. Build the frontend and start the backend with `STATIC_DIR` pointing at it (see above), `HOST=0.0.0.0`.
2. Find the teacher machine's LAN IP (macOS: `ipconfig getifaddr en0`, Linux: `hostname -I`, Windows: `ipconfig`).
3. Students open `http://<teacher-ip>:3000/exam/<session-id>`. The session UUID is the only "key"; no login.
4. Allow incoming connections on the port in the OS firewall if needed.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Watch mode via `tsx` |
| `npm run build` / `npm start` | Compile to `dist/` / run compiled build |
| `npm run typecheck` | `tsc` over `src/`, `scripts/` and `drizzle.config.ts` |
| `npm run lint` | ESLint (flat config, typescript-eslint, `no-explicit-any` = error) |
| `npm run db:generate` | Generate a new SQL migration in `drizzle/` after editing a `*Table.ts` |
| `npm run db:migrate` | Apply migrations without starting the server (the server also does it on boot) |
| `npm run omr:selftest` | Offline-exam recognition check: renders the answer sheet, fills it synthetically, rotates / perspective-warps it and verifies the detected answers. Writes input + overlay images to `data/omr-selftest/`. Uses `pdftoppm` (poppler) if installed. |

## Code layout

Feature folders following [SeamlessNodejsTemplate](https://github.com/MrOnlineCoder/SeamlessNodejsTemplate):
entities are plain interfaces, persistence goes through `*Repository` interfaces with Drizzle implementations,
everything is wired by hand in `src/deps.ts`, errors are `AppError(ErrorCode, message)` mapped by one handler in
`src/server.ts`. Routes only validate (TypeBox schemas), call one service method and map the result to a DTO.

```
src/
  auth/           teacher password login, in-memory sessions, requireTeacher preHandler
  collections/    test suites
  tests/          questions; payload validation, option id handling
  grading/        grader.ts: pure grading + answer normalisation
  examSessions/   teacher-side sessions (examSessionsService) and student-side flow (examTakingService)
  offlineExams/   printable questions (eta + marked), answer sheet PDF (pdf-lib + qrcode),
                  omr/ recognition (OpenCV WASM + jsQR + sharp) behind the OmrEngine interface
resources/        HTML template for the printable questions document
drizzle/          generated SQL migrations (committed)
scripts/          omr-selftest.ts
```

## Offline exams (OMR) – how recognition works

1. The answer sheet has 4 solid black corner markers, a QR code with the offline exam id (top right, off-centre)
   and one row of bubbles per single/multiple-choice question. Number and free-text questions are answered on
   the questions document; the teacher types them in during review.
2. A scan/photo is EXIF-rotated, greyscaled and resized; the markers are found as solid square contours, and the
   page is perspective-corrected onto an A4 canvas at 200 dpi. Because the markers are identical, all 4 corner
   assignments are tried; only the right one puts the QR code where the layout expects it. This handles any
   90°/180° rotation.
3. Each bubble's fill ratio is measured inside 0.8·r and corrected by a background ring just outside it.
   Thresholds (in `omr/omrDecision.ts`): ≥ 0.45 filled, 0.25–0.45 ambiguous; single choice additionally needs the
   winner to be 2× darker than the runner-up.

Flatbed scans and scanner apps work best. Phone photos work if all 4 markers are visible and the page is flat.

## Manual smoke test

Requires `curl` and `jq`. Run with the server started (`npm run dev`) and `TEACHER_PASSWORD=devpass`.
Option ids are assigned by the server; the `correctAnswer` refers to new options by their index (`"0"`, `"1"`, …).

```bash
API=http://localhost:3000/api
JAR=$(mktemp)
J='Content-Type: application/json'

# 1. login
curl -s -c $JAR -H "$J" -d '{"password":"devpass"}' $API/auth/teacher/login; echo
curl -s -b $JAR $API/auth/teacher/me; echo

# 2. collection
CID=$(curl -s -b $JAR -H "$J" -d '{"title":"Smoke test","description":"curl"}' $API/collections | jq -r .id)

# 3. one test of each type
T1=$(curl -s -b $JAR -H "$J" $API/collections/$CID/tests -d '{"type":"single_choice","prompt":"2+2?","options":[{"text":"3"},{"text":"4"}],"correctAnswer":{"type":"single_choice","optionId":"1"}}')
T2=$(curl -s -b $JAR -H "$J" $API/collections/$CID/tests -d '{"type":"multiple_choice","prompt":"Primes?","score":2,"options":[{"text":"2"},{"text":"3"},{"text":"4"}],"correctAnswer":{"type":"multiple_choice","optionIds":["0","1"]}}')
T3=$(curl -s -b $JAR -H "$J" $API/collections/$CID/tests -d '{"type":"number","prompt":"Pi to 2 decimals","correctAnswer":{"type":"number","value":3.14,"tolerance":0.005}}')
T4=$(curl -s -b $JAR -H "$J" $API/collections/$CID/tests -d '{"type":"free_text","prompt":"Explain recursion","correctAnswer":{"type":"free_text","referenceAnswer":"A function calling itself"}}')
curl -s -b $JAR $API/collections/$CID | jq '{title, testsCount, tests: [.tests[] | {position, type}]}'

# 4. exam session
SID=$(curl -s -b $JAR -H "$J" $API/exam-sessions -d "{\"collectionId\":\"$CID\",\"studentName\":\"Alice\",\"settings\":{\"allowNavigation\":true,\"showCorrectAnswer\":false,\"showScore\":true,\"timeLimitMinutes\":30}}" | jq -r .id)

# 5. student: view, start, answer, submit (no cookie needed)
curl -s $API/exam/$SID | jq '.session.status, (.tests | length)'
curl -s -X POST $API/exam/$SID/start | jq '{status, deadlineAt}'
T1_ID=$(echo $T1 | jq -r .id); T1_OK=$(echo $T1 | jq -r '.correctAnswer.optionId')
T2_ID=$(echo $T2 | jq -r .id); T2_A=$(echo $T2 | jq -c '[.options[0].id, .options[2].id]')
T3_ID=$(echo $T3 | jq -r .id); T4_ID=$(echo $T4 | jq -r .id)
curl -s -X PUT -H "$J" $API/exam/$SID/answers/$T1_ID -d "{\"type\":\"single_choice\",\"optionId\":\"$T1_OK\"}" | jq -c .
curl -s -X PUT -H "$J" $API/exam/$SID/answers/$T2_ID -d "{\"type\":\"multiple_choice\",\"optionIds\":$T2_A}" | jq -c .
curl -s -X PUT -H "$J" $API/exam/$SID/answers/$T3_ID -d '{"type":"number","value":3.141}' | jq -c .
curl -s -X PUT -H "$J" $API/exam/$SID/answers/$T4_ID -d '{"type":"free_text","text":"It calls itself"}' | jq -c .
curl -s -X POST $API/exam/$SID/submit | jq '.session.status, .results.totalScore, .results.maxScore'
# expected: "submitted", 2, 5  (T1 1 + T2 0 [1 right − 1 wrong] + T3 1 + T4 free text pending; max 1+2+1+1)

# 6. results (student view) and teacher detail + manual grading of the free-text answer
curl -s $API/exam/$SID | jq '.results.perQuestion[] | {testId, scoreAwarded}'
curl -s -b $JAR $API/exam-sessions/$SID | jq '{totalScore, pendingManualGrading}'
curl -s -b $JAR -X PATCH -H "$J" $API/exam-sessions/$SID/answers/$T4_ID/grade -d '{"scoreAwarded":1}' | jq '{totalScore, pendingManualGrading}'

# 7. editing is blocked while a session is active: open a second session, expect 409, delete it, expect 200
SID2=$(curl -s -b $JAR -H "$J" $API/exam-sessions -d "{\"collectionId\":\"$CID\",\"studentName\":\"Bob\",\"settings\":{\"allowNavigation\":true,\"showCorrectAnswer\":true,\"showScore\":true,\"timeLimitMinutes\":null}}" | jq -r .id)
curl -s -b $JAR -X PATCH -H "$J" $API/collections/$CID -d '{"title":"Renamed"}' | jq -c .
curl -s -b $JAR -X DELETE $API/exam-sessions/$SID2 -o /dev/null -w '%{http_code}\n'
curl -s -b $JAR -X PATCH -H "$J" $API/collections/$CID -d '{"title":"Renamed"}' | jq -c '{title, activeSessionsCount}'
```
