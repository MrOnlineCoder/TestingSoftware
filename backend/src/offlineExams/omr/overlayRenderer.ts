import sharp from 'sharp';
import type { SheetLayout } from '../sheetLayout.js';
import { bubbleState, type BubbleState } from './omrDecision.js';

const COLORS: Record<BubbleState, string> = {
  filled: '#16a34a',
  empty: '#9ca3af',
  ambiguous: '#f97316',
};

const OVERLAY_WIDTH = 1000;

/** Draws the detection result on top of the warped page, returns a PNG data URL */
export async function renderOverlay(
  warpedPng: Buffer,
  pxPerPt: number,
  layout: SheetLayout,
  fills: number[],
): Promise<string> {
  const width = Math.round(layout.pageWidthPt * pxPerPt);
  const height = Math.round(layout.pageHeightPt * pxPerPt);
  const circles = layout.bubbles
    .map((b, i) => {
      const state = bubbleState(fills[i] ?? 0);
      const r = b.rPt * pxPerPt * 1.25;
      return `<circle cx="${b.cx * pxPerPt}" cy="${b.cy * pxPerPt}" r="${r}" fill="none" stroke="${COLORS[state]}" stroke-width="${state === 'empty' ? 2 : 5}"/>`;
    })
    .join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${circles}</svg>`);

  const png = await sharp(warpedPng)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer();
  const resized = await sharp(png).resize({ width: OVERLAY_WIDTH }).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${resized.toString('base64')}`;
}
