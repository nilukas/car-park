import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CASUAL_FEE, dayKey, monthKey, newReceiptNo, normalizeVehicleNo } from '../lib/format';

export const DB_NAME = 'carpark.db';
const SCHEMA_VERSION = 2;

/** QR cards hold only this prefix plus a random card ID, never personal data. */
export const CARD_QR_PREFIX = 'CP1:';
const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, so it can be read out by hand

export type Customer = {
  vehicle_no: string;
  card_id: string | null;
  name: string;
  phone: string;
  address: string;
  vehicle_type: string;
  registered_at: string;
  active: number; // 1 = active, 0 = deactivated (kept for history)
  updated_at: string;
};

export type Payment = {
  id: string;
  vehicle_no: string;
  month: string; // YYYY-MM
  amount: number;
  paid_at: string;
  receipt_no: string;
  updated_at: string;
};

export type CasualParking = {
  id: string;
  vehicle_no: string;
  amount: number;
  parked_at: string;
  receipt_no: string;
};

/** 10 random characters from a 32-letter alphabet (50 bits). */
export function newCardId(): string {
  return Array.from(Crypto.getRandomBytes(10), (b) => CARD_ALPHABET[b % 32]).join('');
}

/** Returns the card ID if the scanned text is one of our cards, otherwise null. */
export function parseCardQr(text: string): string | null {
  const m = text.trim().match(/^CP1:([A-Z2-9]{10})$/);
  return m ? m[1] : null;
}

/** Called once by SQLiteProvider when the database is opened. */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await migrateV1(db);
    await db.execAsync('PRAGMA user_version = 1');
  }
  if (version < 2) {
    // One transaction, so a crash half-way never leaves the column added but the version unchanged.
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE customers ADD COLUMN card_id TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_card_id ON customers(card_id);
      `);
      await assignMissingCardIds(txn);
      await txn.execAsync('PRAGMA user_version = 2');
    });
  }
}

/** Gives a card ID to every customer without one (after upgrade, or after importing an old backup). */
export async function assignMissingCardIds(db: Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync'>): Promise<void> {
  const rows = await db.getAllAsync<{ vehicle_no: string }>('SELECT vehicle_no FROM customers WHERE card_id IS NULL');
  for (const r of rows) {
    await db.runAsync('UPDATE customers SET card_id = ? WHERE vehicle_no = ?', newCardId(), r.vehicle_no);
  }
}

async function migrateV1(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS customers (
      vehicle_no    TEXT PRIMARY KEY NOT NULL,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL DEFAULT '',
      address       TEXT NOT NULL DEFAULT '',
      vehicle_type  TEXT NOT NULL DEFAULT '',
      registered_at TEXT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      updated_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id          TEXT PRIMARY KEY NOT NULL,
      vehicle_no  TEXT NOT NULL REFERENCES customers(vehicle_no),
      month       TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      paid_at     TEXT NOT NULL,
      receipt_no  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      UNIQUE (vehicle_no, month)
    );
    CREATE TABLE IF NOT EXISTS casual_parkings (
      id          TEXT PRIMARY KEY NOT NULL,
      vehicle_no  TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      parked_at   TEXT NOT NULL,
      receipt_no  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_casual_parked_at ON casual_parkings(parked_at);
  `);
}

// ---------- Customers ----------

export function getCustomer(db: SQLiteDatabase, vehicleNo: string) {
  return db.getFirstAsync<Customer>('SELECT * FROM customers WHERE vehicle_no = ?', vehicleNo);
}

export function getCustomerByCard(db: SQLiteDatabase, cardId: string) {
  return db.getFirstAsync<Customer>('SELECT * FROM customers WHERE card_id = ?', cardId);
}

/** New card ID for a lost or moved card; the old QR stops working immediately. */
export async function reissueCard(db: SQLiteDatabase, vehicleNo: string): Promise<string> {
  const cardId = newCardId();
  await db.runAsync(
    'UPDATE customers SET card_id = ?, updated_at = ? WHERE vehicle_no = ?',
    cardId, new Date().toISOString(), vehicleNo,
  );
  return cardId;
}

/** Plate matches ignore spaces/dashes; name and phone match the raw text. */
export function searchCustomers(db: SQLiteDatabase, text: string) {
  const like = `%${text.trim()}%`;
  const plateLike = `%${normalizeVehicleNo(text)}%`;
  return db.getAllAsync<Customer & { paid_this_month: number }>(
    `SELECT c.*, EXISTS (SELECT 1 FROM payments p WHERE p.vehicle_no = c.vehicle_no AND p.month = ?) AS paid_this_month
       FROM customers c
      WHERE c.vehicle_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?
      ORDER BY c.active DESC, c.vehicle_no`,
    monthKey(),
    plateLike,
    like,
    like,
  );
}

export async function saveCustomer(
  db: SQLiteDatabase,
  c: Omit<Customer, 'registered_at' | 'updated_at' | 'active' | 'card_id'> & { active?: number },
  isNew: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  if (isNew) {
    await db.runAsync(
      `INSERT INTO customers (vehicle_no, card_id, name, phone, address, vehicle_type, registered_at, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      c.vehicle_no, newCardId(), c.name, c.phone, c.address, c.vehicle_type, now, now,
    );
  } else {
    await db.runAsync(
      `UPDATE customers SET name = ?, phone = ?, address = ?, vehicle_type = ?, active = ?, updated_at = ?
        WHERE vehicle_no = ?`,
      c.name, c.phone, c.address, c.vehicle_type, c.active ?? 1, now, c.vehicle_no,
    );
  }
}

// ---------- Monthly payments ----------

export function getPayments(db: SQLiteDatabase, vehicleNo: string) {
  return db.getAllAsync<Payment>(
    'SELECT * FROM payments WHERE vehicle_no = ? ORDER BY month DESC',
    vehicleNo,
  );
}

export function getPaymentForMonth(db: SQLiteDatabase, vehicleNo: string, month: string) {
  return db.getFirstAsync<Payment>(
    'SELECT * FROM payments WHERE vehicle_no = ? AND month = ?',
    vehicleNo,
    month,
  );
}

export async function recordPayment(
  db: SQLiteDatabase,
  vehicleNo: string,
  month: string,
  amount: number,
): Promise<Payment> {
  const now = new Date().toISOString();
  const payment: Payment = {
    id: Crypto.randomUUID(),
    vehicle_no: vehicleNo,
    month,
    amount,
    paid_at: now,
    receipt_no: newReceiptNo('M', Crypto.randomUUID().replace(/-/g, '')),
    updated_at: now,
  };
  await db.runAsync(
    `INSERT INTO payments (id, vehicle_no, month, amount, paid_at, receipt_no, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    payment.id, payment.vehicle_no, payment.month, payment.amount, payment.paid_at, payment.receipt_no, payment.updated_at,
  );
  return payment;
}

export function deletePayment(db: SQLiteDatabase, id: string) {
  return db.runAsync('DELETE FROM payments WHERE id = ?', id);
}

/** Active customers with no payment for the given month. */
export function getUnpaidCustomers(db: SQLiteDatabase, month: string) {
  return db.getAllAsync<Customer>(
    `SELECT c.* FROM customers c
      WHERE c.active = 1
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.vehicle_no = c.vehicle_no AND p.month = ?)
      ORDER BY c.vehicle_no`,
    month,
  );
}

// ---------- Casual (non-registered) parking ----------

export async function recordCasualParking(db: SQLiteDatabase, vehicleNo: string): Promise<CasualParking> {
  const entry: CasualParking = {
    id: Crypto.randomUUID(),
    vehicle_no: vehicleNo,
    amount: CASUAL_FEE,
    parked_at: new Date().toISOString(),
    receipt_no: newReceiptNo('C', Crypto.randomUUID().replace(/-/g, '')),
  };
  await db.runAsync(
    'INSERT INTO casual_parkings (id, vehicle_no, amount, parked_at, receipt_no) VALUES (?, ?, ?, ?, ?)',
    entry.id, entry.vehicle_no, entry.amount, entry.parked_at, entry.receipt_no,
  );
  return entry;
}

export function getCasualParkingsForVehicle(db: SQLiteDatabase, vehicleNo: string) {
  return db.getAllAsync<CasualParking>(
    'SELECT * FROM casual_parkings WHERE vehicle_no = ? ORDER BY parked_at DESC LIMIT 50',
    vehicleNo,
  );
}

// ---------- Reports ----------

export type DaySummary = {
  casualCount: number;
  casualTotal: number;
  monthlyCount: number;
  monthlyTotal: number;
  casual: CasualParking[];
  monthly: Payment[];
};

/** Everything collected on a given day. ISO timestamps are UTC, so filter in JS by local day. */
export async function getDaySummary(db: SQLiteDatabase, day: string = dayKey()): Promise<DaySummary> {
  const since = new Date(Date.parse(`${day}T00:00:00`) - 24 * 3600 * 1000).toISOString();
  const casual = (await db.getAllAsync<CasualParking>(
    'SELECT * FROM casual_parkings WHERE parked_at >= ? ORDER BY parked_at DESC',
    since,
  )).filter((c) => dayKey(new Date(c.parked_at)) === day);
  const monthly = (await db.getAllAsync<Payment>(
    'SELECT * FROM payments WHERE paid_at >= ? ORDER BY paid_at DESC',
    since,
  )).filter((p) => dayKey(new Date(p.paid_at)) === day);
  return {
    casualCount: casual.length,
    casualTotal: casual.reduce((s, c) => s + c.amount, 0),
    monthlyCount: monthly.length,
    monthlyTotal: monthly.reduce((s, p) => s + p.amount, 0),
    casual,
    monthly,
  };
}
