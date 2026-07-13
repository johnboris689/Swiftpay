import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const { Pool } = pg;

const isPostgres = !!process.env.DATABASE_URL;
let pgPool: pg.Pool | null = null;
let sqliteDb: sqlite3.Database | null = null;

const SQLITE_FILE = path.join(process.cwd(), 'swiftpay.sqlite');

// Default BPC config values
const DEFAULT_BPC_CONFIG = {
  bankName: "PalmPay",
  accountNumber: "8960723295",
  accountName: "pwamunadi ishaku",
  whatsappLink: "https://wa.me/2349162845073",
  voucherPrice: 6500,
  instructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
  maintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
};

export async function initDb() {
  if (isPostgres) {
    console.log('Connecting to PostgreSQL database...');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  } else {
    console.log(`Connecting to local SQLite database at ${SQLITE_FILE}...`);
    sqliteDb = new sqlite3.Database(SQLITE_FILE);
  }

  // Create tables if they do not exist
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      fullName TEXT,
      username TEXT,
      email TEXT PRIMARY KEY,
      phone TEXT,
      passwordHash TEXT,
      balance REAL,
      dailyTarget REAL,
      dailySpent REAL,
      pinCreated INTEGER,
      pinCode TEXT,
      biometricEnabled INTEGER,
      profilePic TEXT,
      tier INTEGER,
      isSuspended INTEGER,
      isFrozen INTEGER,
      registrationDate TEXT,
      accountStatus TEXT,
      beneficiaries TEXT,
      phoneBeneficiaries TEXT,
      loginHistory TEXT,
      notifications TEXT,
      transactions TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS vouchers (
      code TEXT PRIMARY KEY,
      amount REAL,
      status TEXT,
      usedBy TEXT,
      usedAt TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      emailOrPhone TEXT,
      otp TEXT,
      expiresAt INTEGER,
      used INTEGER,
      createdAt INTEGER
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      message TEXT,
      type TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS admins (
      email TEXT PRIMARY KEY,
      passwordHash TEXT
    )
  `);

  // Seed default admin if not exists
  const secureAdminPasswordHash = crypto.createHash('sha256').update('Boris$689').digest('hex');
  const existingAdmin = await getRow(`SELECT * FROM admins WHERE email = $1`, ['talkdavidjohn@gmail.com']);
  if (!existingAdmin) {
    await execute(
      `INSERT INTO admins (email, passwordHash) VALUES ($1, $2)`,
      ['talkdavidjohn@gmail.com', secureAdminPasswordHash]
    );
    console.log('Default secure admin seeded successfully.');
  }

  // Seed initial user if database is empty
  const defaultUserPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
  const userCount = await getRow(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || userCount.count === 0) {
    await execute(
      `INSERT INTO users (
        fullName, username, email, phone, passwordHash, balance, dailyTarget, dailySpent,
        pinCreated, pinCode, biometricEnabled, profilePic, tier, isSuspended, isFrozen,
        registrationDate, accountStatus, beneficiaries, phoneBeneficiaries, loginHistory,
        notifications, transactions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        'Adebayo Samuel', 'adebayo_samuel', 'user@example.com', '08034567890', defaultUserPasswordHash,
        200000, 50000, 18400, 1, '1234', 1, '', 3, 0, 0,
        new Date().toISOString(), 'active', '[]', '[]', '[]', '[]', '[]'
      ]
    );
    console.log('Default user seeded successfully.');
  }

  // Seed vouchers if empty
  const voucherCount = await getRow(`SELECT COUNT(*) as count FROM vouchers`);
  if (!voucherCount || voucherCount.count === 0) {
    const defaultVouchers = [
      { code: 'BPC-7674-2206-6501', amount: 6500 },
      { code: 'BPC-9001-3029-8675', amount: 6500 }
    ];
    for (const v of defaultVouchers) {
      await execute(`INSERT INTO vouchers (code, amount, status) VALUES ($1, $2, $3)`, [v.code, v.amount, 'unused']);
    }
    console.log('Default BPC vouchers seeded.');
  }

  // Seed default admin settings if not present
  const settingsCount = await getRow(`SELECT COUNT(*) as count FROM admin_settings`);
  if (!settingsCount || settingsCount.count === 0) {
    const defaultSettings: Record<string, string> = {
      supportEmail: "support@swiftpay.com",
      supportPhone: "+2349162845073",
      whatsappNumber: "+2349162845073",
      senderName: "SwiftPay",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      recoveryEnabled: "true",
      smsRecoveryEnabled: "true",
      bpcBankName: "PalmPay",
      bpcAccountNumber: "8960723295",
      bpcAccountName: "pwamunadi ishaku",
      bpcVoucherPrice: "6500",
      bpcInstructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
      bpcMaintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      await execute(`INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [key, value]);
    }
    console.log('Default admin settings seeded successfully.');
  }
}

// Low-level query execution that maps PG parameters ($1, $2) to SQLite's (?) if running sqlite
export function execute(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      pgPool!.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    } else {
      // Convert standard PostgreSQL parameterized syntax $1, $2 to SQLite ? placeholders
      let sqliteSql = sql;
      const count = (sql.match(/\$\d+/g) || []).length;
      for (let i = 1; i <= count + 10; i++) {
        sqliteSql = sqliteSql.replace(`$${i}`, '?');
      }
      sqliteDb!.run(sqliteSql, params, function (err) {
        if (err) return reject(err);
        resolve({ rows: [], lastID: this.lastID, changes: this.changes });
      });
    }
  });
}

export function getRow(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      pgPool!.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res.rows[0] || null);
      });
    } else {
      let sqliteSql = sql;
      const count = (sql.match(/\$\d+/g) || []).length;
      for (let i = 1; i <= count + 10; i++) {
        sqliteSql = sqliteSql.replace(`$${i}`, '?');
      }
      sqliteDb!.get(sqliteSql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    }
  });
}

export function getAllRows(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      pgPool!.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res.rows);
      });
    } else {
      let sqliteSql = sql;
      const count = (sql.match(/\$\d+/g) || []).length;
      for (let i = 1; i <= count + 10; i++) {
        sqliteSql = sqliteSql.replace(`$${i}`, '?');
      }
      sqliteDb!.all(sqliteSql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    }
  });
}
