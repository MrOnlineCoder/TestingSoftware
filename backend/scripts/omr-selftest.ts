/*
  OMR self-test: renders the real answer sheet, rasterises it, fills a known set of answers,
  distorts the image (rotation, upside down, perspective, uneven lighting) and checks that the
  recognition pipeline gives the answers back. Run with `npm run omr:selftest`.

  Rasterisation uses `pdftoppm` (poppler) if installed, otherwise draws the same layout as SVG.
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { renderAnswerSheetPdf } from '../src/offlineExams/answerSheetRenderer.js';
import { decideAnswers, type Detection } from '../src/offlineExams/omr/omrDecision.js';
import { loadOpenCv, OpenCvOmrEngine } from '../src/offlineExams/omr/opencvOmrEngine.js';
import type { SheetLayout } from '../src/offlineExams/sheetLayout.js';
import { buildLayout, makeQrPayload } from '../src/offlineExams/sheetLayoutBuilder.js';
import type { QuestionType, StudentAnswer, Test } from '../src/tests/test.js';
import { makeEntityId } from '../src/utils/id.js';

const DPI = 150;
const PX_PER_PT = DPI / 72;

function makeTest(type: QuestionType, position: number, optionCount: number, correct: number[]): Test {
  const options = Array.from({ length: optionCount }, (_, i) => ({ id: makeEntityId(), text: `Option ${i + 1}` }));
  const correctAnswer: Test['correctAnswer'] =
    type === 'single_choice'
      ? { type, optionId: options[correct[0] ?? 0]!.id }
      : type === 'multiple_choice'
        ? { type, optionIds: correct.map((i) => options[i]!.id) }
        : type === 'number'
          ? { type, value: 42 }
          : { type: 'free_text', referenceAnswer: '' };
  return {
    id: makeEntityId(),
    collectionId: 'selftest',
    position,
    type,
    prompt: `Question ${position + 1}`,
    explanation: '',
    score: 1,
    options: type === 'single_choice' || type === 'multiple_choice' ? options : [],
    correctAnswer,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function hasPdftoppm(): boolean {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function rasterise(layout: SheetLayout, pdf: Uint8Array, qrPayload: string): Promise<Buffer> {
  if (hasPdftoppm()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omr-selftest-'));
    const pdfPath = path.join(dir, 'sheet.pdf');
    fs.writeFileSync(pdfPath, pdf);
    execFileSync('pdftoppm', ['-r', String(DPI), '-png', '-singlefile', pdfPath, path.join(dir, 'sheet')]);
    const png = fs.readFileSync(path.join(dir, 'sheet.png'));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('rasterised with pdftoppm');
    return png;
  }

  console.log('pdftoppm not found, drawing the layout as SVG');
  const s = PX_PER_PT;
  const f = layout.fiducials;
  const markers = [f.tl, f.tr, f.br, f.bl]
    .map((c) => `<rect x="${(c.x - f.sizePt / 2) * s}" y="${(c.y - f.sizePt / 2) * s}" width="${f.sizePt * s}" height="${f.sizePt * s}" fill="#000"/>`)
    .join('');
  const bubbles = layout.bubbles
    .map((b) => `<circle cx="${b.cx * s}" cy="${b.cy * s}" r="${b.rPt * s}" fill="none" stroke="#8c8c8c" stroke-width="1.5"/>`)
    .join('');
  const width = Math.round(layout.pageWidthPt * s);
  const height = Math.round(layout.pageHeightPt * s);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${markers}${bubbles}</svg>`;
  const qrSize = Math.round(layout.qr.sizePt * s);
  const qr = await QRCode.toBuffer(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: qrSize });
  return sharp(Buffer.from(svg))
    .composite([{ input: qr, left: Math.round(layout.qr.x * s), top: Math.round(layout.qr.y * s) }])
    .png()
    .toBuffer();
}

/** Marks: 'full' = properly filled bubble, 'dot' = small mark that must come out as ambiguous */
async function fill(page: Buffer, layout: SheetLayout, marks: Map<string, 'full' | 'dot'>): Promise<Buffer> {
  const meta = await sharp(page).metadata();
  const circles = layout.bubbles
    .map((b) => {
      const mark = marks.get(b.optionId);
      if (!mark) {
        return '';
      }
      // pen strokes are never perfectly centred
      const jx = (Math.random() - 0.5) * b.rPt * 0.3;
      const jy = (Math.random() - 0.5) * b.rPt * 0.3;
      const r = mark === 'full' ? b.rPt * 0.95 : b.rPt * 0.5;
      return `<circle cx="${(b.cx + jx) * PX_PER_PT}" cy="${(b.cy + jy) * PX_PER_PT}" r="${r * PX_PER_PT}" fill="#141414"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${circles}</svg>`;
  return sharp(page).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

/** Simulates a phone photo: page on a grey desk, perspective tilt, lighting gradient */
async function perspectivePhoto(page: Buffer): Promise<Buffer> {
  const { cv } = await loadOpenCv();
  const { data, info } = await sharp(page).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const src = new cv.Mat(info.height, info.width, cv.CV_8UC1);
  src.data.set(data.subarray(0, info.width * info.height));
  const W = Math.round(info.width * 1.3);
  const H = Math.round(info.height * 1.2);
  const w = info.width;
  const h = info.height;
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [W * 0.12, H * 0.06, W * 0.86, H * 0.1, W * 0.93, H * 0.95, W * 0.06, H * 0.9]);
  const m = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  cv.warpPerspective(src, out, m, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(120));
  const buf = Buffer.from(out.data);
  // lighting gradient: darker towards the right
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      buf[i] = Math.max(0, Math.round(buf[i]! * (1 - 0.25 * (x / W))));
    }
  }
  [src, from, to, m, out].forEach((mat) => mat.delete());
  return sharp(buf, { raw: { width: W, height: H, channels: 1 } }).jpeg({ quality: 85 }).toBuffer();
}

function answersEqual(a: StudentAnswer | null, b: StudentAnswer | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  // 40 choice questions with 2..6 options, plus number / free-text questions that are skipped on the sheet
  const tests: Test[] = [];
  for (let i = 0; i < 44; i++) {
    if (i % 11 === 5) {
      tests.push(makeTest(i % 2 === 0 ? 'number' : 'free_text', i, 0, []));
    } else {
      tests.push(makeTest(i % 3 === 0 ? 'multiple_choice' : 'single_choice', i, 2 + (i % 5), [0]));
    }
  }

  const layout = buildLayout(tests);
  if (typeof layout === 'string') {
    throw new Error(`layout failed: ${layout}`);
  }
  const offlineExamId = makeEntityId();
  const qrPayload = makeQrPayload(offlineExamId);
  const pdf = await renderAnswerSheetPdf(layout, { title: 'OMR self-test', qrPayload });
  const blank = await rasterise(layout, pdf, qrPayload);

  // expected answers: random fills, a few left empty, one half-filled "dot" for an ambiguous case
  const marks = new Map<string, 'full' | 'dot'>();
  const expected = new Map<string, { answer: StudentAnswer | null; status: Detection['status'] }>();
  let dotPlaced = false;
  tests.forEach((test, i) => {
    if (test.type === 'single_choice') {
      if (i % 7 === 3) {
        expected.set(test.id, { answer: null, status: 'empty' });
        return;
      }
      if (!dotPlaced && i > 10) {
        dotPlaced = true;
        marks.set(test.options[1]!.id, 'dot');
        expected.set(test.id, { answer: { type: 'single_choice', optionId: test.options[1]!.id }, status: 'ambiguous' });
        return;
      }
      const option = test.options[(i * 7) % test.options.length]!;
      marks.set(option.id, 'full');
      expected.set(test.id, { answer: { type: 'single_choice', optionId: option.id }, status: 'ok' });
    } else if (test.type === 'multiple_choice') {
      const chosen = test.options.filter((_, k) => (k + i) % 2 === 0).map((o) => o.id);
      chosen.forEach((id) => marks.set(id, 'full'));
      expected.set(test.id, { answer: { type: 'multiple_choice', optionIds: chosen }, status: 'ok' });
    } else {
      expected.set(test.id, { answer: null, status: 'manual' });
    }
  });

  const filled = await fill(blank, layout, marks);
  const variants: Array<[string, Buffer]> = [
    ['straight', filled],
    ['rotated 2.5°', await sharp(filled).rotate(2.5, { background: '#ffffff' }).png().toBuffer()],
    ['upside down + 1°', await sharp(filled).rotate(181, { background: '#ffffff' }).png().toBuffer()],
    ['sideways (90°)', await sharp(filled).rotate(90).png().toBuffer()],
    ['phone photo (perspective, lighting, jpeg)', await perspectivePhoto(filled)],
  ];

  const engine = new OpenCvOmrEngine();
  const outDir = path.resolve(import.meta.dirname, '..', 'data', 'omr-selftest');
  fs.mkdirSync(outDir, { recursive: true });
  let failures = 0;

  for (const [name, image] of variants) {
    const started = Date.now();
    try {
      const measurement = await engine.measure(image, layout);
      const detections = decideAnswers(tests, layout, measurement.fills);
      const wrong = detections.filter((d) => {
        const exp = expected.get(d.testId)!;
        return exp.status !== d.status || !answersEqual(exp.answer, d.answer);
      });
      const qrOk = measurement.qrText === qrPayload;
      const ok = wrong.length === 0 && qrOk;
      if (!ok) {
        failures++;
      }
      const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      fs.writeFileSync(path.join(outDir, `${slug}-input.png`), await sharp(image).png().toBuffer());
      const overlay = await engine.renderOverlay(measurement, layout);
      fs.writeFileSync(path.join(outDir, `${slug}-overlay.png`), Buffer.from(overlay.split(',')[1]!, 'base64'));
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${Date.now() - started} ms, qr ${qrOk ? 'ok' : 'WRONG'})`);
      for (const d of wrong) {
        const exp = expected.get(d.testId)!;
        console.log(`   test #${tests.findIndex((t) => t.id === d.testId) + 1}: expected ${exp.status} ${JSON.stringify(exp.answer)}`);
        console.log(`                got ${d.status} ${JSON.stringify(d.answer)} fills=${JSON.stringify(d.raw.map((r) => r.fillRatio))}`);
      }
    } catch (error) {
      failures++;
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nImages written to ${outDir}`);
  if (failures > 0) {
    console.log(`${failures} variant(s) failed`);
    process.exit(1);
  }
  console.log('All variants passed');
}

void main();
