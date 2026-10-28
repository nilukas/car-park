import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { displayVehicleNo, formatDateTime, monthLabel, rupees } from './format';

export const PARK_NAME = 'Car Park';

export type ReceiptData = {
  receiptNo: string;
  vehicleNo: string;
  amount: number;
  issuedAt: string;
  description: string;
};

export function casualReceipt(r: { receipt_no: string; vehicle_no: string; amount: number; parked_at: string }): ReceiptData {
  return { receiptNo: r.receipt_no, vehicleNo: r.vehicle_no, amount: r.amount, issuedAt: r.parked_at, description: 'Parking fee (one time)' };
}

export function monthlyReceipt(p: { receipt_no: string; vehicle_no: string; amount: number; paid_at: string; month: string }): ReceiptData {
  return { receiptNo: p.receipt_no, vehicleNo: p.vehicle_no, amount: p.amount, issuedAt: p.paid_at, description: `Monthly fee – ${monthLabel(p.month)}` };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

// Sized for a 58 mm thermal printer roll, also readable when shared as a PDF.
function receiptHtml(r: ReceiptData): string {
  const row = (k: string, v: string) => `<tr><td>${k}</td><td style="text-align:right">${escapeHtml(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: monospace; font-size: 12px; margin: 8px; }
      h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
      p { text-align: center; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td { padding: 2px 0; }
      .total td { border-top: 1px dashed #000; font-weight: bold; font-size: 14px; padding-top: 6px; }
    </style></head><body>
      <h1>${escapeHtml(PARK_NAME)}</h1>
      <p>PAYMENT RECEIPT</p>
      <table>
        ${row('Receipt No', r.receiptNo)}
        ${row('Date', formatDateTime(r.issuedAt))}
        ${row('Vehicle', displayVehicleNo(r.vehicleNo))}
        ${row('For', r.description)}
        <tr class="total"><td>Amount</td><td style="text-align:right">${escapeHtml(rupees(r.amount))}</td></tr>
      </table>
      <p style="margin-top:12px">Thank you!</p>
    </body></html>`;
}

/** Opens Android's print dialog (works with Wi-Fi/Bluetooth printers that have a print service). */
export async function printReceipt(r: ReceiptData): Promise<void> {
  await Print.printAsync({ html: receiptHtml(r) });
}

/** Creates a PDF and opens the share sheet (WhatsApp, SMS, email…). */
export async function shareReceipt(r: ReceiptData): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: receiptHtml(r), width: 220, height: 320 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${r.receiptNo}` });
}
