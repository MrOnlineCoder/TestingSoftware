import type { SheetLayout } from '../sheetLayout.js';

export interface OmrMeasurement {
  /** Decoded QR text, or null if it could not be read */
  qrText: string;
  /** Fill ratio in [0, 1] per `layout.bubbles` entry (same order) */
  fills: number[];
  /** The perspective-corrected page as greyscale PNG, at `pxPerPt` pixels per layout point */
  warpedPng: Buffer;
  pxPerPt: number;
}

/**
 * Infrastructure boundary for the computer-vision part of the offline exams.
 * Throws AppError(VALIDATION_ERROR) with a human-readable message when the sheet cannot be read.
 */
export interface OmrEngine {
  measure(image: Buffer, layout: SheetLayout): Promise<OmrMeasurement>;
  /** Debug image for the review screen (bubbles coloured by detected state), as PNG data URL */
  renderOverlay(measurement: OmrMeasurement, layout: SheetLayout): Promise<string>;
}
