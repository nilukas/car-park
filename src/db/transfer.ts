// Phone-to-phone transfer: export the whole database as a JSON file and merge it on the other phone.
// Merging (rather than replacing) means both phones can collect payments on the same day.

import type { SQLiteDatabase } from 'expo-sqlite';
import { assignMissingCardIds, type CasualParking, type Customer, type Payment } from './database';
import { normalizeVehicleNo } from '../lib/format';

export const EXPORT_FORMAT = 'carpark-backup';
export const EXPORT_VERSION = 2; // v2 added customers.card_id; v1 files are still accepted
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  customers: Customer[];
  payments: Payment[];
  casual_parkings: CasualParking[];
};

export type ImportResult = {
  customersAdded: number;
  customersUpdated: number;
  paymentsAdded: number;
  casualAdded: number;
  skipped: number;
};

export async function buildExport(db: SQLiteDatabase): Promise<ExportFile> {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    customers: await db.getAllAsync<Customer>('SELECT * FROM customers'),
    payments: await db.getAllAsync<Payment>('SELECT * FROM payments'),
    casual_parkings: await db.getAllAsync<CasualParking>('SELECT * FROM casual_parkings'),
  };
}

// ---------- Validation (the file comes from outside the app, so never trust it) ----------

const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const isIso = (v: unknown): v is string => isStr(v, 40) && !Number.isNaN(Date.parse(v));
const isAmount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;
const isVehicle = (v: unknown): v is string => isStr(v, 20) && v.length > 0 && normalizeVehicleNo(v) === v;
const isCardId = (v: unknown): v is string | null => v === null || (isStr(v, 10) && /^[A-Z2-9]{10}$/.test(v));
const isMonth = (v: unknown): v is string => isStr(v, 7) && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

function validCustomer(c: any): c is Customer {
  if (c && c.card_id === undefined) c.card_id = null; // v1 backup
  return c && isVehicle(c.vehicle_no) && isCardId(c.card_id) && isStr(c.name, 100) && c.name.length > 0 && isStr(c.phone, 30)
    && isStr(c.address, 300) && isStr(c.vehicle_type, 30) && isIso(c.registered_at)
    && (c.active === 0 || c.active === 1) && isIso(c.updated_at);
}

function validPayment(p: any): p is Payment {
  return p && isStr(p.id, 64) && isVehicle(p.vehicle_no) && isMonth(p.month) && isAmount(p.amount)
    && isIso(p.paid_at) && isStr(p.receipt_no, 40) && isIso(p.updated_at);
}

function validCasual(c: any): c is CasualParking {
  return c && isStr(c.id, 64) && isVehicle(c.vehicle_no) && isAmount(c.amount)
    && isIso(c.parked_at) && isStr(c.receipt_no, 40);
}

export function parseExport(text: string): ExportFile {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('File is too large.');
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid car park backup file.');
  }
  if (!data || data.format !== EXPORT_FORMAT) throw new Error('This is not a car park backup file.');
  if (data.version !== 1 && data.version !== EXPORT_VERSION) throw new Error(`Unsupported backup version: ${data.version}`);
  if (!Array.isArray(data.customers) || !Array.isArray(data.payments) || !Array.isArray(data.casual_parkings)) {
    throw new Error('Backup file is damaged.');
  }
  return data as ExportFile;
}

/** Merge rules: customers – newest updated_at wins; payments and casual parkings – add if not already present. */
export async function mergeImport(db: SQLiteDatabase, data: ExportFile): Promise<ImportResult> {
  const result: ImportResult = { customersAdded: 0, customersUpdated: 0, paymentsAdded: 0, casualAdded: 0, skipped: 0 };

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const c of data.customers) {
      if (!validCustomer(c)) { result.skipped++; continue; }
      const existing = await txn.getFirstAsync<{ updated_at: string; card_id: string | null }>(
        'SELECT updated_at, card_id FROM customers WHERE vehicle_no = ?', c.vehicle_no,
      );
      // A card ID already used by a different vehicle is never taken over (practically impossible, but keeps UNIQUE safe).
      const clash = c.card_id && await txn.getFirstAsync(
        'SELECT 1 FROM customers WHERE card_id = ? AND vehicle_no <> ?', c.card_id, c.vehicle_no,
      );
      if (!existing) {
        await txn.runAsync(
          `INSERT INTO customers (vehicle_no, card_id, name, phone, address, vehicle_type, registered_at, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          c.vehicle_no, clash ? null : c.card_id, c.name, c.phone, c.address, c.vehicle_type, c.registered_at, c.active, c.updated_at,
        );
        result.customersAdded++;
      } else if (Date.parse(c.updated_at) > Date.parse(existing.updated_at)) {
        // Newer record wins, including a reissued card; an old (v1) backup never removes a card.
        const cardId = c.card_id && !clash ? c.card_id : existing.card_id;
        await txn.runAsync(
          `UPDATE customers SET card_id = ?, name = ?, phone = ?, address = ?, vehicle_type = ?, active = ?, updated_at = ?
            WHERE vehicle_no = ?`,
          cardId, c.name, c.phone, c.address, c.vehicle_type, c.active, c.updated_at, c.vehicle_no,
        );
        result.customersUpdated++;
      }
    }
    await assignMissingCardIds(txn);

    for (const p of data.payments) {
      if (!validPayment(p)) { result.skipped++; continue; }
      // UNIQUE(vehicle_no, month) means a month paid on both phones is only stored once.
      const r = await txn.runAsync(
        `INSERT OR IGNORE INTO payments (id, vehicle_no, month, amount, paid_at, receipt_no, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM customers WHERE vehicle_no = ?)`,
        p.id, p.vehicle_no, p.month, p.amount, p.paid_at, p.receipt_no, p.updated_at, p.vehicle_no,
      );
      if (r.changes > 0) result.paymentsAdded++;
    }

    for (const c of data.casual_parkings) {
      if (!validCasual(c)) { result.skipped++; continue; }
      const r = await txn.runAsync(
        'INSERT OR IGNORE INTO casual_parkings (id, vehicle_no, amount, parked_at, receipt_no) VALUES (?, ?, ?, ?, ?)',
        c.id, c.vehicle_no, c.amount, c.parked_at, c.receipt_no,
      );
      if (r.changes > 0) result.casualAdded++;
    }
  });

  return result;
}
