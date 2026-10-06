export interface Pt {
  x: number;
  y: number;
}

/**
 * Exact geometry of the printed answer sheet, in PDF points with the origin in the TOP-left corner
 * (y grows downwards, like image pixels). The PDF renderer flips y itself.
 */
export interface SheetLayout {
  pageWidthPt: number;
  pageHeightPt: number;
  /** Centres of the four corner markers */
  fiducials: { tl: Pt; tr: Pt; br: Pt; bl: Pt; sizePt: number };
  /** Top-left corner and side length of the QR code */
  qr: { x: number; y: number; sizePt: number };
  /** One row per choice question, in snapshot order; `number` is the question number shown to students */
  rows: Array<{ testId: string; number: number; labelX: number; labelY: number }>;
  bubbles: Array<{ testId: string; optionId: string; label: string; cx: number; cy: number; rPt: number }>;
  /** number / free_text tests, answered on the questions sheet */
  skippedTestIds: string[];
}
