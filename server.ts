import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

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

interface DBStructure {
  users: UserState[];
  vouchers: any[];
  passwordResets: any[];
  logs: any[];
}

// Initialize Database with seed data if not exists
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
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
      logs: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Database initialized with default user user@example.com / password123');
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
    return {
      users: data.users || [],
      vouchers: data.vouchers || [],
      passwordResets: data.passwordResets || [],
      logs: data.logs || []
    };
  } catch (e) {
    return { users: [], vouchers: [], passwordResets: [], logs: [] };
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

// Verify Voucher
app.post('/api/auth/verify-voucher', (req, res) => {
  const { voucherCode } = req.body;
  if (!voucherCode) {
    return res.status(400).json({ error: 'Please enter a voucher code.' });
  }

  const codeClean = voucherCode.trim();
  const db = readDb();
  const voucher = db.vouchers.find((v: any) => v.code === codeClean);

  if (voucher) {
    return res.json({ success: true, amount: voucher.amount });
  } else {
    logDiagnostic('API_ERROR', 'Invalid voucher code attempt', { voucherCode });
    return res.status(400).json({ error: 'Invalid BPC Voucher code.' });
  }
});

// Verify Bank Account
app.post('/api/auth/verify-account', (req, res) => {
  const { bank, accountNumber } = req.body;
  if (!bank || !accountNumber) {
    return res.status(400).json({ error: 'Bank and account number are required.' });
  }

  if (!isValidAccountNumber(accountNumber)) {
    return res.status(400).json({ error: 'Account number must be exactly 10 digits.' });
  }

  // Pre-determined responses for testing
  if (accountNumber === '8960723295') {
    return res.json({ success: true, accountName: 'Pwamunadi Ishaku' });
  }
  if (accountNumber === '0803456789') {
    return res.json({ success: true, accountName: 'Adebayo Samuel' });
  }

  // Generate deterministic name
  const firstNames = ['Olawale', 'Chinedu', 'Abubakar', 'Emeka', 'Babatunde', 'Chidi', 'Fatima', 'Oluwaseun', 'Amina', 'Ngozi'];
  const lastNames = ['Okonkwo', 'Balogun', 'Adedayo', 'Danjuma', 'Adeyemi', 'Okeke', 'Obi', 'Sani', 'Aliyu', 'Nwachukwu'];

  const sumDigits = accountNumber.split('').reduce((acc: number, val: string) => acc + parseInt(val), 0);
  const firstName = firstNames[sumDigits % firstNames.length];
  const lastName = lastNames[(sumDigits * 3) % lastNames.length];

  setTimeout(() => {
    res.json({
      success: true,
      accountName: `${firstName} ${lastName}`
    });
  }, 400);
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

// Purchase BPC Voucher Price Lock API
app.post('/api/vouchers/purchase', (req, res) => {
  const { email, amount } = req.body;
  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  if (Number(amount) !== 6500) {
    logDiagnostic('API_ERROR', 'Purchase voucher failed: Invalid amount lock bypass attempted', { email, amount });
    return res.status(400).json({ error: 'BPC Voucher price is strictly fixed at ₦6,500' });
  }

  res.json({
    success: true,
    message: 'BPC Purchase payment initialized successfully!'
  });
});

// -------------------- ADMINISTRATIVE PANEL ENDPOINTS --------------------

// List all users
app.get('/api/admin/users', (req, res) => {
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
    tier: u.tier || 3
  }));
  res.json({ success: true, users: safeUsers });
});

// Update status flags
app.post('/api/admin/users/update-status', (req, res) => {
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
app.post('/api/admin/users/edit-balance', (req, res) => {
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
app.post('/api/admin/users/reset-password', (req, res) => {
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
app.post('/api/admin/users/delete', (req, res) => {
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
app.get('/api/admin/logs', (req, res) => {
  const db = readDb();
  res.json({ success: true, logs: db.logs || [] });
});

// Clear diagnostic logs
app.post('/api/admin/logs/clear', (req, res) => {
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
