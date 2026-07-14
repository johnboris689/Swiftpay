import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import multer from 'multer';
import { initDb, getRow, getAllRows, execute } from './db';
import { sendEmail, sendSms } from './email_sms_service';

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'swiftpay_db.json');

app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Set up multer disk storage
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  biometricEnabled: boolean;
  phone?: string;
  profilePic?: string;
  tier?: number;
  isSuspended?: boolean;
  isFrozen?: boolean;
  registrationDate?: string;
  accountStatus?: string;
  transactions?: any[];
  notifications?: any[];
  beneficiaries?: any[];
  phoneBeneficiaries?: any[];
  loginHistory?: any[];
}

interface WdvConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  whatsappLink: string;
  voucherPrice: number;
  instructions: string;
  maintenanceNotice: string;
}

const DEFAULT_WDV_CONFIG: WdvConfig = {
  bankName: "PalmPay",
  accountNumber: "8960723295",
  accountName: "pwamunadi ishaku",
  whatsappLink: "https://wa.me/2349162845073",
  voucherPrice: 6500,
  instructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
  maintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
};

interface AdminState {
  email: string;
  passwordHash: string;
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

async function loadDbCache() {
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
      beneficiaries: JSON.parse(row.beneficiaries || '[]'),
      phoneBeneficiaries: JSON.parse(row.phonebeneficiaries || '[]'),
      loginHistory: JSON.parse(row.loginhistory || '[]'),
      notifications: JSON.parse(row.notifications || '[]'),
      transactions: JSON.parse(row.transactions || '[]')
    }));

    // Fetch vouchers
    const voucherRows = await getAllRows(`SELECT * FROM vouchers`);
    const vouchers = voucherRows.map(row => ({
      code: row.code,
      amount: Number(row.amount ?? 0),
      status: row.status || 'unused',
      usedBy: row.usedby || '',
      usedAt: row.usedat || ''
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
    // 1. Save Users
    for (const u of data.users) {
      await execute(`
        INSERT INTO users (
          fullName, username, email, phone, passwordHash, balance, dailyTarget, dailySpent,
          pinCreated, pinCode, biometricEnabled, profilePic, tier, isSuspended, isFrozen,
          registrationDate, accountStatus, beneficiaries, phoneBeneficiaries, loginHistory,
          notifications, transactions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
          transactions = EXCLUDED.transactions
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
        JSON.stringify(u.transactions || [])
      ]);
    }

    // 2. Save Vouchers
    for (const v of data.vouchers) {
      await execute(`
        INSERT INTO vouchers (code, amount, status, usedBy, usedAt)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(code) DO UPDATE SET
          amount = EXCLUDED.amount,
          status = EXCLUDED.status,
          usedBy = EXCLUDED.usedBy,
          usedAt = EXCLUDED.usedAt
      `, [v.code, v.amount, v.status, v.usedBy || '', v.usedAt || '']);
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

function readDb(): DBStructure {
  return dbCache;
}

function writeDb(data: DBStructure) {
  dbCache = data;
  persistDbCache(data).catch(err => {
    console.error('[SwiftPay DB] Error during background database persistence:', err);
  });
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

// Token Verification Middleware
function authenticateToken(req: any, res: any, next: any) {
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
  next();
}

function verifyAdminToken(token: string): string | null {
  const email = verifyToken(token);
  if (!email) return null;
  // We check talkdavidjohn@gmail.com which is our secure admin account
  if (email.toLowerCase() === 'talkdavidjohn@gmail.com') {
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
app.post('/api/auth/register', (req, res) => {
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

  const db = readDb();
  const existingUser = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    logDiagnostic('API_ERROR', 'Registration failed: Duplicate email request', { email });
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  const newUser: UserState = {
    fullName: fullName.trim(),
    email: email.toLowerCase(),
    passwordHash,
    balance: 200000, // Initial sign-on credit bonus
    dailyTarget: 50000,
    dailySpent: 0,
    pinCreated: false,
    biometricEnabled: false,
    phone: '',
    profilePic: '',
    tier: 3,
    isSuspended: false,
    isFrozen: false,
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
      loginHistory: newUser.loginHistory
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

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (user.passwordHash !== passwordHash) {
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
      loginHistory: user.loginHistory
    }
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
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  const user = db.users[userIndex];
  const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
  if (user.passwordHash !== currentHash) {
    logDiagnostic('SECURITY_ALERT', 'Password change failure: Incorrect current password', { email });
    return res.status(400).json({ error: 'Current password provided is incorrect.' });
  }

  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
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

  const newPasswordHash = crypto.createHash('sha256').update(password).digest('hex');
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
  const email = req.userEmail;
  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

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
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  const user = db.users[userIndex];

  // Prevent transactions if user is frozen
  if (user.isFrozen && (stateToSync.transactions && stateToSync.transactions.length > (user.transactions || []).length)) {
    logDiagnostic('FAILED_TX', 'Transaction attempted on frozen wallet', { email });
    return res.status(400).json({ error: 'Your wallet balance is currently frozen. Please contact administrative support.' });
  }

  const allowedFields = [
    'balance', 'dailyTarget', 'dailySpent', 'pinCreated', 'pinCode', 
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
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

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

const isVoucherValid = (code: string | undefined, db: DBStructure): boolean => {
  if (!code) return false;
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const voucher = db.vouchers.find((v: any) => v.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === norm);
  if (!voucher) return false;
  return voucher.status === 'unused';
};

// Verify Voucher
app.post('/api/auth/verify-voucher', (req, res) => {
  const { voucherCode } = req.body;
  if (!voucherCode) {
    return res.status(400).json({ error: 'Please enter a voucher code.' });
  }

  const db = readDb();
  if (isVoucherValid(voucherCode, db)) {
    const config = db.wdvConfig || DEFAULT_WDV_CONFIG;
    return res.json({ success: true, amount: config.voucherPrice });
  } else {
    logDiagnostic('API_ERROR', 'Invalid voucher code attempt', { voucherCode });
    return res.status(400).json({ error: 'Invalid or already used WDV voucher.' });
  }
});

// Transaction endpoint for Airtime Purchase
app.post('/api/transactions/airtime', authenticateToken, (req: any, res) => {
  const { phoneNumber, network, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "WDV voucher is required. If you don't have one, tap 'Buy WDV Voucher'." });
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
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used WDV voucher." });
  }

  const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = db.users[userIndex];
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

  const balanceBefore = user.balance;
  user.balance -= price;
  const balanceAfter = user.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  user.transactions = user.transactions || [];
  const newTx = {
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
  user.transactions.unshift(newTx);

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Airtime Purchase Successful',
    body: `Successfully purchased ₦${price.toLocaleString()} airtime for ${phoneNumber}. WDV voucher used.`,
    date: new Date().toISOString(),
    unread: true
  });

  // Mark voucher as used
  const normVoucher = voucherCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vIndex = db.vouchers.findIndex((v: any) => v.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normVoucher);
  if (vIndex !== -1) {
    db.vouchers[vIndex].status = 'used';
  }

  writeDb(db);
  logDiagnostic('INFO', 'Airtime purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: user.balance,
    transaction: newTx
  });
});

// Transaction endpoint for Data Purchase
app.post('/api/transactions/data', authenticateToken, (req: any, res) => {
  const { phoneNumber, network, bundleId, voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "WDV voucher is required. If you don't have one, tap 'Buy WDV Voucher'." });
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
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used WDV voucher." });
  }

  const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = db.users[userIndex];
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

  const balanceBefore = user.balance;
  user.balance -= price;
  const balanceAfter = user.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  user.transactions = user.transactions || [];
  const newTx = {
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
  user.transactions.unshift(newTx);

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Data Purchase Successful',
    body: `Successfully purchased ${plan.size} data bundle for ${phoneNumber}. WDV voucher used.`,
    date: new Date().toISOString(),
    unread: true
  });

  // Mark voucher as used
  const normVoucher = voucherCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vIndex = db.vouchers.findIndex((v: any) => v.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normVoucher);
  if (vIndex !== -1) {
    db.vouchers[vIndex].status = 'used';
  }

  writeDb(db);
  logDiagnostic('INFO', 'Data purchase complete', { email, amount: price, phoneNumber });

  res.json({
    success: true,
    balance: user.balance,
    transaction: newTx
  });
});

// Transaction endpoint for Bank Transfer
app.post('/api/transactions/transfer', authenticateToken, async (req: any, res) => {
  const { bank, accountNumber, amount, voucherCode, accountName } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "WDV voucher is required. If you don't have one, tap 'Buy WDV Voucher'." });
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
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used WDV voucher." });
  }

  const resolvedName = accountName.trim();

  const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = db.users[userIndex];
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

  const balanceBefore = user.balance;
  user.balance -= price;
  const balanceAfter = user.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  user.transactions = user.transactions || [];
  const newTx = {
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
  user.transactions.unshift(newTx);

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Bank Cashout Success',
    body: `Successfully cashed out ₦${price.toLocaleString()} to ${resolvedName}. WDV voucher used.`,
    date: new Date().toISOString(),
    unread: true
  });

  // Mark voucher as used
  const normVoucher = voucherCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vIndex = db.vouchers.findIndex((v: any) => v.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normVoucher);
  if (vIndex !== -1) {
    db.vouchers[vIndex].status = 'used';
  }

  writeDb(db);
  logDiagnostic('INFO', 'Bank cashout complete', { email, amount: price, accountNumber });

  res.json({
    success: true,
    balance: user.balance,
    transaction: newTx,
    accountName: resolvedName
  });
});

// Transaction endpoint for Withdrawal
app.post('/api/transactions/withdraw', authenticateToken, async (req: any, res) => {
  const { bank, accountNumber, amount, voucherCode, accountName } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "WDV voucher is required. If you don't have one, tap 'Buy WDV Voucher'." });
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

  const db = readDb();
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used WDV voucher." });
  }

  const resolvedName = accountName.trim();

  const userIndex = db.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = db.users[userIndex];
  const price = Number(amount);

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

  const balanceBefore = user.balance;
  user.balance -= price;
  const balanceAfter = user.balance;
  const refNum = `REF-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;

  user.transactions = user.transactions || [];
  const newTx = {
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    userId: email,
    type: 'withdraw',
    amount: price,
    date: new Date().toISOString(),
    status: 'success',
    description: `Withdrew ₦${price.toLocaleString()} to ${bank} (${resolvedName})`,
    recipientAccount: accountNumber,
    recipientBank: bank,
    recipientName: resolvedName,
    balanceBefore,
    balanceAfter,
    refNum,
    voucherCode
  };
  user.transactions.unshift(newTx);

  user.notifications = user.notifications || [];
  user.notifications.unshift({
    id: `notif-${Date.now()}`,
    title: 'Withdrawal Successful',
    body: `₦${price.toLocaleString()} withdrawn to ${resolvedName} (${bank}). WDV voucher used.`,
    date: new Date().toISOString(),
    unread: true
  });

  // Mark voucher as used
  const normVoucher = voucherCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vIndex = db.vouchers.findIndex((v: any) => v.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normVoucher);
  if (vIndex !== -1) {
    db.vouchers[vIndex].status = 'used';
  }

  writeDb(db);
  logDiagnostic('INFO', 'Withdrawal complete', { email, amount: price, accountNumber });

  res.json({
    success: true,
    balance: user.balance,
    transaction: newTx,
    accountName: resolvedName
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
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

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
app.post('/api/vouchers/purchase', (req, res) => {
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
  const newVoucher = {
    code,
    amount: config.voucherPrice,
    status: 'unused'
  };
  db.vouchers = db.vouchers || [];
  db.vouchers.push(newVoucher);

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
  }

  writeDb(db);
  logDiagnostic('INFO', 'WDV Voucher purchased successfully', { email, code });

  res.json({
    success: true,
    code,
    message: 'WDV Purchase completed successfully! Voucher generated.'
  });
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

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const db = readDb();
  const admin = db.admins?.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (!admin) {
    logDiagnostic('FAILED_LOGIN', `Admin login failed (no admin found): ${email}`);
    return res.status(400).json({ error: 'Invalid admin credentials.' });
  }
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (admin.passwordHash !== passwordHash) {
    logDiagnostic('FAILED_LOGIN', `Admin login failed (incorrect password): ${email}`);
    return res.status(400).json({ error: 'Invalid admin credentials.' });
  }
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

// Update Admin settings
app.post('/api/admin/settings', authenticateAdminToken, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings object payload.' });
  }
  
  try {
    for (const [key, val] of Object.entries(settings)) {
      await execute(
        `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
        [key, String(val)]
      );
    }
    
    // Also reload the dbCache with updated values so the running application cache has it instantly
    await loadDbCache();
    
    logDiagnostic('SECURITY_ALERT', 'Admin updated system-wide general settings', settings);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving admin settings:', err);
    res.status(500).json({ error: 'Failed to save admin settings' });
  }
});

// Update WDV Configuration (Admin) - support both wdv and legacy bpc paths
const handleAdminConfigUpdate = (req: any, res: any) => {
  const { bankName, accountNumber, accountName, whatsappLink, voucherPrice, instructions, maintenanceNotice } = req.body;
  
  const db = readDb();
  if (!db.wdvConfig) {
    db.wdvConfig = { ...DEFAULT_WDV_CONFIG };
  }
  
  if (bankName !== undefined) db.wdvConfig.bankName = bankName;
  if (accountNumber !== undefined) db.wdvConfig.accountNumber = accountNumber;
  if (accountName !== undefined) db.wdvConfig.accountName = accountName;
  if (whatsappLink !== undefined) db.wdvConfig.whatsappLink = whatsappLink;
  if (voucherPrice !== undefined && !isNaN(Number(voucherPrice))) db.wdvConfig.voucherPrice = Number(voucherPrice);
  if (instructions !== undefined) db.wdvConfig.instructions = instructions;
  if (maintenanceNotice !== undefined) db.wdvConfig.maintenanceNotice = maintenanceNotice;
  
  writeDb(db);
  logDiagnostic('SECURITY_ALERT', 'Admin updated WDV configuration', db.wdvConfig);
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
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting video guide:', err);
    res.status(500).json({ error: err.message || 'Failed to delete video.' });
  }
});

// List all users
app.get('/api/admin/users', authenticateAdminToken, (req, res) => {
  const db = readDb();
  const safeUsers = db.users.map((u: any) => ({
    fullName: u.fullName,
    email: u.email,
    balance: u.balance,
    dailyTarget: u.dailyTarget || 50000,
    dailySpent: u.dailySpent || 0,
    pinCreated: !!u.pinCreated,
    biometricEnabled: !!u.biometricEnabled,
    isSuspended: !!u.isSuspended,
    isFrozen: !!u.isFrozen,
    phone: u.phone || '',
    profilePic: u.profilePic || '',
    tier: u.tier || 3,
    transactions: u.transactions || []
  }));
  res.json({ success: true, users: safeUsers });
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
  const hash = crypto.createHash('sha256').update(tempPass).digest('hex');
  db.users[userIndex].passwordHash = hash;
  writeDb(db);

  logDiagnostic('SECURITY_ALERT', `Admin performed hard credentials override`, { email });

  res.json({ success: true });
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
