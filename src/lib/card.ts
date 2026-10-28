// Windscreen card for registered customers: a big QR code with the plate number underneath.
// The QR holds only "CP1:<card id>" – no name or phone – because anyone outside the car can scan it.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { create } from 'qrcode';
import { CARD_QR_PREFIX } from '../db/database';
import { displayVehicleNo } from './format';
import { PARK_NAME, escapeHtml } from './receipt';

// A6 portrait in points (105 × 148 mm) – fits behind a windscreen and on most printers.
const PAGE_WIDTH = 298;
const PAGE_HEIGHT = 420;

/** QR code as an SVG string; one unit per module plus a 4-module quiet zone. */
export function qrSvg(text: string, sizePx: number): string {
  const qr = create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 4;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const total = n + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function cardHtml(vehicleNo: string, cardId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { margin: 0; }
      body { font-family: Arial, sans-serif; margin: 0; text-align: center; }
      .card { margin: 14px; border: 3px solid #1565C0; border-radius: 14px; padding: 12px 8px; }
      h1 { font-size: 20px; margin: 0; color: #1565C0; }
      .sub { font-size: 13px; margin: 2px 0 8px; letter-spacing: 1px; }
      .plate { font-size: 40px; font-weight: bold; letter-spacing: 2px; margin-top: 6px; }
      .id { font-family: monospace; font-size: 11px; color: #555; }
    </style></head><body><div class="card">
      <h1>${escapeHtml(PARK_NAME)}</h1>
      <div class="sub">MONTHLY PARKING</div>
      ${qrSvg(CARD_QR_PREFIX + cardId, 210)}
      <div class="plate">${escapeHtml(displayVehicleNo(vehicleNo))}</div>
      <div class="id">Card ${escapeHtml(cardId)}</div>
    </div></body></html>`;
}

/** Opens Android's print dialog for the card. */
export async function printCard(vehicleNo: string, cardId: string): Promise<void> {
  await Print.printAsync({ html: cardHtml(vehicleNo, cardId), width: PAGE_WIDTH, height: PAGE_HEIGHT });
}

/** Saves the card as a PDF and opens the share sheet (e.g. to print at a shop). */
export async function shareCard(vehicleNo: string, cardId: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: cardHtml(vehicleNo, cardId), width: PAGE_WIDTH, height: PAGE_HEIGHT });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Parking card ${displayVehicleNo(vehicleNo)}` });
}
