// Shared formatting and business-rule helpers.

export const MONTHLY_FEE = 2500;
export const CASUAL_FEE = 200;
export const DUE_DAY = 10;

/** Vehicle numbers are stored upper-case with no spaces or dashes, e.g. "CAB1234". */
export function normalizeVehicleNo(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Display form: letters and digits split by a dash, e.g. "CAB-1234". */
export function displayVehicleNo(vehicleNo: string): string {
  const m = vehicleNo.match(/^([A-Z]+)(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : vehicleNo;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** "YYYY-MM" for the given date (local time). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "YYYY-MM-DD" for the given date (local time). */
export function dayKey(d: Date = new Date()): string {
  return `${monthKey(d)}-${pad(d.getDate())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function rupees(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-LK')}/=`;
}

export type MonthStatus = 'paid' | 'due' | 'overdue';

/** Paid this month, still within the grace period (on or before the 10th), or overdue. */
export function currentMonthStatus(paidThisMonth: boolean, today: Date = new Date()): MonthStatus {
  if (paidThisMonth) return 'paid';
  return today.getDate() <= DUE_DAY ? 'due' : 'overdue';
}

/** Receipt numbers must be unique across phones, so they carry a random suffix. */
export function newReceiptNo(prefix: 'M' | 'C', randomHex: string): string {
  return `${prefix}${dayKey().replace(/-/g, '')}-${randomHex.slice(0, 6).toUpperCase()}`;
}
