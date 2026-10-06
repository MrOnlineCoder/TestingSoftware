import cvModule from '@techstark/opencv-js';
import jsQRModule from 'jsqr';
import sharp from 'sharp';
import { AppError, ErrorCode } from '../../errors.js';
import type { Pt, SheetLayout } from '../sheetLayout.js';
import type { OmrEngine, OmrMeasurement } from './omrEngine.js';
import { renderOverlay } from './overlayRenderer.js';

// jsqr is a CommonJS bundle typed with `export default`: from ESM the function is at `.default`
const jsQR = jsQRModule.default;

type CV = typeof cvModule;
type Mat = InstanceType<CV['Mat']>;

/** Working resolution of the perspective-corrected page: A4 at 200 dpi */
const PX_PER_PT = 200 / 72;
/** Input images are scaled so that the long side has this many pixels */
const INPUT_LONG_SIDE = 2000;

interface MarkerCandidate {
  center: Pt;
  side: number;
}

let cvPromise: Promise<{ cv: CV }> | null = null;

/**
 * OpenCV WASM initialisation is async and expensive; do it once, lazily.
 * The Emscripten module is itself a thenable, so it must be wrapped in an object: resolving a promise
 * with the module directly would make the promise adopt the module's `then` and never settle.
 */
export function loadOpenCv(): Promise<{ cv: CV }> {
  cvPromise ??= new Promise<{ cv: CV }>((resolve) => {
    const mod = cvModule as CV & { then?: (callback: (ready: CV) => void) => void };
    if (mod.Mat) {
      resolve({ cv: mod });
    } else if (typeof mod.then === 'function') {
      mod.then((ready) => resolve({ cv: ready }));
    } else {
      mod.onRuntimeInitialized = () => resolve({ cv: mod });
    }
  });
  return cvPromise;
}

function fail(message: string): never {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
}

/** Shoelace area of a polygon given in order */
function polygonArea(points: Pt[]): number {
  let sum = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  });
  return Math.abs(sum) / 2;
}

/** Orders points clockwise (in image coordinates, y down) around their centroid */
function orderClockwise(points: Pt[]): Pt[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

/** Picks the 4 candidates spanning the largest quadrilateral, with similar marker sizes */
function pickCorners(candidates: MarkerCandidate[]): Pt[] | null {
  const pool = [...candidates].sort((a, b) => b.side - a.side).slice(0, 14);
  let best: Pt[] | null = null;
  let bestArea = 0;
  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      for (let c = b + 1; c < pool.length; c++) {
        for (let d = c + 1; d < pool.length; d++) {
          const group = [pool[a]!, pool[b]!, pool[c]!, pool[d]!];
          const sides = group.map((g) => g.side);
          if (Math.max(...sides) / Math.min(...sides) > 1.8) {
            continue;
          }
          const ordered = orderClockwise(group.map((g) => g.center));
          const area = polygonArea(ordered);
          if (area > bestArea) {
            bestArea = area;
            best = ordered;
          }
        }
      }
    }
  }
  return best;
}

export class OpenCvOmrEngine implements OmrEngine {
  async renderOverlay(measurement: OmrMeasurement, layout: SheetLayout): Promise<string> {
    return renderOverlay(measurement.warpedPng, measurement.pxPerPt, layout, measurement.fills);
  }

  async measure(image: Buffer, layout: SheetLayout): Promise<OmrMeasurement> {
    const { cv } = await loadOpenCv();

    const { data, info } = await sharp(image)
      .rotate() // honour EXIF orientation of phone photos
      .flatten({ background: '#ffffff' })
      .resize({ width: INPUT_LONG_SIDE, height: INPUT_LONG_SIDE, fit: 'inside' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true })
      .catch(() => fail('Could not read the image; upload a PNG or JPEG file'));

    const mats: Mat[] = [];
    const track = <T extends Mat>(m: T): T => {
      mats.push(m);
      return m;
    };

    try {
      const src = track(new cv.Mat(info.height, info.width, cv.CV_8UC1));
      src.data.set(data.subarray(0, info.width * info.height));

      const corners = this.findFiducials(cv, src, track);
      if (!corners) {
        fail('Could not find the 4 corner markers. Make sure the whole sheet is visible and well lit.');
      }

      const width = Math.round(layout.pageWidthPt * PX_PER_PT);
      const height = Math.round(layout.pageHeightPt * PX_PER_PT);
      const f = layout.fiducials;
      const target = [f.tl, f.tr, f.br, f.bl].flatMap((p) => [p.x * PX_PER_PT, p.y * PX_PER_PT]);
      const dstPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, target));

      // The 4 markers look the same, so the page rotation is unknown; the QR code is off-centre,
      // so only the correct assignment of corners puts it where the layout says it is.
      for (let rotation = 0; rotation < 4; rotation++) {
        const rotated = [0, 1, 2, 3].map((i) => corners[(i + rotation) % 4]!);
        const srcPts = track(cv.matFromArray(4, 1, cv.CV_32FC2, rotated.flatMap((p) => [p.x, p.y])));
        const transform = track(cv.getPerspectiveTransform(srcPts, dstPts));
        const warped = track(new cv.Mat());
        cv.warpPerspective(
          src,
          warped,
          transform,
          new cv.Size(width, height),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar(255),
        );

        const qrText = this.readQr(warped, layout);
        if (qrText === null) {
          continue;
        }

        const fills = this.measureBubbles(cv, warped, layout, track);
        const warpedPng = await sharp(Buffer.from(warped.data), { raw: { width, height, channels: 1 } })
          .png()
          .toBuffer();
        return { qrText, fills, warpedPng, pxPerPt: PX_PER_PT };
      }

      return fail('QR code unreadable. Make sure the sheet is not folded or covered and scan it again.');
    } finally {
      for (const m of mats) {
        m.delete();
      }
    }
  }

  private findFiducials(cv: CV, src: Mat, track: <T extends Mat>(m: T) => T): Pt[] | null {
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 0);
    const binary = track(new cv.Mat());
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);

    const contours = new cv.MatVector();
    const hierarchy = track(new cv.Mat());
    // RETR_LIST, not EXTERNAL: on a photo a dark desk around the page would otherwise hide every marker
    cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const longSide = Math.max(src.cols, src.rows);
    const candidates: MarkerCandidate[] = [];
    try {
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        try {
          const rect = cv.boundingRect(contour);
          const side = (rect.width + rect.height) / 2;
          if (side < longSide * 0.008 || side > longSide * 0.08) {
            continue;
          }
          const aspect = rect.width / rect.height;
          if (aspect < 0.6 || aspect > 1.6) {
            continue;
          }
          const area = cv.contourArea(contour);
          // squares fill their bounding box (rotated ones less so); circles stay near pi/4
          if (area / (rect.width * rect.height) < 0.5) {
            continue;
          }
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.06 * cv.arcLength(contour, true), true);
          const vertices = approx.rows;
          approx.delete();
          if (vertices !== 4) {
            continue;
          }
          // solid: QR finder patterns (rings) and outlined boxes have a much lower ink ratio
          const roi = binary.roi(rect);
          const ink = cv.countNonZero(roi) / area;
          roi.delete();
          if (ink < 0.85) {
            continue;
          }
          const m = cv.moments(contour);
          if (m.m00 === 0) {
            continue;
          }
          candidates.push({ center: { x: m.m10 / m.m00, y: m.m01 / m.m00 }, side });
        } finally {
          contour.delete();
        }
      }
    } finally {
      contours.delete();
    }

    return candidates.length >= 4 ? pickCorners(candidates) : null;
  }

  private readQr(warped: Mat, layout: SheetLayout): string | null {
    const margin = layout.qr.sizePt * 0.25;
    const x0 = Math.max(0, Math.floor((layout.qr.x - margin) * PX_PER_PT));
    const y0 = Math.max(0, Math.floor((layout.qr.y - margin) * PX_PER_PT));
    const x1 = Math.min(warped.cols, Math.ceil((layout.qr.x + layout.qr.sizePt + margin) * PX_PER_PT));
    const y1 = Math.min(warped.rows, Math.ceil((layout.qr.y + layout.qr.sizePt + margin) * PX_PER_PT));
    const w = x1 - x0;
    const h = y1 - y0;

    const rgba = new Uint8ClampedArray(w * h * 4);
    const grey = warped.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = grey[(y0 + y) * warped.cols + (x0 + x)]!;
        const o = (y * w + x) * 4;
        rgba[o] = v;
        rgba[o + 1] = v;
        rgba[o + 2] = v;
        rgba[o + 3] = 255;
      }
    }
    const result = jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
    if (!result) {
      return null;
    }
    // reject a QR that only decodes because the page is upside down / sideways
    const { topLeftFinderPattern: tl, topRightFinderPattern: tr } = result.location;
    return tl.x < tr.x && Math.abs(tl.y - tr.y) < h * 0.25 ? result.data : null;
  }

  private measureBubbles(cv: CV, warped: Mat, layout: SheetLayout, track: <T extends Mat>(m: T) => T): number[] {
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(warped, blurred, new cv.Size(3, 3), 0);
    const binary = track(new cv.Mat());
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const px = binary.data;
    const cols = binary.cols;
    const rows = binary.rows;

    // ratio of dark pixels between radii [inner, outer] around (cx, cy)
    const darkRatio = (cx: number, cy: number, inner: number, outer: number) => {
      let dark = 0;
      let total = 0;
      const r = Math.ceil(outer);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < inner || d > outer) {
            continue;
          }
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x < 0 || y < 0 || x >= cols || y >= rows) {
            continue;
          }
          total++;
          if (px[y * cols + x]! > 0) {
            dark++;
          }
        }
      }
      return total === 0 ? 0 : dark / total;
    };

    return layout.bubbles.map((b) => {
      const cx = b.cx * PX_PER_PT;
      const cy = b.cy * PX_PER_PT;
      const r = b.rPt * PX_PER_PT;
      const inside = darkRatio(cx, cy, 0, r * 0.8);
      // a ring just outside the bubble as local background (shadows, uneven lighting)
      const background = darkRatio(cx, cy, r * 1.4, r * 1.75);
      return background >= 1 ? 0 : Math.max(0, (inside - background) / (1 - background));
    });
  }
}
