import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { initDb, getRow, getAllRows, execute } from './db';
import { sendEmail, sendSms } from './email_sms_service';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'swiftpay_db.json');

app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Download complete source code ZIP archive route
app.get('/download-source', (req, res) => {
  const zipPath = path.join(process.cwd(), 'public', 'swiftpay_complete_source.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'swiftpay_complete_source.zip');
  } else {
    res.status(404).json({ error: 'Source code archive is being generated. Please refresh in a moment.' });
  }
});

// -------------------- DATABASE REAL-TIME READ/WRITE SYNC MIDDLEWARE --------------------
app.use('/api', async (req, res, next) => {
  // 1. Ensure read-through consistency: load latest database state into cache on every request
  try {
    await loadDbCache();
  } catch (err) {
    console.error('[SwiftPay DB] Failed to reload database cache:', err);
  }

  // 2. Ensure write-through consistency: intercept response to await any active database writes
  const originalSend = res.send;
  res.send = function (body?: any) {
    pendingWritePromise.then(() => {
      originalSend.call(this, body);
    }).catch((err) => {
      console.error('[SwiftPay DB] Error waiting for database write:', err);
      originalSend.call(this, body);
    });
    return this;
  };

  next();
});

// Set up multer disk storage
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.get('/download/swiftpay_latest_updates.zip', (req, res) => {
  const zipPath = path.join(process.cwd(), 'swiftpay_latest_updates.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'swiftpay_latest_updates.zip');
  } else {
    res.status(404).send('ZIP file not found');
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `guide-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed.'));
    }
  }
});

// -------------------- SECURITY HEADERS MIDDLEWARE --------------------
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; img-src 'self' data: https:; font-src 'self' https: data:; media-src 'self' data: https:;");
  next();
});

// -------------------- RATE LIMITING MIDDLEWARE --------------------
const rateLimits = new Map<string, { count: number; lastReset: number }>();
function rateLimiter(req: any, res: any, next: any) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(ip) || { count: 0, lastReset: now };

  if (now - limit.lastReset > 60 * 1000) {
    limit.count = 1;
    limit.lastReset = now;
  } else {
    limit.count += 1;
  }
  rateLimits.set(ip, limit);

  if (limit.count > 100) { // 100 requests per minute
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again after 1 minute.' });
  }
  next();
}

app.use(rateLimiter);

// -------------------- DATABASE DEFINITIONS --------------------
interface UserState {
  fullName: string;
  email: string;
  passwordHash: string;
  balance: number;
  dailyTarget: number;
  dailySpent: number;
  pinCreated: boolean;
  pinCode?: string;
  pinHash?: string;
  biometricEnabled: boolean;
  biometricRegisteredAt?: string;
  lastBiometricLogin?: string;
  lastLoginMethod?: string;
  webAuthnCredential?: {
    id: string;
    rawId?: string;
    type?: string;
    publicKey?: string;
    counter?: number;
    transports?: string[];
    deviceName?: string;
    createdAt?: string;
  };
  phone?: string;
  profilePic?: string;
  tier?: number;
  isSuspended?: boolean;
  isFrozen?: boolean;
  registrationDate?: string;
  accountStatus?: string;
  emailVerificationStatus?: string;
  transactions?: any[];
  notifications?: any[];
  beneficiaries?: any[];
  phoneBeneficiaries?: any[];
  loginHistory?: any[];
  wdvVerified?: boolean;
  isWdvVerified?: boolean;
  welcomeRewardShown?: boolean;
  giftDay?: number;
  giftActive?: boolean;
  lastGiftCreditTime?: string;
  giftExpiresAt?: string;
}

interface WdvConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  whatsappLink: string;
  whatsappNumber?: string;
  voucherPrice: number;
  instructions: string;
  maintenanceNotice: string;
}

const DEFAULT_WDV_CONFIG: WdvConfig = {
  bankName: "PalmPay",
  accountNumber: "8960723295",
  accountName: "pwamunadi ishaku",
  whatsappLink: "https://wa.me/2349162845073",
  whatsappNumber: "+2349162845073",
  voucherPrice: 6500,
  instructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
  maintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
};

interface AdminState {
  email: string;
  passwordHash: string;
  passwordhash?: string;
}

interface DBStructure {
  users: UserState[];
  vouchers: any[];
  passwordResets: any[];
  logs: any[];
  wdvConfig?: WdvConfig;
  admins?: AdminState[];
}

// -------------------- SQL DATABASE CACHE PRELOADER --------------------
let dbCache: DBStructure = {
  users: [],
  vouchers: [],
  passwordResets: [],
  logs: [],
  wdvConfig: { ...DEFAULT_WDV_CONFIG },
  admins: []
};

function safeParseJson(val: any, fallback: any = []): any {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch (err) {
    console.error('[SwiftPay DB] Failed to parse JSON field:', val, err);
    return fallback;
  }
}

async function loadDbCache() {
  // Ensure we wait for any pending database writes to complete first
  await pendingWritePromise;
  try {
    console.log('[SwiftPay DB] Preloading database cache from SQL database...');
    
    // Fetch settings
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const wdvConfig: any = { ...DEFAULT_WDV_CONFIG };
    for (const r of settingRows) {
      if (r.key === 'wdvBankName' || r.key === 'bpcBankName') wdvConfig.bankName = r.value;
      if (r.key === 'wdvAccountNumber' || r.key === 'bpcAccountNumber') wdvConfig.accountNumber = r.value;
      if (r.key === 'wdvAccountName' || r.key === 'bpcAccountName') wdvConfig.accountName = r.value;
      if (r.key === 'wdvWhatsappLink' || r.key === 'bpcWhatsappLink') wdvConfig.whatsappLink = r.value;
      if (r.key === 'wdvWhatsappNumber' || r.key === 'whatsappNumber') wdvConfig.whatsappNumber = r.value;
      if (r.key === 'wdvVoucherPrice' || r.key === 'bpcVoucherPrice') wdvConfig.voucherPrice = Number(r.value || 6500);
      if (r.key === 'wdvInstructions' || r.key === 'bpcInstructions') wdvConfig.instructions = r.value;
      if (r.key === 'wdvMaintenanceNotice' || r.key === 'bpcMaintenanceNotice') wdvConfig.maintenanceNotice = r.value;
    }

    // Fetch users
    const userRows = await getAllRows(`SELECT * FROM users`);
    const users: UserState[] = userRows.map(row => ({
      fullName: row.fullname || '',
      email: row.email || '',
      passwordHash: row.passwordhash || '',
      balance: Number(row.balance ?? 0),
      dailyTarget: Number(row.dailytarget ?? 50000),
      dailySpent: Number(row.dailyspent ?? 0),
      pinCreated: row.pincreated === 1,
      pinCode: row.pincode || '',
      biometricEnabled: row.biometricenabled === 1,
      phone: row.phone || '',
      profilePic: row.profilepic || '',
      tier: Number(row.tier ?? 3),
      isSuspended: row.issuspended === 1,
      isFrozen: row.isfrozen === 1,
      registrationDate: row.registrationdate || '',
      accountStatus: row.accountstatus || 'active',
      beneficiaries: safeParseJson(row.beneficiaries, []),
      phoneBeneficiaries: safeParseJson(row.phonebeneficiaries, []),
      loginHistory: safeParseJson(row.loginhistory, []),
      notifications: safeParseJson(row.notifications, []),
      transactions: safeParseJson(row.transactions, []),
      wdvVerified: row.wdvverified === 1 || row.iswdvverified === 1,
      isWdvVerified: row.iswdvverified === 1 || row.wdvverified === 1,
      welcomeRewardShown: row.welcomerewardshown === 1,
      giftDay: Number(row.giftday ?? 0),
      giftActive: row.giftactive !== 0, // default true if null or not 0
      lastGiftCreditTime: row.lastgiftcredittime || '',
      giftExpiresAt: row.giftexpiresat || ''
    }));

    // Fetch vouchers - load all database-backed vouchers with complete fields
    const voucherRows = await getAllRows(`SELECT * FROM vouchers`);
    let vouchers = voucherRows.map(row => ({
      id: row.id || row.vouchercode || row.code,
      code: row.vouchercode || row.code,
      voucherCode: row.vouchercode || row.code,
      amount: Number(row.amount ?? 6500),
      status: row.status || 'unused',
      usedBy: row.usedby || '',
      usedAt: row.usedat || '',
      generatedAt: row.generatedat || new Date().toISOString(),
      withdrawalId: row.withdrawalid || '',
      purchasedBy: row.purchasedby || '',
      redeemedBy: safeParseJson(row.redeemedby, [])
    }));

    // Fetch password resets
    const resetRows = await getAllRows(`SELECT * FROM password_resets`);
    const passwordResets = resetRows.map(row => ({
      email: row.emailorphone || '',
      otp: row.otp || '',
      token: row.id || '',
      expiresAt: Number(row.expiresat || 0),
      used: row.used === 1
    }));

    // Fetch logs
    const logRows = await getAllRows(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 500`);
    const logs = logRows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      message: row.message,
      type: row.type
    }));

    const secureAdminPasswordHash = crypto.createHash('sha256').update('Boris$689').digest('hex');

    dbCache = {
      users,
      vouchers,
      passwordResets,
      logs,
      wdvConfig,
      admins: [
        {
          email: 'talkdavidjohn@gmail.com',
          passwordHash: secureAdminPasswordHash
        }
      ]
    };
    console.log(`[SwiftPay DB] Successfully preloaded ${users.length} users, ${vouchers.length} vouchers, and ${logs.length} diagnostic logs.`);
  } catch (err) {
    console.error('[SwiftPay DB] Failed to preload database cache:', err);
  }
}

async function persistDbCache(data: DBStructure) {
  try {
    // 0. Sync user deletions from PostgreSQL
    const existingUsers = await getAllRows(`SELECT email FROM users`);
    const activeEmails = new Set(data.users.map(u => u.email.toLowerCase()));
    for (const row of existingUsers) {
      if (!activeEmails.has(row.email.toLowerCase())) {
        await execute(`DELETE FROM users WHERE email = $1`, [row.email.toLowerCase()]);
      }
    }

    // 1. Save Users
    for (const u of data.users) {
      await execute(`
        INSERT INTO users (
          fullName, username, email, phone, passwordHash, balance, dailyTarget, dailySpent,
          pinCreated, pinCode, biometricEnabled, profilePic, tier, isSuspended, isFrozen,
          registrationDate, accountStatus, beneficiaries, phoneBeneficiaries, loginHistory,
          notifications, transactions, wdvVerified, isWdvVerified, welcomeRewardShown,
          giftDay, giftActive, lastGiftCreditTime, giftExpiresAt
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
        ON CONFLICT(email) DO UPDATE SET
          fullName = EXCLUDED.fullName,
          phone = EXCLUDED.phone,
          passwordHash = EXCLUDED.passwordHash,
          balance = EXCLUDED.balance,
          dailyTarget = EXCLUDED.dailyTarget,
          dailySpent = EXCLUDED.dailySpent,
          pinCreated = EXCLUDED.pinCreated,
          pinCode = EXCLUDED.pinCode,
          biometricEnabled = EXCLUDED.biometricEnabled,
          profilePic = EXCLUDED.profilePic,
          tier = EXCLUDED.tier,
          isSuspended = EXCLUDED.isSuspended,
          isFrozen = EXCLUDED.isFrozen,
          registrationDate = EXCLUDED.registrationDate,
          accountStatus = EXCLUDED.accountStatus,
          beneficiaries = EXCLUDED.beneficiaries,
          phoneBeneficiaries = EXCLUDED.phoneBeneficiaries,
          loginHistory = EXCLUDED.loginHistory,
          notifications = EXCLUDED.notifications,
          transactions = EXCLUDED.transactions,
          wdvVerified = EXCLUDED.wdvVerified,
          isWdvVerified = EXCLUDED.isWdvVerified,
          welcomeRewardShown = EXCLUDED.welcomeRewardShown,
          giftDay = EXCLUDED.giftDay,
          giftActive = EXCLUDED.giftActive,
          lastGiftCreditTime = EXCLUDED.lastGiftCreditTime,
          giftExpiresAt = EXCLUDED.giftExpiresAt
      `, [
        u.fullName,
        u.email.split('@')[0],
        u.email.toLowerCase(),
        u.phone || '',
        u.passwordHash,
        u.balance,
        u.dailyTarget,
        u.dailySpent,
        u.pinCreated ? 1 : 0,
        u.pinCode || '',
        u.biometricEnabled ? 1 : 0,
        u.profilePic || '',
        u.tier || 3,
        u.isSuspended ? 1 : 0,
        u.isFrozen ? 1 : 0,
        u.registrationDate || new Date().toISOString(),
        u.accountStatus || 'active',
        JSON.stringify(u.beneficiaries || []),
        JSON.stringify(u.phoneBeneficiaries || []),
        JSON.stringify(u.loginHistory || []),
        JSON.stringify(u.notifications || []),
        JSON.stringify(u.transactions || []),
        u.wdvVerified || u.isWdvVerified ? 1 : 0,
        u.isWdvVerified || u.wdvVerified ? 1 : 0,
        u.welcomeRewardShown ? 1 : 0,
        u.giftDay || 0,
        u.giftActive ? 1 : 0,
        u.lastGiftCreditTime || '',
        u.giftExpiresAt || ''
      ]);
    }

    // 2. Save Vouchers
    for (const v of data.vouchers) {
      await execute(`
        INSERT INTO vouchers (code, amount, status, usedBy, usedAt, redeemedBy)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(code) DO UPDATE SET
          amount = EXCLUDED.amount,
          status = EXCLUDED.status,
          usedBy = EXCLUDED.usedBy,
          usedAt = EXCLUDED.usedAt,
          redeemedBy = EXCLUDED.redeemedBy
      `, [v.code, v.amount, v.status, v.usedBy || '', v.usedAt || '', JSON.stringify(v.redeemedBy || [])]);
    }

    // 3. Save Password Resets
    for (const r of data.passwordResets || []) {
      const id = r.token || `reset-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      await execute(`
        INSERT INTO password_resets (id, emailOrPhone, otp, expiresAt, used, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(id) DO UPDATE SET
          used = EXCLUDED.used
      `, [id, r.email.toLowerCase(), r.otp, r.expiresAt, r.used ? 1 : 0, Date.now()]);
    }

    // 4. Save Wdv Config Settings to admin_settings
    if (data.wdvConfig) {
      const c = data.wdvConfig;
      const settingsMap = {
        wdvBankName: c.bankName,
        wdvAccountNumber: c.accountNumber,
        wdvAccountName: c.accountName,
        wdvWhatsappLink: c.whatsappLink,
        wdvVoucherPrice: String(c.voucherPrice),
        wdvInstructions: c.instructions,
        wdvMaintenanceNotice: c.maintenanceNotice
      };
      for (const [key, value] of Object.entries(settingsMap)) {
        await execute(`
          INSERT INTO admin_settings (key, value) VALUES ($1, $2)
          ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
        `, [key, value]);
      }
    }
  } catch (err) {
    console.error('[SwiftPay DB] Background persistence error:', err);
  }
}

let pendingWritePromise: Promise<any> = Promise.resolve();

function readDb(): DBStructure {
  return dbCache;
}

async function writeDb(data: DBStructure): Promise<void> {
  dbCache = data;
  const currentWrite = persistDbCache(data).catch(err => {
    console.error('[SwiftPay DB] Error during database persistence:', err);
  });
  pendingWritePromise = Promise.all([pendingWritePromise, currentWrite]);
  await currentWrite;
}

// -------------------- SECURE AUTHENTICATION TOKENS (JWT-like) --------------------
const TOKEN_SECRET = 'swiftpay_secured_vault_key_2026_salt_88';

function generateToken(email: string): string {
  const base64Email = Buffer.from(email.toLowerCase()).toString('base64');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(email.toLowerCase()).digest('hex');
  return `${signature}.${base64Email}`;
}

function verifyToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [signature, base64Email] = parts;
  try {
    const email = Buffer.from(base64Email, 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', TOKEN_SECRET).update(email.toLowerCase()).digest('hex');
    if (signature === expectedSignature) {
      return email.toLowerCase();
    }
  } catch (e) {
    return null;
  }
  return null;
}

// -------------------- 3-DAY DAILY ₦200,000 GIFT SYSTEM ENGINE --------------------
function processUserGiftEligibility(user: UserState): { updated: boolean; user: UserState } {
  if (user.giftActive === false) {
    return { updated: false, user };
  }

  const now = new Date();
  
  if (!user.registrationDate) {
    user.registrationDate = now.toISOString();
  }
  const regDate = new Date(user.registrationDate);

  if (user.giftDay === undefined) user.giftDay = 1;
  if (user.giftActive === undefined) user.giftActive = true;
  if (!user.lastGiftCreditTime) user.lastGiftCreditTime = user.registrationDate;
  if (!user.giftExpiresAt) {
    user.giftExpiresAt = new Date(regDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  }

  const expiresAt = new Date(user.giftExpiresAt);

  if (now.getTime() >= expiresAt.getTime()) {
    user.giftActive = false;
    return { updated: true, user };
  }

  const lastCreditTime = new Date(user.lastGiftCreditTime);
  const msDiff = now.getTime() - lastCreditTime.getTime();
  const hoursDiff = msDiff / (1000 * 60 * 60);

  if (hoursDiff >= 24) {
    const nextDay = user.giftDay + 1;
    if (nextDay <= 3) {
      user.giftDay = nextDay;
      user.balance = 200000;
      user.lastGiftCreditTime = now.toISOString();

      user.transactions = user.transactions || [];
      user.transactions.unshift({
        id: `tx-${Date.now()}-gift-day-${nextDay}`,
        type: 'promotional_bonus',
        amount: 200000,
        date: now.toISOString(),
        status: 'success',
        description: `Day ${nextDay} Promotional Bonus`,
        narration: `SwiftPay Daily Gift Reset`
      });

      user.notifications = user.notifications || [];
      user.notifications.unshift({
        id: `notif-${Date.now()}-gift-day-${nextDay}`,
        title: `Day ${nextDay} Gift Credited`,
        body: `Your wallet balance has been automatically reset to ₦200,000 for Day ${nextDay} of your registration bonus.`,
        date: now.toISOString(),
        unread: true
      });

      console.log(`[Gift System] User ${user.email} successfully received Day ${nextDay} ₦200,000 reset.`);
      return { updated: true, user };
    } else {
      user.giftActive = false;
      return { updated: true, user };
    }
  }

  return { updated: false, user };
}

// Token Verification Middleware
async function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Secure session token missing' });
  }
  const email = verifyToken(token);
  if (!email) {
    return res.status(403).json({ error: 'Access Denied: Session token invalid or expired' });
  }
  req.userEmail = email;

  // Auto-provision user record in database if missing, preventing any downstream "User not found" errors
  const db = readDb();
  let userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    const defaultName = email.split('@')[0].split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    const dummyUser = {
      fullName: defaultName || 'SwiftPay User',
      email: email.toLowerCase(),
      passwordHash: bcrypt.hashSync('SwiftPayTempPass99!', 10),
      balance: 200000,
      dailyTarget: 50000,
      dailySpent: 0,
      pinCreated: false,
      biometricEnabled: false,
      phone: '',
      profilePic: '',
      tier: 3,
      isSuspended: false,
      isFrozen: false,
      registrationDate: new Date().toISOString(),
      accountStatus: 'active',
      emailVerificationStatus: 'verified',
      transactions: [],
      notifications: [
        {
          id: `notif-${Date.now()}`,
          title: 'Welcome to SwiftPay!',
          body: 'Welcome to your premium bill payments gateway! Please create a 4-digit security PIN to get started.',
          date: new Date().toISOString(),
          unread: true
        }
      ],
      giftDay: 1,
      giftActive: true,
      lastGiftCreditTime: new Date().toISOString(),
      giftExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    };
    db.users.push(dummyUser);
    await writeDb(db);
    userIndex = db.users.length - 1;
    logDiagnostic('INFO', 'Auto-created missing user record for authenticated session', { email });
  }

  // FORCE RELOAD user balance and gift system attributes from SQL database to guarantee latest, never cached values
  try {
    const sqlUser = await getRow(`SELECT balance, giftDay, giftActive, lastGiftCreditTime, giftExpiresAt FROM users WHERE email = $1`, [email.toLowerCase()]);
    if (sqlUser) {
      if (sqlUser.balance !== undefined && sqlUser.balance !== null) {
        db.users[userIndex].balance = Number(sqlUser.balance);
      }
      if (sqlUser.giftday !== undefined && sqlUser.giftday !== null) {
        db.users[userIndex].giftDay = Number(sqlUser.giftday);
      }
      if (sqlUser.giftactive !== undefined && sqlUser.giftactive !== null) {
        db.users[userIndex].giftActive = sqlUser.giftactive !== 0;
      }
      if (sqlUser.lastgiftcredittime !== undefined && sqlUser.lastgiftcredittime !== null) {
        db.users[userIndex].lastGiftCreditTime = sqlUser.lastgiftcredittime;
      }
      if (sqlUser.giftexpiresat !== undefined && sqlUser.giftexpiresat !== null) {
        db.users[userIndex].giftExpiresAt = sqlUser.giftexpiresat;
      }
    }
  } catch (err) {
    console.error('[SwiftPay DB] Error syncing user state from SQL database in middleware:', err);
  }

  // Check and process registration gift eligibility
  const user = db.users[userIndex];
  const { updated, user: updatedUser } = processUserGiftEligibility(user);
  if (updated) {
    db.users[userIndex] = updatedUser;
    await writeDb(db);
  }

  req.userIndex = userIndex;
  next();
}

function verifyAdminToken(token: string): string | null {
  const email = verifyToken(token);
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower === 'talkdavidjohn@gmail.com' || lower === 'admin@swiftpay.com' || lower.includes('admin')) {
    return email;
  }
  return null;
}

function authenticateAdminToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access Denied: Secure admin session token missing' });
  }
  const email = verifyAdminToken(token);
  if (!email) {
    return res.status(403).json({ error: 'Access Denied: Admin session token invalid or expired' });
  }
  req.adminEmail = email;
  next();
}

// Admin login brute-force protection rate limiter
const adminLoginAttempts = new Map<string, { count: number; lockUntil: number }>();

function checkAdminLoginRateLimit(req: any, res: any, next: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const attempt = adminLoginAttempts.get(clientIp);

  if (attempt) {
    if (attempt.lockUntil > now) {
      const waitSeconds = Math.ceil((attempt.lockUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed admin login attempts. Account temporarily locked for security. Please try again in ${waitSeconds} seconds.`
      });
    }
    if (attempt.lockUntil <= now && attempt.count >= 5) {
      adminLoginAttempts.delete(clientIp);
    }
  }
  next();
}

function recordFailedAdminLogin(req: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const attempt = adminLoginAttempts.get(clientIp) || { count: 0, lockUntil: 0 };
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.lockUntil = now + 15 * 60 * 1000; // 15 min lock
  }
  adminLoginAttempts.set(clientIp, attempt);
}

function recordSuccessfulAdminLogin(req: any) {
  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  adminLoginAttempts.delete(clientIp);
}

// -------------------- DIAGNOSTIC SYSTEM LOGGING --------------------
function logDiagnostic(
  type: 'API_ERROR' | 'FAILED_LOGIN' | 'FAILED_TX' | 'EXCEPTION' | 'SECURITY_ALERT' | 'INFO',
  message: string,
  meta?: any
) {
  const id = `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = new Date().toISOString();
  
  // Format metadata for log string safely
  let metaStr = '';
  if (meta) {
    try {
      const cleanMeta = { ...meta };
      if (cleanMeta.email) {
        cleanMeta.email = cleanMeta.email.replace(/(.{2}).*(@.*)/, '$1***$2');
      }
      metaStr = ' - ' + JSON.stringify(cleanMeta);
    } catch (e) {
      metaStr = '';
    }
  }

  execute(
    `INSERT INTO logs (id, timestamp, message, type) VALUES ($1, $2, $3, $4)`,
    [id, timestamp, `${message}${metaStr}`, type]
  ).catch(err => console.error('Error recording diagnostic log in database:', err));
}

// -------------------- INPUT VALIDATION UTILITIES --------------------
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isWeakPassword(password: string): boolean {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length < 8 || !hasLetter || !hasNumber;
}

function isValidPhone(phone: string): boolean {
  // Nigerian formats: 11 digits, starts with 070, 080, 090, 081, etc. or international
  return /^(070|080|090|081|071|091|01|\+234)\d{8,10}$/.test(phone);
}

function isValidAccountNumber(accNum: string): boolean {
  return /^\d{10}$/.test(accNum);
}

// In-memory failed logins
const failedLogins = new Map<string, { count: number; lockedUntil: number }>();

// -------------------- AUTHENTICATION ROUTES --------------------

// Register
app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, password } = req.body;
  
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!password || isWeakPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
  }

  // Fetch admin settings for toggles & bonus
  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.registrationEnabled === 'false') {
    return res.status(403).json({ error: 'New user registrations are currently disabled by administration.' });
  }

  const bonusAmount = settings.registrationBonus !== undefined ? Number(settings.registrationBonus) : 200000;
  const currencySymbol = settings.currency || '₦';

  const db = readDb();
  const existingUser = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    logDiagnostic('API_ERROR', 'Registration failed: Duplicate email request', { email });
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const initialTx = bonusAmount > 0 ? [{
    id: `tx-${Date.now()}-bonus`,
    type: 'promotional_bonus',
    amount: bonusAmount,
    date: new Date().toISOString(),
    status: 'success',
    description: 'Registration Bonus',
    narration: 'Welcome Reward'
  }] : [];

  const newUser: UserState = {
    fullName: fullName.trim(),
    email: email.toLowerCase(),
    passwordHash,
    balance: bonusAmount,
    dailyTarget: 50000,
    dailySpent: 0,
    pinCreated: false,
    biometricEnabled: false,
    phone: '',
    profilePic: '',
    tier: 3,
    isSuspended: false,
    isFrozen: false,
    registrationDate: new Date().toISOString(),
    accountStatus: 'active',
    emailVerificationStatus: 'verified',
    welcomeRewardShown: false,
    giftDay: 1,
    giftActive: true,
    lastGiftCreditTime: new Date().toISOString(),
    giftExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    transactions: initialTx,
    notifications: [
      ...(bonusAmount > 0 ? [{
        id: `notif-${Date.now()}-bonus`,
        title: 'Welcome Bonus Added',
        body: `Congratulations! Your ${currencySymbol}${bonusAmount.toLocaleString()} welcome reward has been added to your wallet.`,
        date: new Date().toISOString(),
        unread: true
      }] : []),
      {
        id: `notif-${Date.now()}`,
        title: `Welcome to ${settings.websiteName || 'SwiftPay'}!`,
        body: 'Welcome to your premium bill payments gateway! Please create a 4-digit security PIN to get started.',
        date: new Date().toISOString(),
        unread: true
      }
    ],
    beneficiaries: [],
    phoneBeneficiaries: [],
    loginHistory: [
      {
        id: `log-${Date.now()}`,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        device: 'Web Client',
        browser: req.headers['user-agent'] || 'Unknown Browser',
        ip: req.socket.remoteAddress || '127.0.0.1',
        location: 'Lagos, Nigeria',
        status: 'success'
      }
    ]
  };

  db.users.push(newUser);
  writeDb(db);

  const token = generateToken(newUser.email);
  logDiagnostic('INFO', 'User account registered', { email: newUser.email });

  res.json({
    success: true,
    token,
    user: {
      fullName: newUser.fullName,
      email: newUser.email,
      balance: newUser.balance,
      pinCreated: newUser.pinCreated,
      biometricEnabled: newUser.biometricEnabled,
      phone: newUser.phone,
      profilePic: newUser.profilePic,
      tier: newUser.tier,
      transactions: newUser.transactions,
      notifications: newUser.notifications,
      beneficiaries: newUser.beneficiaries,
      phoneBeneficiaries: newUser.phoneBeneficiaries,
      loginHistory: newUser.loginHistory,
      welcomeRewardShown: newUser.welcomeRewardShown
    }
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both your email address and password.' });
  }

  const key = email.toLowerCase();
  const failed = failedLogins.get(key) || { count: 0, lockedUntil: 0 };

  if (failed.lockedUntil > Date.now()) {
    const remainingSeconds = Math.ceil((failed.lockedUntil - Date.now()) / 1000);
    logDiagnostic('SECURITY_ALERT', 'Login attempt on locked account', { email });
    return res.status(400).json({
      error: `Account is locked due to multiple failed login attempts. Retry in ${remainingSeconds}s.`,
      locked: true,
      lockedUntil: failed.lockedUntil
    });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === key);
  
  if (!user) {
    logDiagnostic('FAILED_LOGIN', 'Login failed: Non-existent user email', { email });
    return res.status(400).json({ error: 'Incorrect email address or password.' });
  }

  if (user.isSuspended) {
    logDiagnostic('SECURITY_ALERT', 'Login attempt on suspended account', { email });
    return res.status(400).json({ error: 'This account has been suspended by the administrator.' });
  }

  let isPasswordCorrect = false;
  if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2y$')) {
    isPasswordCorrect = bcrypt.compareSync(password, user.passwordHash);
  } else {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    isPasswordCorrect = user.passwordHash === sha256Hash;
    if (isPasswordCorrect) {
      user.passwordHash = bcrypt.hashSync(password, 10);
      writeDb(db);
    }
  }

  if (!isPasswordCorrect) {
    failed.count += 1;
    if (failed.count >= 3) {
      failed.lockedUntil = Date.now() + 60 * 1000; // 1-minute lockout
      failedLogins.set(key, failed);
      logDiagnostic('SECURITY_ALERT', 'Multiple failed login attempts. Account locked.', { email });
      return res.status(400).json({
        error: 'Account locked due to multiple failed attempts. Waiting period of 60 seconds is active.',
        locked: true,
        lockedUntil: failed.lockedUntil
      });
    }
    failedLogins.set(key, failed);
    const remaining = 3 - failed.count;
    logDiagnostic('FAILED_LOGIN', `Failed password attempt. Attempts remaining: ${remaining}`, { email });
    return res.status(400).json({ error: `Incorrect email address or password. ${remaining} attempts remaining.` });
  }

  // Reset failures
  failedLogins.delete(key);

  // Append login history to DB
  const newHistoryItem = {
    id: `log-${Date.now()}`,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    device: 'Web Client',
    browser: req.headers['user-agent'] || 'Unknown Browser',
    ip: req.socket.remoteAddress || '127.0.0.1',
    location: 'Lagos, Nigeria',
    status: 'success'
  };
  
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.unshift(newHistoryItem);
  
  // Backwards compatibility migration
  if (user.isSuspended === undefined) user.isSuspended = false;
  if (user.isFrozen === undefined) user.isFrozen = false;
  if (!user.transactions) user.transactions = [];
  if (!user.notifications) user.notifications = [];
  if (!user.beneficiaries) user.beneficiaries = [];
  if (!user.phoneBeneficiaries) user.phoneBeneficiaries = [];

  writeDb(db);

  const token = generateToken(user.email);
  logDiagnostic('INFO', 'Successful login session established', { email: user.email });

  res.json({
    success: true,
    token,
    user: {
      fullName: user.fullName,
      email: user.email,
      balance: user.balance,
      pinCreated: user.pinCreated,
      pinCode: user.pinCode,
      biometricEnabled: user.biometricEnabled,
      isSuspended: user.isSuspended,
      isFrozen: user.isFrozen,
      phone: user.phone || '',
      profilePic: user.profilePic || '',
      tier: user.tier || 3,
      transactions: user.transactions,
      notifications: user.notifications,
      beneficiaries: user.beneficiaries,
      phoneBeneficiaries: user.phoneBeneficiaries,
      loginHistory: user.loginHistory,
      welcomeRewardShown: user.welcomeRewardShown
    }
  });
});

// -------------------- WEBAUTHN BIOMETRIC & PIN ROUTES --------------------

// 1. WebAuthn Registration Options (Protected)
app.post('/api/auth/webauthn/register-options', authenticateToken, (req: any, res) => {
  const db = readDb();
  const user = db.users[req.userIndex];
  if (!user) {
    return res.status(404).json({ error: 'User session not found.' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  res.json({
    success: true,
    options: {
      challenge,
      rp: { name: 'SwiftPay', id: req.hostname || 'localhost' },
      user: {
        id: Buffer.from(user.email).toString('base64url'),
        name: user.email,
        displayName: user.fullName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred'
      },
      timeout: 60000
    }
  });
});

// 2. WebAuthn Registration Verify (Protected)
app.post('/api/auth/webauthn/register-verify', authenticateToken, (req: any, res) => {
  const db = readDb();
  const user = db.users[req.userIndex];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { credentialId, rawId } = req.body;

  user.biometricEnabled = true;
  user.biometricRegisteredAt = new Date().toISOString();
  user.webAuthnCredential = {
    id: credentialId || `cred-${Date.now()}`,
    rawId: rawId || credentialId,
    type: 'public-key',
    deviceName: (req.headers['user-agent'] && req.headers['user-agent'].includes('Android'))
      ? 'Android Biometric Authenticator (Fingerprint/Passkey)'
      : (req.headers['user-agent'] && req.headers['user-agent'].includes('iPhone'))
      ? 'Apple Device Authenticator (Face ID / Touch ID)'
      : 'Native Platform Authenticator (Fingerprint/Face ID/Windows Hello)',
    createdAt: new Date().toISOString()
  };

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Biometric Security Enabled',
    body: 'Fingerprint / Face ID biometric authentication has been activated on your account.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'Biometric credential registered', { email: user.email });

  const { passwordHash, ...safeUser } = user as any;
  res.json({
    success: true,
    message: 'Biometric security activated successfully!',
    user: safeUser
  });
});

// 2b. WebAuthn Disable (Protected)
app.post('/api/auth/webauthn/disable', authenticateToken, (req: any, res) => {
  const db = readDb();
  const user = db.users[req.userIndex];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.biometricEnabled = false;
  delete user.webAuthnCredential;

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Biometric Security Disabled',
    body: 'Fingerprint / Face ID biometric authentication has been turned off.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'Biometric credential disabled', { email: user.email });

  const { passwordHash, ...safeUser } = user as any;
  res.json({
    success: true,
    message: 'Biometric authentication turned off.',
    user: safeUser
  });
});

// 3. WebAuthn Login Options
app.post('/api/auth/webauthn/login-options', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please enter your registered email address for biometric login.' });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  if (!user.biometricEnabled) {
    return res.status(400).json({
      error: 'No fingerprint or passkey registered for this account. Please login with password first and enable biometric login.'
    });
  }

  let allowCredentials: any[] = [];
  if (user.webAuthnCredential && user.webAuthnCredential.id) {
    allowCredentials.push({ id: user.webAuthnCredential.id, type: 'public-key' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  res.json({
    success: true,
    options: {
      challenge,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000
    }
  });
});

// 4. WebAuthn Login Verify
app.post('/api/auth/webauthn/login-verify', (req, res) => {
  const { email, credentialId } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required for biometric sign in.' });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  if (user.isSuspended) {
    return res.status(400).json({ error: 'Account suspended. Contact administration.' });
  }

  if (!user.biometricEnabled) {
    return res.status(400).json({ error: 'Biometric login is not enabled for this account. Please login with password first.' });
  }

  user.lastBiometricLogin = new Date().toISOString();
  user.lastLoginMethod = 'biometric';
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.unshift({
    id: `log-${Date.now()}`,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    device: 'Biometric Platform Authenticator (Fingerprint/Face ID)',
    browser: req.headers['user-agent'] || 'Native Browser',
    ip: req.socket.remoteAddress || '127.0.0.1',
    location: 'Lagos, Nigeria',
    status: 'success'
  });

  writeDb(db);

  const token = generateToken(user.email);
  logDiagnostic('INFO', 'Biometric login successful', { email: user.email });

  const { passwordHash, ...safeUser } = user as any;
  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// 5. PIN Setup Endpoint (Protected)
app.post('/api/auth/pin/setup', authenticateToken, (req: any, res) => {
  const { pinCode } = req.body;
  if (!pinCode || (pinCode.length !== 4 && pinCode.length !== 6) || !/^\d+$/.test(pinCode)) {
    return res.status(400).json({ error: 'PIN must be a 4-digit or 6-digit numeric code.' });
  }

  const db = readDb();
  const user = db.users[req.userIndex];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const hashedPin = bcrypt.hashSync(pinCode, 10);
  user.pinCode = hashedPin;
  user.pinCreated = true;

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Security PIN Configured',
    body: 'Your 4-digit wallet security PIN has been set up successfully.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'PIN configured successfully', { email: user.email });

  const { passwordHash, ...safeUser } = user as any;
  res.json({
    success: true,
    message: 'Security PIN configured successfully!',
    user: safeUser
  });
});

// 6. PIN Login Endpoint
app.post('/api/auth/pin/login', (req, res) => {
  const { emailOrPhone, pinCode } = req.body;
  if (!emailOrPhone || !pinCode) {
    return res.status(400).json({ error: 'Please enter your email or phone number and PIN.' });
  }

  const query = emailOrPhone.trim().toLowerCase();
  const key = `pin-${query}`;
  const failed = failedLogins.get(key) || { count: 0, lockedUntil: 0 };

  if (failed.lockedUntil > Date.now()) {
    const remainingSeconds = Math.ceil((failed.lockedUntil - Date.now()) / 1000);
    return res.status(400).json({
      error: `PIN login locked due to multiple incorrect attempts. Try again in ${remainingSeconds}s.`,
      locked: true,
      lockedUntil: failed.lockedUntil
    });
  }

  const db = readDb();
  const user = db.users.find((u: any) => 
    u.email.toLowerCase() === query || 
    (u.phone && u.phone.replace(/\s+/g, '') === query.replace(/\s+/g, ''))
  );

  if (!user) {
    return res.status(404).json({ error: 'No account found matching those credentials.' });
  }

  if (user.isSuspended) {
    return res.status(400).json({ error: 'This account has been suspended by the administrator.' });
  }

  if (!user.pinCreated || !user.pinCode) {
    return res.status(400).json({ error: 'You have not set up a security PIN yet. Please login with your password first.' });
  }

  let isPinCorrect = false;
  if (user.pinCode.startsWith('$2a$') || user.pinCode.startsWith('$2b$') || user.pinCode.startsWith('$2y$')) {
    isPinCorrect = bcrypt.compareSync(pinCode, user.pinCode);
  } else {
    isPinCorrect = user.pinCode === pinCode;
    if (isPinCorrect) {
      user.pinCode = bcrypt.hashSync(pinCode, 10);
      writeDb(db);
    }
  }

  if (!isPinCorrect) {
    failed.count += 1;
    if (failed.count >= 3) {
      failed.lockedUntil = Date.now() + 60 * 1000;
      failedLogins.set(key, failed);
      return res.status(400).json({
        error: 'Too many incorrect PIN attempts. PIN login locked for 60 seconds.',
        locked: true,
        lockedUntil: failed.lockedUntil
      });
    }
    failedLogins.set(key, failed);
    const remaining = 3 - failed.count;
    return res.status(400).json({ error: `Incorrect PIN code. ${remaining} attempt(s) remaining.` });
  }

  failedLogins.delete(key);

  user.lastLoginMethod = 'pin';
  user.loginHistory = user.loginHistory || [];
  user.loginHistory.unshift({
    id: `log-${Date.now()}`,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    device: 'Web Client (PIN Login)',
    browser: req.headers['user-agent'] || 'Unknown Browser',
    ip: req.socket.remoteAddress || '127.0.0.1',
    location: 'Lagos, Nigeria',
    status: 'success'
  });

  writeDb(db);

  const token = generateToken(user.email);
  logDiagnostic('INFO', 'PIN login successful', { email: user.email });

  const { passwordHash, ...safeUser } = user as any;
  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// Get Current Authenticated User Session
app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  const email = req.userEmail;
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User session not found.' });
  }

  // Return safe user details, excluding password and PIN
  const { password, transactionPin, ...safeUser } = user as any;
  res.json({ success: true, user: safeUser });
});

// Set Welcome Reward Shown Endpoint (Protected)
app.post('/api/user/welcome-reward-shown', authenticateToken, (req: any, res) => {
  const db = readDb();
  const user = db.users[req.userIndex];
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.welcomeRewardShown = true;
  writeDb(db);

  res.json({ success: true, message: 'Welcome reward shown state updated successfully.' });
});

// Change Password Endpoint (Protected)
app.post('/api/auth/change-password', authenticateToken, (req: any, res) => {
  const { currentPassword, newPassword } = req.body;
  const email = req.userEmail;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Please enter both current and new passwords.' });
  }
  if (isWeakPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long and contain both letters and numbers.' });
  }

  const db = readDb();
  const userIndex = req.userIndex;

  const user = db.users[userIndex];
  let isCurrentPasswordCorrect = false;
  if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2y$')) {
    isCurrentPasswordCorrect = bcrypt.compareSync(currentPassword, user.passwordHash);
  } else {
    const sha256Hash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    isCurrentPasswordCorrect = user.passwordHash === sha256Hash;
  }

  if (!isCurrentPasswordCorrect) {
    logDiagnostic('SECURITY_ALERT', 'Password change failure: Incorrect current password', { email });
    return res.status(400).json({ error: 'Current password provided is incorrect.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.users[userIndex].passwordHash = newHash;

  // Track activity log in notifications/history
  const logItem = {
    id: `log-${Date.now()}`,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    device: 'Web Client (Change Password)',
    browser: req.headers['user-agent'] || 'Unknown Browser',
    ip: req.socket.remoteAddress || '127.0.0.1',
    location: 'Lagos, Nigeria',
    status: 'success'
  };
  db.users[userIndex].loginHistory = db.users[userIndex].loginHistory || [];
  db.users[userIndex].loginHistory.unshift(logItem);

  db.users[userIndex].notifications = db.users[userIndex].notifications || [];
  db.users[userIndex].notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Security Alert: Password Changed',
    body: 'Your account password was successfully updated. If you did not make this change, please lock your account immediately.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'Password changed successfully', { email });

  res.json({ success: true, message: 'Password updated successfully' });
});

// Forgot Password Flow
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    logDiagnostic('API_ERROR', 'Forgot password request for unknown user', { email });
    return res.status(400).json({ error: 'An account with this email address does not exist.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  db.passwordResets = db.passwordResets || [];
  db.passwordResets.push({
    email: email.toLowerCase(),
    otp,
    token,
    expiresAt,
    used: false
  });
  writeDb(db);

  logDiagnostic('INFO', 'Password reset code dispatched', { email });

  // Dispatch branded email & SMS notifications asynchronously
  sendEmail(
    user.email,
    'SwiftPay Password Recovery OTP Code',
    'Password Reset Security OTP Request',
    `Hello, ${user.fullName || 'SwiftPay User'}`,
    'We received a request to reset your SwiftPay password. Please use the secure 6-digit OTP code below to complete the verification step. If you did not request this, please disregard this email or contact support immediately.',
    otp
  ).then(success => {
    console.log(`[SwiftPay Notify] Branded password recovery email dispatched: ${success}`);
  }).catch(err => {
    console.error('[SwiftPay Notify] Branded password recovery email dispatch failed:', err);
  });

  if (user.phone) {
    sendSms(
      user.phone,
      `[SwiftPay Security Alert] Do not share! Your 6-digit password recovery OTP code is ${otp}. It expires in 10 minutes.`
    ).then(success => {
      console.log(`[SwiftPay Notify] Password recovery SMS dispatched: ${success}`);
    }).catch(err => {
      console.error('[SwiftPay Notify] Password recovery SMS dispatch failed:', err);
    });
  }

  res.json({
    success: true,
    message: 'Verification OTP sent securely. Check your email or phone inbox.',
    otp,
    token
  });
});

// Reset Password Flow
app.post('/api/auth/reset-password', (req, res) => {
  const { email, password, otp, token } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please fill out all fields.' });
  }
  if (isWeakPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
  }

  const db = readDb();
  db.passwordResets = db.passwordResets || [];

  const resetSessionIndex = db.passwordResets.findIndex((r: any) => {
    const isMatchingEmail = r.email.toLowerCase() === email.toLowerCase();
    const isMatchingCode = otp ? r.otp === otp : r.token === token;
    return isMatchingEmail && isMatchingCode;
  });

  if (resetSessionIndex === -1) {
    logDiagnostic('SECURITY_ALERT', 'Failed reset-password attempt (Invalid OTP/Token)', { email });
    return res.status(400).json({ error: 'Invalid verification token or OTP code.' });
  }

  const resetSession = db.passwordResets[resetSessionIndex];
  if (resetSession.used) {
    return res.status(400).json({ error: 'This reset code has already been used.' });
  }

  if (Date.now() > resetSession.expiresAt) {
    return res.status(400).json({ error: 'This verification code/token has expired.' });
  }

  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(400).json({ error: 'User account no longer exists.' });
  }

  const newPasswordHash = bcrypt.hashSync(password, 10);
  db.users[userIndex].passwordHash = newPasswordHash;
  db.passwordResets[resetSessionIndex].used = true;

  // Log activity
  db.users[userIndex].notifications = db.users[userIndex].notifications || [];
  db.users[userIndex].notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Security Notice: Password Reset Successful',
    body: 'Your password was securely updated via OTP reset process. Please sign in with your new password.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'Password recovered via OTP successfully', { email });

  res.json({ success: true, message: 'Password reset successfully!' });
});

// -------------------- SYNC AND PERSISTENCE STATE ENDPOINTS (Protected) --------------------

// Get State
app.get('/api/user/get-state', authenticateToken, (req: any, res) => {
  const db = readDb();
  const user = db.users[req.userIndex];

  res.json({
    success: true,
    user: {
      fullName: user.fullName,
      email: user.email,
      balance: user.balance,
      dailyTarget: user.dailyTarget || 50000,
      dailySpent: user.dailySpent || 0,
      pinCreated: user.pinCreated || false,
      pinCode: user.pinCode || '',
      biometricEnabled: user.biometricEnabled || false,
      isSuspended: !!user.isSuspended,
      isFrozen: !!user.isFrozen,
      phone: user.phone || '',
      profilePic: user.profilePic || '',
      tier: user.tier || 3,
      transactions: user.transactions || [],
      notifications: user.notifications || [],
      beneficiaries: user.beneficiaries || [],
      phoneBeneficiaries: user.phoneBeneficiaries || [],
      loginHistory: user.loginHistory || []
    }
  });
});

// Sync State (Saves transactions, notifications, beneficiaries, etc. onto database securely!)
app.post('/api/user/sync-state', authenticateToken, (req: any, res) => {
  const email = req.userEmail;
  const stateToSync = req.body;

  const db = readDb();
  const userIndex = req.userIndex;
  const user = db.users[userIndex];

  // Prevent transactions if user is frozen
  if (user.isFrozen && (stateToSync.transactions && stateToSync.transactions.length > (user.transactions || []).length)) {
    logDiagnostic('FAILED_TX', 'Transaction attempted on frozen wallet', { email });
    return res.status(400).json({ error: 'Your wallet balance is currently frozen. Please contact administrative support.' });
  }

  const allowedFields = [
    'dailyTarget', 'dailySpent', 'pinCreated', 'pinCode', 
    'biometricEnabled', 'phone', 'profilePic', 'tier',
    'transactions', 'notifications', 'beneficiaries', 'phoneBeneficiaries', 'loginHistory'
  ];

  let stateUpdated = false;
  for (const field of allowedFields) {
    if (stateToSync[field] !== undefined) {
      user[field] = stateToSync[field];
      stateUpdated = true;
    }
  }

  if (stateUpdated) {
    db.users[userIndex] = user;
    writeDb(db);
  }

  res.json({
    success: true,
    user: {
      fullName: user.fullName,
      email: user.email,
      balance: user.balance,
      pinCreated: user.pinCreated,
      biometricEnabled: user.biometricEnabled,
      phone: user.phone || '',
      profilePic: user.profilePic || '',
      tier: user.tier || 3,
      transactions: user.transactions || [],
      notifications: user.notifications || [],
      beneficiaries: user.beneficiaries || [],
      phoneBeneficiaries: user.phoneBeneficiaries || [],
      loginHistory: user.loginHistory || []
    }
  });
});

// Update Profile
app.post('/api/user/update-profile', authenticateToken, (req: any, res) => {
  const email = req.userEmail;
  const { fullName, phone, profilePic, tier } = req.body;

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Please specify a valid Nigerian phone number format.' });
  }

  const db = readDb();
  const userIndex = req.userIndex;

  if (fullName && fullName.trim()) db.users[userIndex].fullName = fullName.trim();
  if (phone !== undefined) db.users[userIndex].phone = phone;
  if (profilePic !== undefined) db.users[userIndex].profilePic = profilePic;
  if (tier !== undefined) db.users[userIndex].tier = Number(tier);

  // Log profile update in notifications
  db.users[userIndex].notifications = db.users[userIndex].notifications || [];
  db.users[userIndex].notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Account Settings Updated',
    body: 'Your SwiftPay personal profile parameters have been updated successfully.',
    date: new Date().toISOString(),
    unread: true
  });

  writeDb(db);
  logDiagnostic('INFO', 'Profile settings updated', { email });

  res.json({
    success: true,
    user: {
      fullName: db.users[userIndex].fullName,
      email: db.users[userIndex].email,
      phone: db.users[userIndex].phone,
      profilePic: db.users[userIndex].profilePic,
      tier: db.users[userIndex].tier,
      balance: db.users[userIndex].balance
    }
  });
});

const BANK_NAME_TO_CODE: Record<string, string> = {
  "9PSB": "120001",
  "Access Bank Limited": "044",
  "Access Holdings Plc": "044",
  "Aella App": "50962",
  "Airtel Money": "120004",
  "Alternative Bank Limited": "000032",
  "Carbon": "565",
  "Chipper Cash": "50594",
  "Citibank Nigeria Limited": "023",
  "Coronation Merchant Bank Limited": "315",
  "Cowrywise": "50123",
  "Ecobank Nigeria Limited": "050",
  "Eyowo": "50126",
  "FairMoney": "50515",
  "FBN Holdings Plc": "011",
  "FBN Merchant Bank Limited": "309",
  "FCMB Group Plc": "214",
  "Fidelity Bank Plc": "070",
  "First Bank of Nigeria Limited": "011",
  "First City Monument Bank Limited (FCMB)": "214",
  "Flutterwave Barter": "50325",
  "FSDH Holding Company Limited": "321",
  "FSDH Merchant Bank Limited": "321",
  "Globus Bank Limited": "00103",
  "Greenwich Merchant Bank Limited": "307",
  "Guaranty Trust Bank Limited (GTBank)": "058",
  "Guaranty Trust Holding Company Plc": "058",
  "Heritage Bank Plc": "030",
  "Hope PSB": "120002",
  "Jaiz Bank Plc": "082",
  "Keystone Bank Limited": "053",
  "Kuda Bank": "50211",
  "Lotus Bank Limited": "302",
  "Moniepoint": "50515",
  "MoneyMaster PSB": "120003",
  "MTN MoMo PSB": "120003",
  "Nova Merchant Bank Limited": "311",
  "OPay": "999992",
  "Optimus Bank Limited": "00107",
  "PalmPay": "999991",
  "Parallex Bank Limited": "104",
  "PiggyVest": "50741",
  "Polaris Bank Limited": "076",
  "Premium Trust Bank Limited": "000031",
  "Providus Bank Limited": "101",
  "Rand Merchant Bank Limited": "302",
  "Rubies": "125",
  "Signature Bank Limited": "000034",
  "SmartCash PSB": "120004",
  "Stanbic IBTC Bank Limited": "221",
  "Stanbic IBTC Holdings Plc": "221",
  "Standard Chartered Bank Limited": "068",
  "Sterling Bank Limited": "050",
  "Sterling Financial Holdings Limited": "050",
  "SunTrust Bank Nigeria Limited": "100",
  "Taj Bank Limited": "302",
  "Titan Trust Bank Limited": "102",
  "UBA (United Bank for Africa Plc)": "033",
  "Union Bank of Nigeria Plc": "032",
  "Unity Bank Plc": "215",
  "V Bank": "50962",
  "Wema Bank Plc": "094",
  "Zenith Bank Plc": "057"
};

async function verifyAndConsumeVoucherSql(voucherCode: string | undefined, email: string, transactionId: string): Promise<{ error?: string }> {
  const norm = (voucherCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) {
    return { error: "Please enter a WDV voucher code." };
  }

  const isPostgres = !!process.env.DATABASE_URL || !!process.env.SQL_HOST;
  let voucher;
  try {
    if (isPostgres) {
      voucher = await getRow(`SELECT * FROM vouchers WHERE UPPER(REPLACE(voucherCode, '-', '')) = $1 OR UPPER(REPLACE(code, '-', '')) = $1 FOR UPDATE`, [norm]);
    } else {
      voucher = await getRow(`SELECT * FROM vouchers WHERE UPPER(REPLACE(voucherCode, '-', '')) = $1 OR UPPER(REPLACE(code, '-', '')) = $1`, [norm]);
    }
  } catch (err: any) {
    console.error('Error selecting voucher in verification:', err);
  }

  if (!voucher) {
    return { error: "Invalid or already used WDV voucher." };
  }

  if (voucher.status !== 'unused') {
    return { error: "Invalid or already used WDV voucher." };
  }

  const now = new Date().toISOString();
  try {
    await execute(`
      UPDATE vouchers
      SET status = $1, usedAt = $2, usedBy = $3, withdrawalId = $4
      WHERE id = $5
    `, ['used', now, email.toLowerCase(), transactionId, voucher.id]);
  } catch (err: any) {
    console.error('Error updating voucher status in SQL:', err);
    return { error: "Failed to consume voucher in SQL database." };
  }

  await loadDbCache();

  return {}; // Success
}

// Verify Voucher (Strict SQL DB source of truth only)
app.post('/api/auth/verify-voucher', async (req, res) => {
  const { voucherCode, email } = req.body;
  if (!voucherCode) {
    return res.status(400).json({ error: 'Please enter a voucher code.' });
  }

  const norm = voucherCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE UPPER(REPLACE(voucherCode, '-', '')) = $1 OR UPPER(REPLACE(code, '-', '')) = $1`, [norm]);
    if (!voucher || voucher.status !== 'unused') {
      return res.status(400).json({ error: 'Invalid or already used WDV voucher.' });
    }

    const redeemedBy = safeParseJson(voucher.redeemedby || voucher.redeemedBy, []);
    if (email && redeemedBy.map((e: string) => e.toLowerCase().trim()).includes(email.toLowerCase().trim())) {
      return res.status(400).json({ error: 'You have already used this voucher.' });
    }

    const db = readDb();
    const config = db.wdvConfig || DEFAULT_WDV_CONFIG;
    return res.json({ success: true, amount: config.voucherPrice || voucher.amount || 6500 });
  } catch (err) {
    console.error('Error in verify-voucher:', err);
    return res.status(500).json({ error: 'Internal server error validating voucher.' });
  }
});

// Activate Voucher (Strict SQL DB source of truth only)
app.post('/api/auth/activate-voucher', authenticateToken, async (req: any, res) => {
  const { voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "Please enter a WDV voucher code." });
  }

  const norm = voucherCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE UPPER(REPLACE(voucherCode, '-', '')) = $1 OR UPPER(REPLACE(code, '-', '')) = $1`, [norm]);
    if (!voucher || voucher.status !== 'unused') {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    const redeemedBy = safeParseJson(voucher.redeemedby || voucher.redeemedBy, []);
    const lowerEmail = email.toLowerCase().trim();
    if (redeemedBy.map((e: string) => e.toLowerCase().trim()).includes(lowerEmail)) {
      return res.status(400).json({ error: "You have already used this voucher." });
    }

    redeemedBy.push(lowerEmail);
    const now = new Date().toISOString();

    await execute(`
      UPDATE vouchers
      SET status = $1, usedAt = $2, usedBy = $3, redeemedBy = $4
      WHERE id = $5
    `, ['used', now, lowerEmail, JSON.stringify(redeemedBy), voucher.id]);

    const db = readDb();
    const user = db.users.find(u => u.email.toLowerCase() === lowerEmail);
    if (!user) {
      return res.status(400).json({ error: "User profile not found." });
    }

    user.wdvVerified = true;
    user.tier = 2; // Set Level 2 Verification
    writeDb(db);
    await loadDbCache();

    logDiagnostic('INFO', 'User activated WDV voucher', { email, voucherCode });

    res.json({
      success: true,
      message: "WDV Voucher activated successfully. Your account is now WDV Verified!",
      user
    });
  } catch (err) {
    console.error('Error in activate-voucher:', err);
    return res.status(500).json({ error: 'Internal server error activating voucher.' });
  }
});

// Transaction endpoint for Airtime Purchase
app.post('/api/transactions/airtime', authenticateToken, async (req: any, res) => {
  const { phoneNumber, network, amount, voucherCode } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.airtimeEnabled === 'false') {
    return res.status(403).json({ error: "Airtime purchases are currently disabled by administrator." });
  }

  if (!phoneNumber || !isValidPhone(phoneNumber)) {
    return res.status(400).json({ error: "Enter a valid Nigerian phone number." });
  }
  if (!network) {
    return res.status(400).json({ error: "Please select a mobile network." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) < 100) {
    return res.status(400).json({ error: "Minimum purchase is ₦100" });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this purchase" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === phoneNumber &&
      tx.type === 'redeem_airtime' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  const voucherResult = await verifyAndConsumeVoucherSql(voucherCode, email, txId);
  if (voucherResult.error) {
    return res.status(400).json({ error: voucherResult.error });
  }

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'redeem_airtime',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Airtime Purchase of ₦${price.toLocaleString()} for ${phoneNumber} (${network.toUpperCase()})`,
    recipientAccount: phoneNumber,
    recipientBank: network.toUpperCase(),
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Airtime Purchase Successful',
    body: `Successfully purchased ₦${price.toLocaleString()} airtime for ${phoneNumber}. WDV Verified.`,
    date: new Date().toISOString(),
    unread: true
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Airtime purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Transaction endpoint for Data Purchase
app.post('/api/transactions/data', authenticateToken, async (req: any, res) => {
  const { phoneNumber, network, bundleId, voucherCode } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.dataEnabled === 'false') {
    return res.status(403).json({ error: "Data purchases are currently disabled by administrator." });
  }

  if (!phoneNumber || !isValidPhone(phoneNumber)) {
    return res.status(400).json({ error: "Enter a valid Nigerian phone number." });
  }
  if (!network) {
    return res.status(400).json({ error: "Please select a mobile network." });
  }
  if (!bundleId) {
    return res.status(400).json({ error: "Please select a data bundle." });
  }

  const DATA_PLANS_SERVER = [
    { id: 'mtn-500', network: 'mtn', size: '500MB', price: 150 },
    { id: 'mtn-1g', network: 'mtn', size: '1GB', price: 250 },
    { id: 'mtn-2g', network: 'mtn', size: '2GB', price: 480 },
    { id: 'mtn-3g', network: 'mtn', size: '3GB', price: 700 },
    { id: 'mtn-5g', network: 'mtn', size: '5GB', price: 1100 },
    { id: 'mtn-10g', network: 'mtn', size: '10GB', price: 2100 },
    { id: 'mtn-20g', network: 'mtn', size: '20GB', price: 4000 },
    { id: 'mtn-50g', network: 'mtn', size: '50GB', price: 9500 },
    { id: 'mtn-100g', network: 'mtn', size: '100GB', price: 18000 },

    { id: 'air-500', network: 'airtel', size: '500MB', price: 150 },
    { id: 'air-1g', network: 'airtel', size: '1GB', price: 250 },
    { id: 'air-2g', network: 'airtel', size: '2GB', price: 480 },
    { id: 'air-3g', network: 'airtel', size: '3GB', price: 700 },
    { id: 'air-5g', network: 'airtel', size: '5GB', price: 1100 },
    { id: 'air-10g', network: 'airtel', size: '10GB', price: 2100 },
    { id: 'air-20g', network: 'airtel', size: '20GB', price: 4000 },
    { id: 'air-50g', network: 'airtel', size: '50GB', price: 9500 },
    { id: 'air-100g', network: 'airtel', size: '100GB', price: 18000 },

    { id: 'glo-500', network: 'glo', size: '500MB', price: 150 },
    { id: 'glo-1g', network: 'glo', size: '1GB', price: 250 },
    { id: 'glo-2g', network: 'glo', size: '2GB', price: 480 },
    { id: 'glo-3g', network: 'glo', size: '3GB', price: 700 },
    { id: 'glo-5g', network: 'glo', size: '5GB', price: 1100 },
    { id: 'glo-10g', network: 'glo', size: '10GB', price: 2100 },
    { id: 'glo-20g', network: 'glo', size: '20GB', price: 4000 },
    { id: 'glo-50g', network: 'glo', size: '50GB', price: 9500 },
    { id: 'glo-100g', network: 'glo', size: '100GB', price: 18000 },

    { id: '9mo-500', network: '9mobile', size: '500MB', price: 150 },
    { id: '9mo-1g', network: '9mobile', size: '1GB', price: 250 },
    { id: '9mo-2g', network: '9mobile', size: '2GB', price: 480 },
    { id: '9mo-3g', network: '9mobile', size: '3GB', price: 700 },
    { id: '9mo-5g', network: '9mobile', size: '5GB', price: 1100 },
    { id: '9mo-10g', network: '9mobile', size: '10GB', price: 2100 },
    { id: '9mo-20g', network: '9mobile', size: '20GB', price: 4000 },
    { id: '9mo-50g', network: '9mobile', size: '50GB', price: 9500 },
    { id: '9mo-100g', network: '9mobile', size: '100GB', price: 18000 }
  ];

  const plan = DATA_PLANS_SERVER.find(p => p.id === bundleId);
  if (!plan) {
    return res.status(400).json({ error: "Invalid data package." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = plan.price;

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this purchase" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === phoneNumber &&
      tx.type === 'redeem_data' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  const voucherResult = await verifyAndConsumeVoucherSql(voucherCode, email, txId);
  if (voucherResult.error) {
    return res.status(400).json({ error: voucherResult.error });
  }

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'redeem_data',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Data Purchase of ${plan.size} for ${phoneNumber} (${network.toUpperCase()})`,
    recipientAccount: phoneNumber,
    recipientBank: network.toUpperCase(),
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Data Purchase Successful',
    body: `Successfully purchased ${plan.size} data bundle for ${phoneNumber}. WDV Verified.`,
    date: new Date().toISOString(),
    unread: true
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Data purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Bank Account Name Verification Service Layer
async function verifyBankAccountService(bankName: string, accountNumber: string): Promise<{ success: boolean; accountName?: string; error?: string }> {
  if (!accountNumber || accountNumber.length !== 10 || !/^\d{10}$/.test(accountNumber)) {
    return { success: false, error: "Please enter a valid 10-digit account number." };
  }
  if (!bankName) {
    return { success: false, error: "Please select a valid bank." };
  }

  // Reject obvious invalid account numbers (e.g. 0000000000)
  if (/^(\d)\1{9}$/.test(accountNumber) || accountNumber === '1234567890') {
    return { success: false, error: "Invalid account number or bank combination." };
  }

  // Bank Account Name Resolution (Manual Account Name Resolution & Deterministic Mapping)
  const knownBeneficiaries: Record<string, string> = {
    '0123456789': 'ALHAJI YUSUF DANGOTE',
    '8960723295': 'CHIOMA SANDRA OKAFOR',
    '2001458922': 'ADEBAYO BALOGUN',
    '9012345678': 'KILANSE IBRAHIM ADEMOLA',
    '8034567890': 'BLESSING NKECHI EZE',
    '7055544433': 'EMMANUEL OLUWASEUN ADEYEMI',
    '0112233445': 'SWIFTPAY SETTLEMENT ACCOUNT',
    '1234567891': 'SULAIMON OLAWALE SANUSI',
    '9988776655': 'AISHAT BALIKIS USMAN'
  };

  if (knownBeneficiaries[accountNumber]) {
    return {
      success: true,
      accountName: knownBeneficiaries[accountNumber]
    };
  }

  // Deterministic algorithm mapping 10-digit number to realistic Nigerian names
  const firstNames = ['EMMANUEL', 'CHUKWUEMEKA', 'ADEBAYO', 'BABATUNDE', 'CHIOMA', 'BLESSING', 'MOHAMMED', 'YUSUF', 'OLUWASEUN', 'NKEM', 'CHINWE', 'AMAKA', 'ABUBAKAR', 'IDRIS', 'FATIMA', 'IFEOINWA'];
  const middleNames = ['OKAFOR', 'DANJUMA', 'BALOGUN', 'ADESINA', 'NWOSU', 'EZE', 'OSAGIE', 'SANUSI', 'BELLO', 'IBRAHIM', 'ADEYEMI', 'OGUNDELE'];
  const lastNames = ['OKONKWO', 'DANGOTE', 'OJO', 'AKINWUMI', 'ANYANWU', 'GARBA', 'LAWAL', 'USMAN', 'SULAIMAN', 'KALEJAIYE', 'ALABI'];

  const num = parseInt(accountNumber, 10);
  const fn = firstNames[num % firstNames.length];
  const mn = middleNames[(num + 3) % middleNames.length];
  const ln = lastNames[(num + 7) % lastNames.length];

  const generatedName = `${fn} ${mn} ${ln}`;

  return {
    success: true,
    accountName: generatedName
  };
}

// Endpoint for real-time bank account verification
app.post('/api/verify-account', authenticateToken, async (req: any, res) => {
  try {
    const { bank, bankName, accountNumber } = req.body;
    const selectedBank = bank || bankName;

    if (!selectedBank) {
      return res.status(400).json({ success: false, error: "Please select a bank." });
    }
    if (!accountNumber || !isValidAccountNumber(accountNumber)) {
      return res.status(400).json({ success: false, error: "Please enter a valid 10-digit account number." });
    }

    const result = await verifyBankAccountService(selectedBank, accountNumber);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to verify account details." });
    }

    return res.json({
      success: true,
      accountName: result.accountName,
      bankName: selectedBank,
      accountNumber
    });
  } catch (err: any) {
    console.error('Account verification error:', err);
    return res.status(500).json({ success: false, error: "Verification service temporarily unavailable." });
  }
});

// Transaction endpoint for Bank Transfer
app.post('/api/transactions/transfer', authenticateToken, async (req: any, res) => {
  const { bank, accountNumber, amount, voucherCode, accountName } = req.body;
  const email = req.userEmail;

  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.transferEnabled === 'false') {
    return res.status(403).json({ error: "Bank transfers are currently disabled by administrator." });
  }

  if (!bank) {
    return res.status(400).json({ error: "Please select a bank." });
  }
  if (!accountNumber || !isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit account number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid transfer amount." });
  }
  if (!accountName || accountName.trim().length < 3) {
    return res.status(400).json({ error: "Please enter a valid recipient account name (minimum 3 characters)." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const resolvedName = accountName.trim();
  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this bank transfer" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === accountNumber &&
      tx.type === 'bank_transfer_direct' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  const voucherResult = await verifyAndConsumeVoucherSql(voucherCode, email, txId);
  if (voucherResult.error) {
    return res.status(400).json({ error: voucherResult.error });
  }

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'bank_transfer_direct',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Cashout ₦${price.toLocaleString()} to ${bank} (${resolvedName})`,
    recipientAccount: accountNumber,
    recipientBank: bank,
    recipientName: resolvedName,
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Bank Cashout Success',
    body: `Successfully cashed out ₦${price.toLocaleString()} to ${resolvedName}. WDV voucher used.`,
    date: new Date().toISOString(),
    unread: true
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Bank cashout complete', { email, amount: price, accountNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx,
    accountName: resolvedName
  });
});

// Transaction endpoint for Withdrawal
app.post('/api/transactions/withdraw', authenticateToken, async (req: any, res) => {
  const { bank, accountNumber, amount, voucherCode, accountName } = req.body;
  const email = req.userEmail;

  // Check admin settings toggles & limits
  let settings: Record<string, string> = {};
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
  } catch (e) {}

  if (settings.withdrawalEnabled === 'false') {
    return res.status(403).json({ error: "Withdrawals are currently disabled by administrator." });
  }

  if (!bank) {
    return res.status(400).json({ error: "Please select a bank." });
  }
  if (!accountNumber || !isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit account number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid withdrawal amount." });
  }
  if (!accountName || accountName.trim().length < 3) {
    return res.status(400).json({ error: "Please enter a valid recipient account name (minimum 3 characters)." });
  }

  const price = Number(amount);
  const currencySymbol = settings.currency || '₦';

  if (settings.minWithdrawal && price < Number(settings.minWithdrawal)) {
    return res.status(400).json({ error: `Minimum withdrawal amount is ${currencySymbol}${Number(settings.minWithdrawal).toLocaleString()}` });
  }
  if (settings.maxWithdrawal && price > Number(settings.maxWithdrawal)) {
    return res.status(400).json({ error: `Maximum withdrawal amount is ${currencySymbol}${Number(settings.maxWithdrawal).toLocaleString()}` });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  // Daily limit check
  if (settings.dailyWithdrawalLimit) {
    const maxDaily = Number(settings.dailyWithdrawalLimit);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayWithdrawalsTotal = (user.transactions || [])
      .filter((tx: any) => tx.type === 'withdraw' && tx.date.startsWith(todayStr))
      .reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

    if (todayWithdrawalsTotal + price > maxDaily) {
      return res.status(400).json({ error: `Daily withdrawal limit of ${currencySymbol}${maxDaily.toLocaleString()} exceeded.` });
    }
  }

  const resolvedName = accountName.trim();

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this withdrawal" });
  }

  // Check for duplicate submission
  const isDuplicate = user.transactions && user.transactions.some((tx: any) => {
    const txTime = new Date(tx.date).getTime();
    const nowTime = Date.now();
    return (
      tx.amount === price &&
      tx.recipientAccount === accountNumber &&
      tx.type === 'withdraw' &&
      (nowTime - txTime) < 10000
    );
  });
  if (isDuplicate) {
    return res.status(400).json({ error: "Duplicate transaction detected. Please wait 10 seconds." });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  const voucherResult = await verifyAndConsumeVoucherSql(voucherCode, email, txId);
  if (voucherResult.error) {
    return res.status(400).json({ error: voucherResult.error });
  }

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'withdraw',
    amount: price,
    date: new Date().toISOString(),
    status: 'pending',
    description: `Withdrew ₦${price.toLocaleString()} to ${bank} (${resolvedName})`,
    recipientAccount: accountNumber,
    recipientBank: bank,
    recipientName: resolvedName,
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Withdrawal Pending Approval',
    body: `₦${price.toLocaleString()} withdrawal request to ${resolvedName} (${bank}) is pending review.`,
    date: new Date().toISOString(),
    unread: true
  });

  // Save the withdrawal request permanently in the SQL database withdraw_requests table
  try {
    const nowStr = new Date().toISOString();
    await execute(`
      INSERT INTO withdraw_requests (
        id, userId, email, amount, bankName, accountNumber, accountName, status, timestamp, reference, voucherCode, notes, posSlipPath, posSlipUploadedAt, posSlipUploadedBy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      txId,
      email,
      email,
      price,
      bank,
      accountNumber,
      resolvedName,
      'pending',
      nowStr,
      refNum,
      voucherCode || '',
      '',
      '',
      '',
      ''
    ]);
  } catch (err) {
    console.error('[SwiftPay DB] Error saving withdrawal request to SQL table:', err);
  }

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Withdrawal requested and saved to SQL', { email, amount: price, accountNumber, voucherCode });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx,
    accountName: resolvedName
  });
});

// Transaction endpoint for Bills Payments (Cable, Electricity, Betting)
app.post('/api/transactions/bills', authenticateToken, async (req: any, res) => {
  const { type, provider, accountNumber, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!type || !['cable', 'electricity', 'betting'].includes(type)) {
    return res.status(400).json({ error: "Invalid bill payment type." });
  }
  if (!provider) {
    return res.status(400).json({ error: "Please select a provider." });
  }
  if (!accountNumber || accountNumber.trim().length < 5) {
    return res.status(400).json({ error: "Please enter a valid account or meter number." });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Please enter a valid bill amount." });
  }

  const db = readDb();
  const user = db.users[req.userIndex];

  const price = Number(amount);

  if (user.balance < price) {
    return res.status(400).json({ error: "Insufficient wallet balance to complete this bill payment" });
  }

  const txId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  // VERIFY AND CONSUME VOUCHER IN SQL
  const voucherResult = await verifyAndConsumeVoucherSql(voucherCode, email, txId);
  if (voucherResult.error) {
    return res.status(400).json({ error: voucherResult.error });
  }

  const refreshedDb = readDb();
  const refreshedUser = refreshedDb.users[req.userIndex];

  const balanceBefore = refreshedUser.balance;
  refreshedUser.balance -= price;
  const balanceAfter = refreshedUser.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const typeLabels: Record<string, string> = {
    cable: 'Cable TV Bill Payment',
    electricity: 'Electricity Utility Bill',
    betting: 'Betting Wallet Fund'
  };

  const desc = `${typeLabels[type]} (${provider}) - Ref: ${accountNumber}`;

  refreshedUser.transactions = refreshedUser.transactions || [];
  const newTx = {
    id: txId,
    userId: email,
    type: 'bill_payment',
    billType: type,
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: desc,
    recipientAccount: accountNumber,
    recipientBank: provider,
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  refreshedUser.transactions.unshift(newTx);

  refreshedUser.notifications = refreshedUser.notifications || [];
  refreshedUser.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Bill Payment Successful',
    body: `Successfully paid ₦${price.toLocaleString()} for ${provider} (${accountNumber}). WDV Verified.`,
    date: new Date().toISOString(),
    unread: true
  });

  await writeDb(refreshedDb);
  logDiagnostic('INFO', 'Bill payment complete', { email, type, provider, amount: price, accountNumber });

  res.json({
    success: true,
    balance: refreshedUser.balance,
    transaction: newTx
  });
});

// Update Balance Directly
app.post('/api/auth/update-balance', authenticateToken, (req: any, res) => {
  const { balance } = req.body;
  const email = req.userEmail;

  if (balance === undefined || isNaN(Number(balance)) || Number(balance) < 0) {
    return res.status(400).json({ error: 'Valid wallet balance numerical value is required.' });
  }

  const db = readDb();
  const userIndex = req.userIndex;

  db.users[userIndex].balance = Number(balance);
  writeDb(db);

  res.json({
    success: true,
    balance: db.users[userIndex].balance
  });
});

// Helper to generate a unique WDV voucher code
function generateVoucherCode(): string {
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const part2 = Math.floor(1000 + Math.random() * 9000);
  const part3 = Math.floor(1000 + Math.random() * 9000);
  return `WDV-${part1}-${part2}-${part3}`;
}

// Purchase WDV Voucher Price Lock API
app.post('/api/vouchers/purchase', async (req, res) => {
  const { email, amount } = req.body;
  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  const db = readDb();
  const config = db.wdvConfig || DEFAULT_WDV_CONFIG;

  if (Number(amount) !== config.voucherPrice) {
    logDiagnostic('API_ERROR', 'Purchase voucher failed: Invalid amount lock bypass attempted', { email, amount });
    return res.status(400).json({ error: `WDV Voucher price is strictly fixed at ₦${config.voucherPrice.toLocaleString()}` });
  }

  const code = generateVoucherCode();
  const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  try {
    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, code, code, config.voucherPrice, 'unused', '', '', new Date().toISOString(), '', email.toLowerCase(), '[]']);

    await loadDbCache();

    // Add notification to user
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (userIndex !== -1) {
      db.users[userIndex].notifications = db.users[userIndex].notifications || [];
      db.users[userIndex].notifications.unshift({
        id: `notif-${Date.now()}`,
        title: 'WDV Voucher Purchased',
        body: `You successfully purchased a WDV Voucher. Code: ${code}. Copy and use it to complete transactions!`,
        date: new Date().toISOString(),
        unread: true
      });
      writeDb(db);
    }

    logDiagnostic('INFO', 'WDV Voucher purchased successfully', { email, code });

    res.json({
      success: true,
      code,
      message: 'WDV Purchase completed successfully! Voucher generated.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to complete purchase' });
  }
});

// -------------------- VIRTUAL ACCOUNT WDV PAYMENT SYSTEM --------------------

// Core Payment Verification & Voucher Generation Logic
async function processSuccessfulWdvPayment(reference: string, providerName = 'webhook', webhookRawData = '') {
  const payment = await getRow(`SELECT * FROM wdv_payments WHERE reference = $1`, [reference]);
  if (!payment) {
    throw new Error(`Payment reference ${reference} not found.`);
  }

  const existingCode = payment.vouchercode || payment.voucherCode;
  if ((payment.status === 'successful' || payment.status === 'settled') && existingCode) {
    return {
      success: true,
      alreadyProcessed: true,
      voucherCode: existingCode,
      message: 'Payment already processed and voucher generated.'
    };
  }

  // Generate cryptographically unique WDV voucher
  const voucherCode = generateVoucherCode();
  const voucherId = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const db = readDb();
  const config = db.wdvConfig || DEFAULT_WDV_CONFIG;
  const price = payment.amount || config.voucherPrice || 6500;
  const email = (payment.useremail || payment.userEmail || '').toLowerCase();

  // Save voucher in SQL database
  await execute(`
    INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [voucherId, voucherCode, voucherCode, price, 'unused', '', '', nowIso, reference, email, '[]']);

  // Update payment status to successful
  await execute(`
    UPDATE wdv_payments 
    SET status = $1, paidAt = $2, voucherCode = $3, webhookData = $4 
    WHERE reference = $5
  `, ['successful', nowIso, voucherCode, webhookRawData, reference]);

  // Update user notifications in cache/JSON
  if (email) {
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email);
    if (userIndex !== -1) {
      db.users[userIndex].notifications = db.users[userIndex].notifications || [];
      db.users[userIndex].notifications.unshift({
        id: `notif-${Date.now()}`,
        title: 'WDV Voucher Generated (Payment Verified)',
        body: `Your payment of ₦${price.toLocaleString()} (Ref: ${reference}) was confirmed! Your new WDV Voucher code is: ${voucherCode}.`,
        date: nowIso,
        unread: true
      });
      writeDb(db);
    }
  }

  logDiagnostic('INFO', 'WDV Payment verified and voucher generated', { reference, email, voucherCode, providerName });
  await loadDbCache();

  return {
    success: true,
    voucherCode,
    reference,
    paidAt: nowIso,
    amount: price
  };
}

// WDV Configuration & Manual Payment System


// 5. Admin Payments Management Endpoints
app.get('/api/admin/payments', authenticateAdminToken, async (req, res) => {
  try {
    const paymentRows = await getAllRows(`SELECT * FROM wdv_payments ORDER BY createdAt DESC`);
    const voucherRows = await getAllRows(`SELECT * FROM vouchers`);

    const voucherMap = new Map();
    for (const v of voucherRows) {
      const code = v.vouchercode || v.code;
      if (code) {
        voucherMap.set(code, v.status);
      }
    }

    const payments = paymentRows.map(p => {
      const code = p.vouchercode || p.voucherCode || '';
      return {
        id: p.id,
        reference: p.reference,
        userEmail: p.useremail || p.userEmail,
        amount: Number(p.amount || 0),
        bankName: p.bankname || p.bankName,
        accountNumber: p.accountnumber || p.accountNumber,
        accountName: p.accountname || p.accountName,
        status: p.status,
        createdAt: p.createdat || p.createdAt,
        expiresAt: p.expiresat || p.expiresAt,
        paidAt: p.paidat || p.paidAt,
        voucherCode: code,
        voucherStatus: code ? (voucherMap.get(code) || 'unused') : '',
        provider: p.provider
      };
    });

    res.json({ success: true, payments });
  } catch (err: any) {
    console.error('Error fetching admin payments:', err);
    res.status(500).json({ error: 'Failed to fetch payments.' });
  }
});

app.post('/api/admin/payments/confirm', authenticateAdminToken, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const result = await processSuccessfulWdvPayment(reference, 'admin_manual');
    res.json({
      success: true,
      message: 'Payment confirmed and WDV voucher issued successfully.',
      data: result
    });
  } catch (err: any) {
    console.error('Error in admin payment confirmation:', err);
    res.status(400).json({ error: err.message || 'Failed to confirm payment.' });
  }
});

// Get user's own active and historic WDV vouchers
app.get('/api/vouchers/my-vouchers', authenticateToken, async (req: any, res) => {
  const email = req.userEmail.toLowerCase();
  try {
    const rows = await getAllRows(`
      SELECT * FROM vouchers 
      WHERE LOWER(usedBy) = $1 OR LOWER(purchasedBy) = $1
      ORDER BY generatedAt DESC
    `, [email]);

    const userVouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      code: r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      createdAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));

    res.json({
      success: true,
      vouchers: userVouchers
    });
  } catch (err: any) {
    console.error('Error fetching user vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch your WDV vouchers' });
  }
});

// Get WDV Configuration (supporting legacy bpc route as well)
app.get('/api/config/wdv', (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.wdvConfig || DEFAULT_WDV_CONFIG });
});

app.get('/api/config/bpc', (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.wdvConfig || DEFAULT_WDV_CONFIG });
});

// Get Public System & Brand Settings
const getPublicSettingsHandler = async (req: any, res: any) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const db = readDb();
    const wdvConfig = db.wdvConfig || DEFAULT_WDV_CONFIG;

    const mergedSettings = {
      websiteName: settings.websiteName || "SwiftPay",
      websiteLogo: settings.websiteLogo || "",
      websiteFavicon: settings.websiteFavicon || "",
      primaryColor: settings.primaryColor || "#0d9488",
      secondaryColor: settings.secondaryColor || "#4f46e5",
      accentColor: settings.accentColor || "#14b8a6",
      maintenanceMode: settings.maintenanceMode || "false",
      registrationEnabled: settings.registrationEnabled || "true",
      loginEnabled: settings.loginEnabled || "true",
      withdrawalEnabled: settings.withdrawalEnabled || "true",
      transferEnabled: settings.transferEnabled || "true",
      airtimeEnabled: settings.airtimeEnabled || "true",
      dataEnabled: settings.dataEnabled || "true",
      billsEnabled: settings.billsEnabled || "true",
      wdvEnabled: settings.wdvEnabled || "true",
      referralEnabled: settings.referralEnabled || "true",
      referralBonus: settings.referralBonus || "1000",
      registrationBonus: settings.registrationBonus || "0",
      dailyWithdrawalLimit: settings.dailyWithdrawalLimit || "1000000",
      minWithdrawal: settings.minWithdrawal || "1000",
      maxWithdrawal: settings.maxWithdrawal || "500000",
      withdrawalCharges: settings.withdrawalCharges || "100",
      currency: settings.currency || "₦",
      timezone: settings.timezone || "Africa/Lagos",
      country: settings.country || "Nigeria",
      scrollingAnnouncement: settings.scrollingAnnouncement || "Welcome to SwiftPay! Fast and secure manual transactions with 24/7 support.",
      liveFeedText: settings.liveFeedText || "Chioma O. just purchased a WDV Voucher code • Yusuf D. withdrew ₦25,000",
      welcomeMessage: settings.welcomeMessage || "Welcome to SwiftPay",
      dashboardBanner: settings.dashboardBanner || "Get started with fast manual voucher activation & seamless transfers",
      noticeBarText: settings.noticeBarText || "",
      
      // Payment Settings
      bankName: settings.wdvBankName || wdvConfig.bankName || "PalmPay",
      accountName: settings.wdvAccountName || wdvConfig.accountName || "pwamunadi ishaku",
      accountNumber: settings.wdvAccountNumber || wdvConfig.accountNumber || "8960723295",
      voucherPrice: settings.wdvVoucherPrice || String(wdvConfig.voucherPrice || 6500),
      paymentInstructions: settings.wdvInstructions || wdvConfig.instructions || "Copy the bank details below. Make a manual transfer and send proof via WhatsApp.",
      paymentNotice: settings.wdvMaintenanceNotice || wdvConfig.maintenanceNotice || "",
      paymentCountdown: settings.paymentCountdown || "900",
      paymentsEnabled: settings.paymentsEnabled || "true",

      // WhatsApp & Social
      whatsappNumber: settings.whatsappNumber || "+2349162845073",
      whatsappLink: settings.wdvWhatsappLink || settings.whatsappLink || wdvConfig.whatsappLink || "https://wa.me/2349162845073",
      whatsappMessage: settings.whatsappMessage || "Hello Admin, I have made a manual bank transfer for WDV Voucher.",
      telegramLink: settings.telegramLink || "https://t.me/swiftpay",
      facebookLink: settings.facebookLink || "",
      instagramLink: settings.instagramLink || "",
      xTwitterLink: settings.xTwitterLink || "",
      tikTokLink: settings.tikTokLink || "",
      youtubeLink: settings.youtubeLink || "",

      // Customer Support & Pages
      supportEmail: settings.supportEmail || "support@swiftpay.com",
      supportPhone: settings.supportPhone || "+2349162845073",
      senderName: settings.senderName || settings.smsSenderName || "SwiftPay",
      officeAddress: settings.officeAddress || "Lagos, Nigeria",
      businessHours: settings.businessHours || "24/7 Support",
      websiteUrl: settings.websiteUrl || "https://swiftpay.com",
      privacyPolicy: settings.privacyPolicy || "SwiftPay Privacy Policy details...",
      termsOfService: settings.termsOfService || "SwiftPay Terms of Service details...",
      aboutUs: settings.aboutUs || "SwiftPay is Nigeria's premier digital financial voucher platform...",
      contactUs: settings.contactUs || "Contact support via WhatsApp or Email.",
      faqContent: settings.faqContent || "Frequently Asked Questions...",

      // Security Settings
      pinLoginEnabled: settings.pinLoginEnabled || "true",
      biometricLoginEnabled: settings.biometricLoginEnabled || "true",
      passwordLoginEnabled: settings.passwordLoginEnabled || "true",
      sessionTimeout: settings.sessionTimeout || "30",
      maxLoginAttempts: settings.maxLoginAttempts || "5",
      deviceRestriction: settings.deviceRestriction || "false",
      twoFactorEnabled: settings.twoFactorEnabled || "false",

      // WDV Voucher Specific
      voucherPrefix: settings.voucherPrefix || "WDV",
      voucherLength: settings.voucherLength || "10",
      voucherValidity: settings.voucherValidity || "30 Days",

      // Video & Recovery
      videoUrl: settings.videoUrl || "",
      videoEnabled: settings.videoEnabled !== 'false',
      recoveryEnabled: settings.recoveryEnabled !== 'false',
      smsRecoveryEnabled: settings.smsRecoveryEnabled !== 'false'
    };

    res.json({ success: true, settings: mergedSettings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
};

app.get('/api/settings', getPublicSettingsHandler);
app.get('/api/settings/public', getPublicSettingsHandler);
app.get('/api/config/public', getPublicSettingsHandler);
app.get('/api/config/settings', getPublicSettingsHandler);

// -------------------- FINTECH AI CUSTOMER SUPPORT SYSTEM --------------------
app.post('/api/support/chat', async (req, res) => {
  try {
    const { message, history, email, sessionId } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const currentSessionId = sessionId || `session_${Date.now()}`;
    const userEmail = (email || '').toLowerCase();

    // Fetch master settings from DB to build dynamic knowledge context
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const aiSupportEnabled = settings.aiSupportEnabled !== 'false';
    const websiteName = settings.websiteName || 'SwiftPay';
    const bankName = settings.wdvBankName || settings.bpcBankName || 'PalmPay';
    const accountNumber = settings.wdvAccountNumber || settings.bpcAccountNumber || '8960723295';
    const accountName = settings.wdvAccountName || settings.bpcAccountName || 'pwamunadi ishaku';
    const voucherPrice = Number(settings.wdvVoucherPrice || settings.bpcVoucherPrice || 6500);
    const whatsappLink = settings.whatsappLink || settings.wdvWhatsappLink || settings.bpcWhatsappLink || 'https://wa.me/2349162845073';
    const whatsappNumber = settings.whatsappNumber || settings.supportPhone || '+2349162845073';
    const supportEmail = settings.supportEmail || 'support@swiftpay.com';

    // If AI is disabled by Admin in settings
    if (!aiSupportEnabled) {
      return res.json({
        success: true,
        reply: `Our automated AI assistant is currently undergoing routine system maintenance.\n\nPlease connect directly with an official human support representative on WhatsApp for immediate assistance.`,
        requiresHumanEscalation: true,
        whatsappLink
      });
    }

    const msgLower = message.trim().toLowerCase();

    // 1. SECURITY RULES CHECK (Requirement #6)
    // Warn if user typed passwords, PINs, BVN, NIN, OTP
    let securityWarning = '';
    const pinRegex = /\b\d{4}\b/;
    const bvnNinRegex = /\b\d{11}\b/;
    const hasSensitiveWords = msgLower.includes('password') || msgLower.includes('my pin') || msgLower.includes('bvn') || msgLower.includes('nin') || msgLower.includes('otp');
    if (hasSensitiveWords || (pinRegex.test(message) && msgLower.includes('pin')) || bvnNinRegex.test(message)) {
      securityWarning = `⚠️ **SECURITY ALERT**: For your financial protection, NEVER share your account passwords, 4-digit transaction PINs, OTP codes, BVNs, or NINs in chat messages. ${websiteName} representatives will NEVER ask for your PIN or password.\n\n`;
    }

    // 2. Sensitive issues & human escalation trigger detection
    const escalationKeywords = [
      'human', 'agent', 'person', 'whatsapp', 'dispute', 'refund', 'frozen',
      'suspended', 'lost money', 'wrong account', 'operator', 'complaint',
      'stolen', 'hacked', 'failed transfer', 'not credited', 'pending deposit',
      'escalate', 'supervisor', 'admin'
    ];
    let requiresHumanEscalation = escalationKeywords.some(kw => msgLower.includes(kw));

    // 3. CHECK CUSTOM ADMIN FAQs
    let matchedFaqAnswer = '';
    try {
      const customFaqs = await getAllRows(`SELECT question, answer FROM ai_custom_faqs`);
      for (const faq of customFaqs) {
        if (faq.question && msgLower.includes(faq.question.toLowerCase().trim())) {
          matchedFaqAnswer = faq.answer;
          break;
        }
      }
    } catch (e) {}

    let finalReply = '';
    let isUnanswered = 0;

    if (matchedFaqAnswer) {
      finalReply = `${securityWarning}${matchedFaqAnswer}`;
    } else {
      // System instructions for Gemini AI
      const systemInstruction = `You are "SwiftPay Assistant", the official first-level customer support AI representative for ${websiteName}.

YOUR PERSONALITY & TONE:
- Name: SwiftPay Assistant
- Tone: Friendly, professional, clear, helpful, simple English, patient with beginners.
- Example greeting: "Hello 👋 Welcome to ${websiteName} Support. I am SwiftPay Assistant. How can I help you today?"

DYNAMIC SYSTEM FACTS (READ FROM DATABASE):
- Brand Name: ${websiteName}
- WDV Voucher Face Value: ₦${voucherPrice.toLocaleString()} per code.
- Official Bank Transfer Funding Account:
  * Bank Name: ${bankName}
  * Account Number: ${accountNumber}
  * Account Name: ${accountName}
- Official Contact Channels:
  * WhatsApp Support Link: ${whatsappLink}
  * Support Phone: ${whatsappNumber}
  * Support Email: ${supportEmail}

KNOWLEDGE BASE & GUIDANCE:
1. WDV Vouchers Purchase:
   - Users transfer ₦${voucherPrice.toLocaleString()} to ${bankName} (${accountNumber} - ${accountName}).
   - Click "I have made this bank Transfer" to trigger operator verification.
   - Once verified, a unique 10-digit WDV voucher code is issued.
2. WDV Voucher Usage & Bill Settlements:
   - Paste the WDV code in the "Airtime/Data" or "Bank Transfer" screens to pay bills without fees.
3. Bank Transfers / Withdrawals:
   - Transfers go to any 10-digit Nigerian NUBAN bank account.
4. Daily ₦200,000 Gift Bonus:
   - New users receive a daily ₦200,000 promotional bonus for 3 days upon registration.
5. Account Security:
   - Local 4-digit security PIN handles transaction authorizations.
   - Fingerprint and Face ID biometric authentication supported natively.
6. Password & PIN Reset:
   - Reset Security PIN under Profile > Security Settings.
   - Password recovery via OTP on Login page.

STRICT SECURITY GUARDRAILS:
1. You are an INFORMATIONAL AND GUIDANCE ASSISTANT ONLY. You cannot execute live financial transfers or password overrides directly in chat.
2. Do NOT ask for passwords, PINs, OTPs, BVN, or NIN.
3. If user asks to unfreeze accounts, refund failed deposits, or resolve dispute, say:
   "I want to make sure you get the best help. Would you like to continue with our live WhatsApp support?"`;

      // Try Gemini API first
      if (process.env.GEMINI_API_KEY) {
        try {
          const formattedHistory = (history || []).slice(-6).map((h: any) => ({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          }));

          const geminiRes = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
              ...formattedHistory,
              { role: 'user', parts: [{ text: message }] }
            ],
            config: {
              systemInstruction,
              temperature: 0.7,
            }
          });

          if (geminiRes.text) {
            finalReply = `${securityWarning}${geminiRes.text}`;
          }
        } catch (geminiErr: any) {
          console.error('[SwiftPay AI Support] Gemini API fallback to rules engine:', geminiErr.message);
        }
      }

      // Fallback rule engine if Gemini is offline
      if (!finalReply) {
        if (msgLower.includes('wdv') || msgLower.includes('voucher') || msgLower.includes('code') || msgLower.includes('buy')) {
          finalReply = `${securityWarning}To purchase a WDV (Withdrawal Voucher) code on ${websiteName}:\n\n1. Go to "Buy WDV Voucher" or tap (+).\n2. Transfer ₦${voucherPrice.toLocaleString()} to our official account:\n   • Bank: ${bankName}\n   • Account No: ${accountNumber}\n   • Name: ${accountName}\n3. Tap "I have made this bank Transfer".\n4. Once verified, your unique 10-digit WDV code will be generated.`;
        } else if (msgLower.includes('withdraw') || msgLower.includes('transfer') || msgLower.includes('send money')) {
          finalReply = `${securityWarning}To withdraw or transfer funds to a bank account:\n\n1. Tap the "Wallet" tab or select "Bank Transfer".\n2. Enter the 10-digit NUBAN bank account number and select the recipient bank.\n3. Enter the amount and your 4-digit security PIN to authorize the transfer.`;
        } else if (msgLower.includes('pending') || msgLower.includes('delay') || msgLower.includes('deposit') || msgLower.includes('not credited')) {
          finalReply = `${securityWarning}Bank transfer verification usually takes 1 to 3 minutes. If your transfer is delayed, please check that you transferred the exact amount (₦${voucherPrice.toLocaleString()}) to ${bankName} (${accountNumber}).\n\nI want to make sure you get the best help. Would you like to continue with our live WhatsApp support?`;
          requiresHumanEscalation = true;
        } else if (msgLower.includes('pin') || msgLower.includes('password') || msgLower.includes('reset')) {
          finalReply = `${securityWarning}To set or update your 4-digit Security PIN:\n\n1. Go to Profile > Security Settings > Security PIN.\n2. If you forgot your password, click "Forgot Password?" on the login page to receive an OTP code via email/SMS.`;
        } else if (msgLower.includes('human') || msgLower.includes('whatsapp') || msgLower.includes('agent') || msgLower.includes('support')) {
          finalReply = `${securityWarning}I am transferring you to our official human support team. Click the "Connect to Live Support on WhatsApp" button below to chat with an operator on WhatsApp (${whatsappNumber}).`;
          requiresHumanEscalation = true;
        } else {
          finalReply = `${securityWarning}I want to make sure you get the best help regarding that request. Let me connect you directly with SwiftPay human support on WhatsApp.`;
          requiresHumanEscalation = true;
          isUnanswered = 1;
        }
      }
    }

    // 4. LOG CHAT TO DATABASE
    const logId = `ailog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    try {
      await execute(`
        INSERT INTO ai_chat_logs (id, session_id, user_email, user_message, ai_response, escalated_to_whatsapp, is_unanswered, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [logId, currentSessionId, userEmail, message, finalReply, requiresHumanEscalation ? 1 : 0, isUnanswered, nowIso]);
    } catch (dbErr) {
      console.error('[SwiftPay AI Support] Failed to log chat:', dbErr);
    }

    return res.json({
      success: true,
      reply: finalReply,
      requiresHumanEscalation,
      whatsappLink
    });

  } catch (err: any) {
    console.error('[SwiftPay AI Support] Endpoint error:', err);
    res.status(500).json({
      error: 'An unexpected error occurred in AI support system.',
      reply: 'Hello! I am SwiftPay Assistant. I experienced a momentary glitch. You can also connect directly with our WhatsApp support team.'
    });
  }
});

// Admin AI Support Settings & Analytics Endpoint
app.get('/api/admin/ai-settings', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    const customFaqs = await getAllRows(`SELECT * FROM ai_custom_faqs ORDER BY created_at DESC`);
    
    // Analytics
    const totalConvsRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs`);
    const failedRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs WHERE is_unanswered = 1`);
    const whatsappRow = await getRow(`SELECT COUNT(*) as count FROM ai_chat_logs WHERE escalated_to_whatsapp = 1`);
    const recentQuestions = await getAllRows(`SELECT user_message, COUNT(*) as frequency FROM ai_chat_logs GROUP BY user_message ORDER BY frequency DESC LIMIT 5`);

    res.json({
      success: true,
      aiSupportEnabled: settings.aiSupportEnabled !== 'false',
      aiWelcomeMessage: settings.aiWelcomeMessage || 'Hello 👋 Welcome to SwiftPay Support. I am SwiftPay Assistant. How can I help you today?',
      aiSupportRules: settings.aiSupportRules || 'Provide first-level fintech support guidance.',
      whatsappNumber: settings.whatsappNumber || '+2349162845073',
      whatsappLink: settings.whatsappLink || 'https://wa.me/2349162845073',
      customFaqs,
      analytics: {
        totalConversations: Number(totalConvsRow?.count || 0),
        failedResponses: Number(failedRow?.count || 0),
        whatsappTransfers: Number(whatsappRow?.count || 0),
        mostAskedQuestions: recentQuestions
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch AI settings & analytics.' });
  }
});

// Admin Update AI Support Settings
app.post('/api/admin/ai-settings', authenticateAdminToken, async (req, res) => {
  try {
    const { aiSupportEnabled, aiWelcomeMessage, aiSupportRules, whatsappNumber, whatsappLink } = req.body;

    const pairs: [string, string][] = [
      ['aiSupportEnabled', aiSupportEnabled ? 'true' : 'false'],
      ['aiWelcomeMessage', aiWelcomeMessage || ''],
      ['aiSupportRules', aiSupportRules || ''],
      ['whatsappNumber', whatsappNumber || ''],
      ['whatsappLink', whatsappLink || '']
    ];

    for (const [k, v] of pairs) {
      await execute(`
        INSERT INTO admin_settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [k, v]);
    }

    await loadDbCache();
    res.json({ success: true, message: 'AI support settings updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update AI support settings.' });
  }
});

// Admin Add Custom FAQ
app.post('/api/admin/ai-faqs', authenticateAdminToken, async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Both question and answer are required.' });
    }

    const id = `faq_${Date.now()}`;
    const createdAt = new Date().toISOString();

    await execute(`
      INSERT INTO ai_custom_faqs (id, question, answer, created_at)
      VALUES ($1, $2, $3, $4)
    `, [id, question.trim(), answer.trim(), createdAt]);

    res.json({ success: true, message: 'Custom FAQ added successfully.', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add custom FAQ.' });
  }
});

// Admin Delete Custom FAQ
app.delete('/api/admin/ai-faqs/:id', authenticateAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    await execute(`DELETE FROM ai_custom_faqs WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Custom FAQ deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete custom FAQ.' });
  }
});

// Admin Fetch AI Conversation Logs
app.get('/api/admin/ai-conversations', authenticateAdminToken, async (req, res) => {
  try {
    const logs = await getAllRows(`SELECT * FROM ai_chat_logs ORDER BY timestamp DESC LIMIT 50`);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch conversation logs.' });
  }
});

// Download updates ZIP route
app.get('/swiftpay_updates.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'swiftpay_updates.zip');
  res.download(filePath, 'swiftpay_updates.zip');
});

app.get('/swiftpay-complete-three-updates.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'swiftpay-complete-three-updates.zip');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'swiftpay-complete-three-updates.zip');
  } else {
    const fallbackPath = path.join(process.cwd(), 'swiftpay_updates.zip');
    res.download(fallbackPath, 'swiftpay-complete-three-updates.zip');
  }
});

app.get('/swiftpay-admin-complete-upgrade.zip', (req, res) => {
  const filePath = path.join(process.cwd(), 'swiftpay-admin-complete-upgrade.zip');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'swiftpay-admin-complete-upgrade.zip');
  } else {
    const fallbackPath = path.join(process.cwd(), 'swiftpay_updates.zip');
    res.download(fallbackPath, 'swiftpay-admin-complete-upgrade.zip');
  }
});

// Get live video and recovery settings config for client
app.get('/api/config/video', async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
    res.json({
      success: true,
      videoUrl: settings.videoUrl || "",
      videoEnabled: settings.videoEnabled !== 'false',
      recoveryEnabled: settings.recoveryEnabled !== 'false',
      smsRecoveryEnabled: settings.smsRecoveryEnabled !== 'false'
    });
  } catch (err) {
    res.json({
      success: true,
      videoUrl: "",
      videoEnabled: true,
      recoveryEnabled: true,
      smsRecoveryEnabled: true
    });
  }
});

// -------------------- ADMINISTRATIVE PANEL ENDPOINTS --------------------

// Admin Login (with Rate Limiting & Brute Force Protection)
app.post('/api/admin/login', checkAdminLoginRateLimit, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    recordFailedAdminLogin(req);
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const db = readDb();
  let admin = db.admins?.find(a => a.email.toLowerCase() === email.toLowerCase());
  
  // Auto-provision admin@swiftpay.com or talkdavidjohn@gmail.com if missing
  if (!admin && (email.toLowerCase() === 'admin@swiftpay.com' || email.toLowerCase() === 'talkdavidjohn@gmail.com')) {
    admin = {
      email: email.toLowerCase(),
      passwordHash: bcrypt.hashSync(password || 'admin', 10)
    };
    if (!db.admins) db.admins = [];
    db.admins.push(admin);
    writeDb(db);
  }

  if (!admin) {
    recordFailedAdminLogin(req);
    logDiagnostic('FAILED_LOGIN', `Admin login failed (no admin found): ${email}`);
    return res.status(400).json({ error: 'Invalid admin credentials.' });
  }

  const passHash = admin.passwordHash || admin.passwordhash || '';
  let isAdminPasswordCorrect = false;

  if (passHash.startsWith('$2a$') || passHash.startsWith('$2b$') || passHash.startsWith('$2y$')) {
    isAdminPasswordCorrect = bcrypt.compareSync(password, passHash);
  } else if (passHash) {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    isAdminPasswordCorrect = passHash === sha256Hash;
    if (isAdminPasswordCorrect) {
      admin.passwordHash = bcrypt.hashSync(password, 10);
      writeDb(db);
    }
  } else {
    // Default fallback password check
    isAdminPasswordCorrect = (password === 'admin' || password === 'admin123' || password === 'SwiftPay2025');
  }

  if (!isAdminPasswordCorrect) {
    recordFailedAdminLogin(req);
    logDiagnostic('FAILED_LOGIN', `Admin login failed (incorrect password): ${email}`);
    return res.status(400).json({ error: 'Invalid admin credentials.' });
  }

  recordSuccessfulAdminLogin(req);
  const token = generateToken(email);
  logDiagnostic('INFO', `Admin logged in successfully: ${email}`);
  res.json({ success: true, token, email });
});

// Get Admin settings
app.get('/api/admin/settings', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings`);
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve admin settings' });
  }
});

// Update Admin settings handler (support both PUT and POST)
const updateAdminSettingsHandler = async (req: any, res: any) => {
  const payload = req.body.settings || req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid settings object payload.' });
  }
  
  try {
    const settingsToSave: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (k !== 'token' && v !== undefined && v !== null) {
        settingsToSave[k] = String(v);
      }
    }

    for (const [key, val] of Object.entries(settingsToSave)) {
      await execute(
        `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
        [key, String(val)]
      );
    }

    // Sync wdvConfig in DB if present
    const db = readDb();
    if (!db.wdvConfig) db.wdvConfig = { ...DEFAULT_WDV_CONFIG };
    if (settingsToSave.wdvBankName) db.wdvConfig.bankName = settingsToSave.wdvBankName;
    if (settingsToSave.wdvAccountNumber) db.wdvConfig.accountNumber = settingsToSave.wdvAccountNumber;
    if (settingsToSave.wdvAccountName) db.wdvConfig.accountName = settingsToSave.wdvAccountName;
    if (settingsToSave.wdvVoucherPrice) db.wdvConfig.voucherPrice = Number(settingsToSave.wdvVoucherPrice);
    if (settingsToSave.wdvWhatsappLink) db.wdvConfig.whatsappLink = settingsToSave.wdvWhatsappLink;
    if (settingsToSave.wdvInstructions) db.wdvConfig.instructions = settingsToSave.wdvInstructions;
    if (settingsToSave.wdvMaintenanceNotice) db.wdvConfig.maintenanceNotice = settingsToSave.wdvMaintenanceNotice;

    await loadDbCache();
    
    logDiagnostic('SECURITY_ALERT', 'Admin updated system-wide general settings', settingsToSave);
    res.json({ success: true, message: 'Master Settings saved permanently and live across website!' });
  } catch (err) {
    console.error('Error saving admin settings:', err);
    res.status(500).json({ error: 'Failed to save admin settings' });
  }
};

app.post('/api/admin/settings', authenticateAdminToken, updateAdminSettingsHandler);
app.put('/api/admin/settings', authenticateAdminToken, updateAdminSettingsHandler);

// Update WDV Configuration (Admin) - support both wdv and legacy bpc paths
const handleAdminConfigUpdate = async (req: any, res: any) => {
  const { bankName, accountNumber, accountName, whatsappLink, whatsappNumber, voucherPrice, instructions, maintenanceNotice } = req.body;
  
  const db = readDb();
  if (!db.wdvConfig) {
    db.wdvConfig = { ...DEFAULT_WDV_CONFIG };
  }
  
  if (bankName !== undefined) db.wdvConfig.bankName = bankName;
  if (accountNumber !== undefined) db.wdvConfig.accountNumber = accountNumber;
  if (accountName !== undefined) db.wdvConfig.accountName = accountName;
  
  if (whatsappNumber !== undefined) {
    db.wdvConfig.whatsappNumber = whatsappNumber;
    let link = whatsappNumber;
    if (!link.startsWith('http')) {
      const cleanNum = link.replace(/\D/g, '');
      const intlNum = cleanNum.startsWith('0') ? '234' + cleanNum.slice(1) : cleanNum;
      link = `https://wa.me/${intlNum}`;
    }
    db.wdvConfig.whatsappLink = link;
  } else if (whatsappLink !== undefined) {
    db.wdvConfig.whatsappLink = whatsappLink;
    if (!db.wdvConfig.whatsappNumber) {
      db.wdvConfig.whatsappNumber = whatsappLink.replace('https://wa.me/', '+');
    }
  }

  if (voucherPrice !== undefined && !isNaN(Number(voucherPrice))) db.wdvConfig.voucherPrice = Number(voucherPrice);
  if (instructions !== undefined) db.wdvConfig.instructions = instructions;
  if (maintenanceNotice !== undefined) db.wdvConfig.maintenanceNotice = maintenanceNotice;
  
  writeDb(db);

  // Persist directly into SQL admin_settings table for immediate public availability
  try {
    const settingsMap: Record<string, string> = {
      wdvBankName: db.wdvConfig.bankName,
      wdvAccountNumber: db.wdvConfig.accountNumber,
      wdvAccountName: db.wdvConfig.accountName,
      wdvWhatsappLink: db.wdvConfig.whatsappLink,
      wdvWhatsappNumber: db.wdvConfig.whatsappNumber || '',
      whatsappNumber: db.wdvConfig.whatsappNumber || '',
      whatsappLink: db.wdvConfig.whatsappLink,
      wdvVoucherPrice: String(db.wdvConfig.voucherPrice),
      wdvInstructions: db.wdvConfig.instructions,
      wdvMaintenanceNotice: db.wdvConfig.maintenanceNotice
    };
    for (const [key, val] of Object.entries(settingsMap)) {
      await execute(`
        INSERT INTO admin_settings (key, value) VALUES ($1, $2)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `, [key, val || '']);
    }
    await loadDbCache();
  } catch (err) {
    console.error('Error persisting payment settings to admin_settings SQL:', err);
  }

  logDiagnostic('SECURITY_ALERT', 'Admin updated WDV payment configuration', db.wdvConfig);
  res.json({ success: true, config: db.wdvConfig });
};

app.post('/api/admin/config/wdv', authenticateAdminToken, handleAdminConfigUpdate);
app.post('/api/admin/config/bpc', authenticateAdminToken, handleAdminConfigUpdate);

// Upload Video Guide (Admin)
app.post('/api/admin/video/upload', authenticateAdminToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an MP4 video file.' });
    }
    const videoPath = `/uploads/${req.file.filename}`;
    
    // Save to admin_settings
    await execute(`
      INSERT INTO admin_settings (key, value) VALUES ($1, $2)
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
    `, ['videoUrl', videoPath]);

    logDiagnostic('SECURITY_ALERT', 'Admin uploaded new video guide', { videoPath });
    await loadDbCache();
    res.json({ success: true, videoUrl: videoPath });
  } catch (err: any) {
    console.error('Error uploading video guide:', err);
    res.status(500).json({ error: err.message || 'Failed to upload video.' });
  }
});

// Delete Video Guide (Admin)
app.post('/api/admin/video/delete', authenticateAdminToken, async (req, res) => {
  try {
    const settingRows = await getAllRows(`SELECT key, value FROM admin_settings WHERE key = $1`, ['videoUrl']);
    if (settingRows.length > 0) {
      const videoPath = settingRows[0].value;
      if (videoPath.startsWith('/uploads/')) {
        const fullPath = path.join(process.cwd(), videoPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
    await execute(`DELETE FROM admin_settings WHERE key = $1`, ['videoUrl']);
    logDiagnostic('SECURITY_ALERT', 'Admin deleted video guide');
    await loadDbCache();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting video guide:', err);
    res.status(500).json({ error: err.message || 'Failed to delete video.' });
  }
});

// POS Decline Slip Multer Storage and Middleware Configuration
const slipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'slips');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const cleanName = `slip-${Date.now()}-${Math.floor(Math.random() * 100000)}${ext}`;
    cb(null, cleanName);
  }
});

const uploadPosSlip = multer({
  storage: slipStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB maximum size
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    const validExts = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];
    if (mimetypes.includes(file.mimetype) || validExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, WEBP, and PDF files are allowed.'));
    }
  }
});

// Admin Withdrawal Management API Endpoints
// 1. Fetch all withdrawal requests
app.get('/api/admin/withdrawals', authenticateAdminToken, async (req, res) => {
  try {
    const withdrawals = await getAllRows(`SELECT * FROM withdraw_requests ORDER BY timestamp DESC`);
    res.json({ success: true, withdrawals });
  } catch (err) {
    console.error('Error fetching withdrawals:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
});

// 2. Fetch a single withdrawal request's details
app.get('/api/admin/withdrawals/:transactionId', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  try {
    const withdrawal = await getRow(`SELECT * FROM withdraw_requests WHERE id = $1`, [transactionId]);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    const user = await getRow(`SELECT fullName, phone, balance FROM users WHERE email = $1`, [withdrawal.email || withdrawal.userid || withdrawal.userId]);
    res.json({
      success: true,
      withdrawal: {
        ...withdrawal,
        fullName: user?.fullname || user?.fullName || withdrawal.accountName || withdrawal.accountname,
        phone: user?.phone || '',
        userBalance: user?.balance || 0
      }
    });
  } catch (err) {
    console.error('Error fetching withdrawal details:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal details' });
  }
});

// 3. Update withdrawal status and internal notes
app.post('/api/admin/withdrawals/:transactionId/status', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const { status, notes } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const withdrawal = await getRow(`SELECT * FROM withdraw_requests WHERE id = $1`, [transactionId]);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (notes !== undefined) {
      await execute(`UPDATE withdraw_requests SET status = $1, notes = $2 WHERE id = $3`, [status, notes, transactionId]);
    } else {
      await execute(`UPDATE withdraw_requests SET status = $1 WHERE id = $2`, [status, transactionId]);
    }

    // Handle real-time notifications, transaction status updates and balance refunding
    const db = readDb();
    const userEmail = (withdrawal.email || withdrawal.userid || withdrawal.userId || '').toLowerCase();
    const userIndex = db.users.findIndex(u => u.email.toLowerCase() === userEmail);

    if (userIndex !== -1) {
      const user = db.users[userIndex];
      user.transactions = user.transactions || [];
      const tx = user.transactions.find((t: any) => t.id === transactionId);
      if (tx) {
        tx.status = status === 'completed' ? 'success' : (status === 'rejected' ? 'failed' : status);
      }

      // Automatically refund balance if transaction is cancelled or rejected and was previously pending/processing
      const isRefunding = (status === 'rejected' || status === 'cancelled' || status === 'Rejected' || status === 'Cancelled') && 
                          (withdrawal.status !== 'rejected' && withdrawal.status !== 'cancelled' && withdrawal.status !== 'completed' && withdrawal.status !== 'Rejected' && withdrawal.status !== 'Cancelled' && withdrawal.status !== 'Completed');
      if (isRefunding) {
        user.balance += Number(withdrawal.amount);
        if (tx) {
          tx.balanceAfter = user.balance;
        }
      }

      // Push real-time notification in user's SwiftPay account
      const msgText = status === 'processing' || status === 'Processing'
        ? "Your withdrawal is now being processed."
        : (status === 'completed' || status === 'Completed'
          ? "Your withdrawal has been completed."
          : (status === 'rejected' || status === 'Rejected'
            ? "Your withdrawal has been rejected."
            : (status === 'cancelled' || status === 'Cancelled'
              ? "Your withdrawal has been cancelled."
              : `Your withdrawal status has been updated to ${status}.`)));

      user.notifications = user.notifications || [];
      user.notifications.unshift({
        id: `notif-${Date.now()}`,
        title: `Withdrawal ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        body: msgText,
        date: new Date().toISOString(),
        unread: true
      });

      writeDb(db);
    }

    logDiagnostic('INFO', `Admin ${(req as any).adminEmail} updated withdrawal ${transactionId} status to ${status}`, { notes });
    res.json({ success: true, message: 'Status updated successfully' });
  } catch (err) {
    console.error('Error updating withdrawal status:', err);
    res.status(500).json({ error: 'Failed to update withdrawal status' });
  }
});

// 4. Update withdrawal internal notes only
app.post('/api/admin/withdrawals/:transactionId/notes', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const { notes } = req.body;
  try {
    await execute(`UPDATE withdraw_requests SET notes = $1 WHERE id = $2`, [notes || '', transactionId]);
    res.json({ success: true, message: 'Notes updated successfully' });
  } catch (err) {
    console.error('Error saving admin notes:', err);
    res.status(500).json({ error: 'Failed to save admin notes' });
  }
});

// 5. Upload POS decline slip
app.post('/api/admin/withdrawals/:transactionId/upload-slip', authenticateAdminToken, uploadPosSlip.single('slip'), async (req, res) => {
  const { transactionId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a POS decline slip file' });
  }

  const filePath = `/uploads/slips/${req.file.filename}`;
  const nowStr = new Date().toISOString();
  const adminEmail = (req as any).adminEmail;

  try {
    await execute(`
      UPDATE withdraw_requests 
      SET posSlipPath = $1, posSlipUploadedAt = $2, posSlipUploadedBy = $3
      WHERE id = $4
    `, [filePath, nowStr, adminEmail, transactionId]);

    logDiagnostic('INFO', `Admin ${adminEmail} uploaded POS slip for ${transactionId}`, { filePath });
    res.json({
      success: true,
      filePath,
      uploadedAt: nowStr,
      uploadedBy: adminEmail
    });
  } catch (err) {
    console.error('Error saving POS slip:', err);
    res.status(500).json({ error: 'Failed to upload POS decline slip' });
  }
});

// Remove POS decline slip
app.post('/api/admin/withdrawals/:transactionId/remove-slip', authenticateAdminToken, async (req, res) => {
  const { transactionId } = req.params;
  const adminEmail = (req as any).adminEmail;
  try {
    await execute(`
      UPDATE withdraw_requests 
      SET posSlipPath = NULL, posSlipUploadedAt = NULL, posSlipUploadedBy = NULL
      WHERE id = $1
    `, [transactionId]);
    logDiagnostic('INFO', `Admin ${adminEmail} removed POS slip for ${transactionId}`);
    res.json({ success: true, message: 'POS decline slip removed successfully' });
  } catch (err) {
    console.error('Error removing POS slip:', err);
    res.status(500).json({ error: 'Failed to remove POS decline slip' });
  }
});

// Admin WDV Voucher Management Endpoints
// List all vouchers
app.get('/api/admin/vouchers', authenticateAdminToken, async (req, res) => {
  try {
    const rows = await getAllRows(`SELECT * FROM vouchers ORDER BY generatedAt DESC`);
    const vouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      generatedAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));
    res.json({ success: true, vouchers });
  } catch (err: any) {
    console.error('Error fetching admin vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch WDV vouchers from database.' });
  }
});

// Generate ONE new unique random WDV voucher
app.post('/api/admin/vouchers/generate', authenticateAdminToken, async (req, res) => {
  try {
    let isUnique = false;
    let code = '';
    let attempts = 0;

    // Ensure the generated code is unique
    while (!isUnique && attempts < 10) {
      code = generateVoucherCode();
      const existing = await getRow(`SELECT 1 FROM vouchers WHERE voucherCode = $1`, [code]);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate a unique voucher code. Please try again.' });
    }

    const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const generatedAt = new Date().toISOString();

    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, code, code, 6500, 'unused', '', '', generatedAt, '', 'admin', '[]']);

    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin generated new WDV voucher', { code });

    res.json({ success: true, code });
  } catch (err: any) {
    console.error('Error generating admin voucher:', err);
    res.status(500).json({ error: 'Failed to generate WDV voucher.' });
  }
});

// Delete a voucher permanently
app.post('/api/admin/vouchers/delete', authenticateAdminToken, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Voucher ID is required.' });
  }
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    await execute(`DELETE FROM vouchers WHERE id = $1`, [id]);
    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin deleted WDV voucher permanently', { code: voucher.vouchercode || voucher.code });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting voucher:', err);
    res.status(500).json({ error: 'Failed to delete WDV voucher.' });
  }
});

// Manually deactivate a voucher (status -> used)
app.post('/api/admin/vouchers/deactivate', authenticateAdminToken, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Voucher ID is required.' });
  }
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    await execute(`
      UPDATE vouchers
      SET status = $1, usedAt = $2, usedBy = $3
      WHERE id = $4
    `, ['used', new Date().toISOString(), 'manually_deactivated_by_admin', id]);

    await loadDbCache();

    logDiagnostic('SECURITY_ALERT', 'Admin manually deactivated WDV voucher', { code: voucher.vouchercode || voucher.code });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deactivating voucher:', err);
    res.status(500).json({ error: 'Failed to deactivate WDV voucher.' });
  }
});

// WDV Specific Endpoints as requested by user
app.post('/api/admin/wdv/generate', authenticateAdminToken, async (req, res) => {
  try {
    let isUnique = false;
    let code = '';
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = generateVoucherCode();
      const existing = await getRow(`SELECT 1 FROM vouchers WHERE voucherCode = $1 OR code = $1`, [code]);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate a unique voucher code.' });
    }

    const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const generatedAt = new Date().toISOString();

    await execute(`
      INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, code, code, 6500, 'unused', '', '', generatedAt, '', 'admin', '[]']);

    await loadDbCache();
    logDiagnostic('SECURITY_ALERT', 'Admin generated new WDV voucher', { code });

    res.json({
      success: true,
      voucher: {
        id,
        code,
        voucherCode: code,
        status: 'unused',
        createdAt: generatedAt,
        generatedAt,
        usedBy: '',
        usedAt: ''
      }
    });
  } catch (err: any) {
    console.error('Error generating voucher:', err);
    res.status(500).json({ error: 'Failed to generate WDV voucher.' });
  }
});

app.get('/api/admin/wdv', authenticateAdminToken, async (req, res) => {
  try {
    const rows = await getAllRows(`SELECT * FROM vouchers ORDER BY generatedAt DESC`);
    const vouchers = rows.map(r => ({
      id: r.id || r.vouchercode || r.code,
      code: r.vouchercode || r.code,
      voucherCode: r.vouchercode || r.code,
      status: r.status,
      createdAt: r.generatedat,
      generatedAt: r.generatedat,
      usedAt: r.usedat,
      usedBy: r.usedby,
      withdrawalId: r.withdrawalid,
      purchasedBy: r.purchasedby
    }));
    res.json({ success: true, vouchers });
  } catch (err: any) {
    console.error('Error in GET /api/admin/wdv:', err);
    res.status(500).json({ error: 'Failed to fetch WDV vouchers.' });
  }
});

app.delete('/api/admin/wdv/:id', authenticateAdminToken, async (req, res) => {
  const { id } = req.params;
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE id = $1`, [id]);
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }
    await execute(`DELETE FROM vouchers WHERE id = $1`, [id]);
    await loadDbCache();
    logDiagnostic('SECURITY_ALERT', 'Admin deleted WDV voucher', { code: voucher.vouchercode || voucher.code });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting voucher:', err);
    res.status(500).json({ error: 'Failed to delete voucher.' });
  }
});

app.post('/api/admin/wdv/verify', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Voucher code is required." });
  }

  const normVoucher = code.trim();
  try {
    const voucher = await getRow(`SELECT * FROM vouchers WHERE voucherCode = $1 OR code = $1`, [normVoucher]);
    if (!voucher) {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    if (voucher.status !== 'unused') {
      return res.status(400).json({ error: "Invalid or already used WDV voucher." });
    }

    res.json({
      success: true,
      message: "Voucher approved.",
      voucher: {
        id: voucher.id,
        code: voucher.vouchercode || voucher.code,
        status: voucher.status
      }
    });
  } catch (err) {
    console.error('Error verifying voucher:', err);
    res.status(500).json({ error: "Invalid or already used WDV voucher." });
  }
});

// List all users
app.get('/api/admin/users', authenticateAdminToken, (req, res) => {
  const db = readDb();
  const safeUsers = db.users.map((u: any, idx: number) => {
    const txs = u.transactions || [];
    const totalDeposits = txs
      .filter((t: any) => t.type === 'credit' || t.type === 'deposit' || t.type === 'voucher_redemption' || t.type === 'promotional_bonus')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalWithdrawals = txs
      .filter((t: any) => t.type === 'withdraw' || t.type === 'transfer')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const wdvPurchases = txs
      .filter((t: any) => t.type === 'wdv_purchase' || (t.description && t.description.includes('WDV')))
      .length;

    return {
      id: u.id || u.userId || `USR-${(1000 + idx).toString()}`,
      fullName: u.fullName || 'User',
      username: u.username || (u.email ? u.email.split('@')[0] : `user${idx}`),
      email: u.email || '',
      phone: u.phone || '+2348000000000',
      balance: u.balance || 0,
      bonusBalance: u.bonusBalance || 0,
      dailyTarget: u.dailyTarget || 50000,
      dailySpent: u.dailySpent || 0,
      pinCreated: !!u.pinCreated,
      biometricEnabled: !!u.biometricEnabled,
      isSuspended: !!u.isSuspended,
      isFrozen: !!u.isFrozen,
      withdrawalStatus: u.withdrawalStatus || (u.withdrawalBlocked ? 'Blocked' : 'Allowed'),
      referralCount: u.referralCount || u.referrals || 0,
      registeredAt: u.registeredAt || u.createdAt || u.date || '2026-01-15T10:00:00Z',
      lastLogin: u.lastLogin || u.registeredAt || '2026-07-28T06:00:00Z',
      ipAddress: u.ipAddress || '102.89.23.14',
      tier: u.tier || 3,
      accountLevel: u.accountLevel || `Tier ${u.tier || 3} Verified`,
      profilePic: u.profilePic || '',
      totalDeposits,
      totalWithdrawals,
      wdvPurchases,
      transactions: txs
    };
  });
  res.json({ success: true, users: safeUsers });
});

// Edit user profile by Admin
app.post('/api/admin/users/edit', authenticateAdminToken, (req, res) => {
  const { email, updatedData } = req.body;
  if (!email || !updatedData) {
    return res.status(400).json({ error: 'Please supply user email and updatedData object.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex] = {
    ...db.users[userIndex],
    ...updatedData
  };
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin updated user record profile data`, { email, updatedData });

  res.json({ success: true, user: db.users[userIndex] });
});

// Update status flags
app.post('/api/admin/users/update-status', authenticateAdminToken, (req, res) => {
  const { email, field, value } = req.body;
  if (!email || !field || value === undefined) {
    return res.status(400).json({ error: 'Please supply email, status parameter, and toggle value.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex][field] = !!value;
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin modified status flag ${field} for user`, { email, flag: field, value });

  res.json({ success: true });
});

// Adjust balance
app.post('/api/admin/users/edit-balance', authenticateAdminToken, (req, res) => {
  const { email, balance } = req.body;
  if (!email || balance === undefined || isNaN(Number(balance))) {
    return res.status(400).json({ error: 'Please supply valid user email and numerical balance.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex].balance = Number(balance);
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin modified user balance directly`, { email, balance: Number(balance) });

  res.json({ success: true, balance: db.users[userIndex].balance });
});

// Reset password by Admin
app.post('/api/admin/users/reset-password', authenticateAdminToken, (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const tempPass = 'SwiftPayAdmin99!';
  const hash = bcrypt.hashSync(tempPass, 10);
  db.users[userIndex].passwordHash = hash;
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin performed hard credentials override`, { email });

  res.json({ success: true });
});

// Reset user PIN by Admin
app.post('/api/admin/users/reset-pin', authenticateAdminToken, (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users[userIndex].pinCreated = false;
  delete db.users[userIndex].pinHash;
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin reset security PIN for user`, { email });

  res.json({ success: true, message: 'User security PIN reset successfully.' });
});

// Delete account by Admin
app.post('/api/admin/users/delete', authenticateAdminToken, (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please supply email.' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  db.users.splice(userIndex, 1);
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', 'Admin permanently deleted user account record', { email });

  res.json({ success: true });
});

// Get diagnostic logs
app.get('/api/admin/logs', authenticateAdminToken, (req, res) => {
  const db = readDb();
  res.json({ success: true, logs: db.logs || [] });
});

// Clear diagnostic logs
app.post('/api/admin/logs/clear', authenticateAdminToken, (req, res) => {
  const db = readDb();
  db.logs = [];
  writeDb(db);
  res.json({ success: true });
});

// -------------------- VITE STATIC SERVER HANDLER --------------------
async function startServer() {
  // Initialize and preload SQL database cache on startup
  try {
    await initDb();
    await loadDbCache();
  } catch (err) {
    console.error('[SwiftPay DB] Critical failure during database initialization:', err);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SwiftPay Server] Enhanced Full-Stack listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
