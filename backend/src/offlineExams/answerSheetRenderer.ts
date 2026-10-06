import { PDFDocument, StandardFonts, grayscale, rgb, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import type { SheetLayout } from './sheetLayout.js';

const MM = 72 / 25.4;

/** Standard PDF fonts only cover WinAnsi; drop what they cannot encode instead of crashing */
function encodable(font: PDFFont, text: string): string {
  return [...text]
    .filter((ch) => {
      try {
        font.encodeText(ch);
        return true;
      } catch {
        return false;
      }
    })
    .join('')
    .trim();
}

export interface AnswerSheetInfo {
  title: string;
  qrPayload: string;
}

/** Renders the OMR answer sheet. Layout coordinates are top-left based; PDF ones are bottom-left. */
export async function renderAnswerSheetPdf(layout: SheetLayout, info: AnswerSheetInfo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Answer sheet - ${info.title}`);
  const page = pdf.addPage([layout.pageWidthPt, layout.pageHeightPt]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const H = layout.pageHeightPt;
  const flipY = (y: number) => H - y;
  const black = rgb(0, 0, 0);

  // corner markers: solid black squares
  const { sizePt } = layout.fiducials;
  for (const c of [layout.fiducials.tl, layout.fiducials.tr, layout.fiducials.br, layout.fiducials.bl]) {
    page.drawRectangle({ x: c.x - sizePt / 2, y: flipY(c.y) - sizePt / 2, width: sizePt, height: sizePt, color: black });
  }

  // QR code
  const qrPng = await QRCode.toBuffer(info.qrPayload, { errorCorrectionLevel: 'M', margin: 1, scale: 8 });
  const qrImage = await pdf.embedPng(qrPng);
  page.drawImage(qrImage, {
    x: layout.qr.x,
    y: flipY(layout.qr.y + layout.qr.sizePt),
    width: layout.qr.sizePt,
    height: layout.qr.sizePt,
  });

  // header for humans (not machine-read)
  const left = 22 * MM;
  const title = encodable(bold, info.title);
  if (title) {
    page.drawText(title.length > 60 ? `${title.slice(0, 57)}...` : title, {
      x: left,
      y: flipY(16 * MM),
      size: 13,
      font: bold,
    });
  }
  page.drawText('Name: ______________________________', { x: left, y: flipY(25 * MM), size: 11, font });
  page.drawText('Student ID: _________________', { x: left, y: flipY(33 * MM), size: 11, font });
  page.drawText('Fill the circle completely with a black pen. Do not use ticks or crosses.', {
    x: left,
    y: flipY(42 * MM),
    size: 9,
    font,
    color: grayscale(0.25),
  });

  for (const row of layout.rows) {
    const text = `${row.number}.`;
    page.drawText(text, { x: row.labelX, y: flipY(row.labelY) - 3.5, size: 10, font: bold });
  }

  for (const b of layout.bubbles) {
    page.drawCircle({
      x: b.cx,
      y: flipY(b.cy),
      size: b.rPt,
      borderColor: grayscale(0.55),
      borderWidth: 0.7,
    });
    const labelSize = 6.5;
    const width = font.widthOfTextAtSize(b.label, labelSize);
    page.drawText(b.label, {
      x: b.cx - width / 2,
      y: flipY(b.cy) - labelSize * 0.35,
      size: labelSize,
      font,
      color: grayscale(0.7),
    });
  }

  return pdf.save();
}
