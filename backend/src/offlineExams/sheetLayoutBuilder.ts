import { isChoiceType, type Test } from '../tests/test.js';
import type { SheetLayout } from './sheetLayout.js';

const MM = 72 / 25.4;

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

/** All geometry constants of the answer sheet, in mm */
export const SHEET_GEOMETRY = {
  fiducialSizeMm: 8,
  /** distance from the page edge to the marker centre */
  fiducialInsetMm: 12,
  qrSizeMm: 26,
  qrRightMm: 22,
  qrTopMm: 9,
  rowsTopMm: 50,
  rowsBottomMm: 24,
  columnInsetMm: 20,
  columnGapMm: 10,
  rowHeightMm: 9,
  /** from the column start to the first bubble centre */
  firstBubbleOffsetMm: 13,
  bubbleSpacingMm: 8,
  bubbleRadiusMm: 2.5,
  columns: 2,
} as const;

export const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type LayoutError = 'NO_CHOICE_QUESTIONS' | 'TOO_MANY_QUESTIONS' | 'TOO_MANY_OPTIONS';

/** Pure function: computes where every element of the answer sheet goes */
export function buildLayout(tests: Test[]): SheetLayout | LayoutError {
  const g = SHEET_GEOMETRY;
  const W = A4_WIDTH_PT;
  const H = A4_HEIGHT_PT;
  const inset = g.fiducialInsetMm * MM;

  const choiceTests = tests
    .map((test, index) => ({ test, number: index + 1 }))
    .filter(({ test }) => isChoiceType(test.type));
  if (choiceTests.length === 0) {
    return 'NO_CHOICE_QUESTIONS';
  }

  const rowsTop = g.rowsTopMm * MM;
  const rowsBottom = H - g.rowsBottomMm * MM;
  const rowHeight = g.rowHeightMm * MM;
  const rowsPerColumn = Math.floor((rowsBottom - rowsTop) / rowHeight);
  if (choiceTests.length > rowsPerColumn * g.columns) {
    return 'TOO_MANY_QUESTIONS';
  }

  const columnWidth = (W - 2 * g.columnInsetMm * MM - (g.columns - 1) * g.columnGapMm * MM) / g.columns;
  const maxOptions =
    Math.floor((columnWidth - g.firstBubbleOffsetMm * MM) / (g.bubbleSpacingMm * MM)) + 1;
  if (choiceTests.some(({ test }) => test.options.length > Math.min(maxOptions, OPTION_LABELS.length))) {
    return 'TOO_MANY_OPTIONS';
  }

  const layout: SheetLayout = {
    pageWidthPt: W,
    pageHeightPt: H,
    fiducials: {
      tl: { x: inset, y: inset },
      tr: { x: W - inset, y: inset },
      br: { x: W - inset, y: H - inset },
      bl: { x: inset, y: H - inset },
      sizePt: g.fiducialSizeMm * MM,
    },
    qr: { x: W - (g.qrRightMm + g.qrSizeMm) * MM, y: g.qrTopMm * MM, sizePt: g.qrSizeMm * MM },
    rows: [],
    bubbles: [],
    skippedTestIds: tests.filter((t) => !isChoiceType(t.type)).map((t) => t.id),
  };

  choiceTests.forEach(({ test, number }, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const columnX = g.columnInsetMm * MM + column * (columnWidth + g.columnGapMm * MM);
    const cy = rowsTop + row * rowHeight + rowHeight / 2;

    layout.rows.push({ testId: test.id, number, labelX: columnX, labelY: cy });
    test.options.forEach((option, optionIndex) => {
      layout.bubbles.push({
        testId: test.id,
        optionId: option.id,
        label: OPTION_LABELS[optionIndex] ?? '?',
        cx: columnX + g.firstBubbleOffsetMm * MM + optionIndex * g.bubbleSpacingMm * MM,
        cy,
        rPt: g.bubbleRadiusMm * MM,
      });
    });
  });

  return layout;
}

/** Payload encoded in the sheet's QR code */
export interface SheetQrPayload {
  o: string;
  s: number;
}

export function makeQrPayload(offlineExamId: string): string {
  const payload: SheetQrPayload = { o: offlineExamId, s: 1 };
  return JSON.stringify(payload);
}

export function parseQrPayload(text: string): SheetQrPayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (
      typeof value === 'object' &&
      value !== null &&
      'o' in value &&
      typeof value.o === 'string' &&
      's' in value &&
      typeof value.s === 'number'
    ) {
      return { o: value.o, s: value.s };
    }
  } catch {
    // not our QR code
  }
  return null;
}
