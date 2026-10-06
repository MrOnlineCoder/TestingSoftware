# Offline Exam (OMR) Plan

## 0. Research summary and decision

What the feature actually needs is **OMR** (optical mark recognition: "is this bubble filled?"), not OCR
(reading characters). That distinction decides everything:

| Need | Verdict |
|---|---|
| Detect filled bubbles on a printed sheet we designed ourselves | **Easy, fully local, no ML.** Classic computer vision: find 4 fiducial markers, perspective-correct the page, measure darkness inside each known bubble position. Near-100% on flatbed scans, ~90% on phone photos (numbers reported by the OpenCV-based OMRChecker project). |
| Read a handwritten number (for "single number" questions) | **Decided: not on the blank.** (A digit bubble grid would work, but the product decision is that the blank contains choice bubbles only.) Students write numbers on the questions sheet; the teacher types them into the review table and they are auto-graded from there. |
| Read free-text handwriting | **Not feasible locally with acceptable accuracy** (Tesseract is built for print; handwriting needs large models and still fails on short unconstrained answers). Free-text answers are not auto-checked anyway, and are not on the blank. Teacher grades them manually from paper in the session detail page. |
| Identify which sheet / student | Print a **QR code** with the offline exam id and a sheet id; read it with `jsQR` (pure JS). Student name/ID are typed by the teacher during review (hand-written on the sheet for the human). |

Options evaluated for the OMR engine:

1. **OpenCV compiled to WebAssembly, run inside Node** (`@techstark/opencv-js`, Apache-2.0). Gives thresholding,
   contours, `getPerspectiveTransform`/`warpPerspective`, QR detection. No native build, no Python, works on any OS.
   **Chosen.**
2. OMRChecker (Python + OpenCV, GPLv3) via subprocess. Mature, but drags in a Python runtime and a copyleft licence,
   and its template-JSON approach duplicates what we must generate anyway. Rejected.
3. `sharp` only (libvips) with hand-written marker detection. Possible but you end up re-implementing contour search
   and homography. Use `sharp` only for decoding/resizing input images (PDF scans → convert with `pdf-to-img` or
   reject PDFs and require PNG/JPEG; see open question Q7).
4. Cloud OMR services (Aspose etc.). Rejected: not local, not free.

Cost estimate: ~2–3 days of agent work including sheet generation. Worth keeping as a bonus feature. Nothing in the
core app depends on it, so it is implemented last and can be dropped without impact.

## 1. The printed artefacts

### 1.1 Questions document
HTML rendered by the backend from an `eta` template (`resources/offline-questions.html.eta`): title, instructions,
then each question numbered with its markdown prompt rendered to HTML (`marked`) and, for choice questions, the
options labelled A, B, C… in snapshot order. The page has print CSS; the teacher prints it from the browser
(`window.print()` on a page opened in a new tab). No PDF generation needed.

### 1.2 Answer sheet (PDF, generated with `pdf-lib`, MIT)
A4 portrait, generated server-side so that every bubble's position is known exactly in PDF points and stored as a
**layout JSON** alongside the offline exam. Elements:

- Four **fiducial markers** in the corners: solid black squares (e.g. 10 mm) with an inner white square and a black
  centre dot (asymmetric sizes so orientation is unambiguous, or make the bottom-right marker a different pattern).
- **QR code** (top centre, `qrcode` npm package) encoding `{"o": offlineExamId, "s": sheetVariant}`; `sheetVariant`
  is always `1` in the MVP (one sheet per exam; multiple pages are an open question, Q6).
- Header fields for humans: Name ______, Student ID ______ (plain lines, not read by the machine).
- Instructions line: "Fill the circle completely with a black pen. Do not use ticks or crosses."
- One **row per choice question** (single and multiple choice only; number and free-text questions are skipped,
  the questions document says "answer on this sheet" for them): question number on the left, then one bubble per
  option labelled with the option letter beneath. Almost no other text on the page. Rows are laid out in two
  columns of questions to fit more per page.
- Bubble geometry: 5 mm diameter circles, ≥ 8 mm centre spacing, light-grey outline so a printed outline barely
  contributes to measured darkness.
- If rows do not fit on one page: MVP refuses with a clear error (400 "Too many questions for a single answer sheet";
  exact capacity is computed from the layout). Single page only, no multi-page support.

Layout JSON (persisted, `offline_exams.layout`):
```ts
interface SheetLayout {
  pageWidthPt: number; pageHeightPt: number;
  fiducials: { tl: Pt; tr: Pt; br: Pt; bl: Pt; sizePt: number };   // centres
  qr: { x: number; y: number; sizePt: number };
  bubbles: Array<{ testId: string; optionId: string; cx: number; cy: number; rPt: number }>;
  skippedTestIds: string[];      // number / free_text tests, answered on paper
}
```

## 2. Recognition pipeline (backend, `offlineExams/omr/`)

Input: one image (PNG/JPEG, any resolution, any rotation up to ~180°, phone photo acceptable).

1. **Decode & normalise** with `sharp`: auto-orient from EXIF, convert to greyscale, resize so the long side is
   ~2000 px, get raw pixel buffer → `cv.Mat`.
2. **Find fiducials**: Gaussian blur → adaptive threshold → `findContours`; keep square-ish contours whose size is
   within expected range and that contain a nested contour (the inner white square / dot). Pick the 4 nearest to the
   image corners. Order them tl/tr/br/bl by angle around the centroid; disambiguate 180° rotation via the asymmetric
   marker (or by trying both and keeping the one where the QR decodes).
3. **Homography**: `getPerspectiveTransform` from the 4 detected centres to the 4 layout centres (scaled to a working
   canvas of e.g. 1654×2339 px = A4 at 200 dpi); `warpPerspective` the page onto that canvas.
4. **QR**: crop the QR region from the warped image, run `jsQR` on it. Verify `offlineExamId` matches the URL; else
   400 "This sheet belongs to a different exam".
5. **Measure bubbles**: for every bubble in the layout, compute the mean intensity of the pixels within radius
   `0.8·r` on the warped, Otsu-thresholded image → `fillRatio ∈ [0,1]`. Also sample a ring just outside the bubble as
   local background to compensate uneven lighting.
6. **Decide**:
   - single choice: pick max fillRatio; `filled` if ≥ 0.45 and ≥ 2× the second-highest; otherwise mark the question
     `ambiguous` (`multiple` if two ≥ 0.45, `none` if none).
   - multiple choice: all bubbles with fillRatio ≥ 0.45 are selected; flag `ambiguous` when any bubble is in
     [0.25, 0.45).
   - number / free text: not on the sheet; returned with `status: 'manual'` and `answer: null` so the review table
     shows an empty input for the teacher.
   Thresholds are fixed constants in one file; no sensitivity UI.
7. **Debug overlay**: draw circles on the warped image (green = detected filled, grey = empty, orange = ambiguous)
   and return it as PNG data-URL for the review screen.

Output:
```ts
interface ScanResult {
  offlineExamId: string;
  detections: Array<{
    testId: string;
    answer: StudentAnswer | null;
    confidence: number;            // 0..1, min over the decisive bubbles
    status: 'ok' | 'ambiguous' | 'empty' | 'manual';   // manual = number/free_text, teacher types it in
    raw: Array<{ bubbleIndex: number; fillRatio: number }>;
  }>;
  overlayImage: string;            // data URL (PNG)
}
```

Error cases → 400 with a specific message: "Could not find the 4 corner markers", "QR code unreadable",
"Sheet belongs to another exam".

## 3. Backend work items (in `backend/src/offlineExams/`)

- Table `offline_exams`: id, collection_id, collection_title, tests_snapshot json, layout json, settings json
  (`showScore` only; offline sessions are always `allowNavigation=true, showCorrectAnswer=true` for the results view),
  created_at. No row per scan; scans are stateless (result is returned, not stored).
- `offlineExamsService`: `createOrReuse(collectionId)` (reuse latest if `offlineExam.createdAt > collection.updatedAt`,
  else snapshot + build layout + validate capacity), `get`, `renderQuestionsHtml`,
  `renderAnswerSheetPdf` (cache the PDF bytes on disk under `data/offline/<id>.pdf`), `scan(id, imageBuffer)` →
  delegates to `OmrEngine` interface (`omr/opencvOmrEngine.ts` implements it; keeps OpenCV behind an interface per
  the template's infrastructure rule), `finalize(id, input)` → creates an `ExamSession` with `origin: 'offline'`,
  `status: 'submitted'`, answers graded by the shared grader, free text left for manual grading.
- `sheetLayoutBuilder.ts`: pure function `buildLayout(tests) → SheetLayout | 'TOO_MANY_QUESTIONS'`.
- `answerSheetRenderer.ts`: `SheetLayout → Uint8Array` via `pdf-lib` + `qrcode` (toDataURL → embed PNG).
- Dependencies: `@techstark/opencv-js`, `sharp`, `jsqr`, `qrcode`, `pdf-lib`, `marked`, `eta`, `@fastify/multipart`.
  OpenCV WASM init is async (`await cv.ready` / `onRuntimeInitialized`); do it once lazily in the engine.
- Routes per `api-contract.md` "Offline exams". Multipart limit 20 MB.
- Also create a **fixture generator** script `scripts/omr-selftest.ts`: renders the answer sheet, rasterises it
  (pdf → png via `pdftoppm` if available, else `sharp` cannot read PDF — fall back to drawing the same layout directly
  onto a PNG canvas with `sharp`'s SVG input), synthetically fills a known answer set, rotates/perspective-warps it,
  runs the pipeline and asserts the answers come back. This is the only automated check and it is what makes the
  thresholds trustworthy.

## 4. Frontend work items

- Collection detail → "Offline exam" button → `OfflineExamDialog`: calls `POST /offline-exams` (server reuses the
  latest version if the suite is unchanged; show "Printable version from <date>"), then shows two buttons: "Open questions document" (new tab → `questions.html`,
  user prints) and "Download answer sheet (PDF)". Plus "Scan answer sheets" link → `/teacher/offline/:id/scan`.
- `OfflineScanView`: FileUpload (image), on upload show the overlay image on the left and a table on the right:
  question #, detected answer (editable via `QuestionAnswerInput`), status Tag (ok / ambiguous / empty / manual),
  confidence. Ambiguous rows are highlighted and must be confirmed. Number rows: the teacher types the value from
  the paper (auto-graded on finalize). Free-text rows: optional text, with note "graded manually in session details". Fields student name / ID. "Finalize" → `POST /finalize` → navigate to the new session detail.
  "Scan another" resets the view for the next sheet.

## 5. Scope guard

Implement only after the online flow is complete on both sides. If the fiducial detection proves unreliable on phone
photos, document "use a flatbed scanner or a scanner app that flattens the page" and ship; do not spend time on
ML-based approaches.
