import html2canvas from 'html2canvas';

import { APP_NAME } from './brand';
export const STICKER_PREVIEW_WIDTH_PX = 300;

/** Print size: 3×4 inches at 300 DPI. */
export const STICKER_PRINT_WIDTH_IN = 3;
export const STICKER_PRINT_HEIGHT_IN = 4;
export const STICKER_PRINT_DPI = 300;
export const STICKER_PRINT_WIDTH_PX = STICKER_PRINT_WIDTH_IN * STICKER_PRINT_DPI;
export const STICKER_PRINT_HEIGHT_PX = STICKER_PRINT_HEIGHT_IN * STICKER_PRINT_DPI;
export const STICKER_PREVIEW_HEIGHT_PX = Math.round(STICKER_PREVIEW_WIDTH_PX * (4 / 3));

/** html2canvas scale to match 300 DPI from preview width. */
export const STICKER_EXPORT_SCALE = STICKER_PRINT_WIDTH_PX / STICKER_PREVIEW_WIDTH_PX;

export async function captureStickerForPrint(element: HTMLElement) {
  return html2canvas(element, {
    scale: STICKER_EXPORT_SCALE,
    backgroundColor: null,
    useCORS: true,
    width: STICKER_PREVIEW_WIDTH_PX,
    height: STICKER_PREVIEW_HEIGHT_PX,
    windowWidth: STICKER_PREVIEW_WIDTH_PX,
    windowHeight: STICKER_PREVIEW_HEIGHT_PX,
  });
}

export function downloadStickerPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function createStickerPdf(
  canvas: HTMLCanvasElement,
  vehicleName: string,
  vehicleNumber: string,
  filename: string
) {
  const { jsPDF } = await import('jspdf');
  const widthMm = STICKER_PRINT_WIDTH_IN * 25.4;
  const heightMm = STICKER_PRINT_HEIGHT_IN * 25.4;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm + 20, heightMm + 50],
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const stickerX = (pageW - widthMm) / 2;
  const stickerY = 18;

  pdf.setFontSize(11);
  pdf.setTextColor(100);
  pdf.text(`${APP_NAME} Vehicle Sticker`, pageW / 2, 10, { align: 'center' });
  pdf.setFontSize(9);
  pdf.text(`${vehicleName} · ${vehicleNumber}`, pageW / 2, 14, { align: 'center' });

  const img = canvas.toDataURL('image/png');
  pdf.addImage(img, 'PNG', stickerX, stickerY, widthMm, heightMm);

  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text(
    `Print at 100% scale — ${STICKER_PRINT_WIDTH_IN}"×${STICKER_PRINT_HEIGHT_IN}" (${STICKER_PRINT_DPI} DPI)`,
    pageW / 2,
    stickerY + heightMm + 8,
    { align: 'center' }
  );
  pdf.text('Cut along edges and place on your vehicle.', pageW / 2, stickerY + heightMm + 13, {
    align: 'center',
  });

  pdf.save(filename);
}
