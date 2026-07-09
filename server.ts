import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'swiftpay_db.json');

app.use(express.json());

// Initialize Database with a seed user if not exists
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
    const initialData = {
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
          biometricEnabled: true
        }
      ],
      vouchers: [
        {
          code: 'BPC-7674-2206-6501',
          amount: 6500,
          status: 'unused'
        }
      ],
      passwordResets: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    console.log('Database initialized with default user user@example.com / password123');
  }
}

initDb();

// Database read/write helpers
function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], vouchers: [], passwordResets: [] };
  }
}

function writeDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// -------------------- API ROUTES --------------------

// Register Endpoint
app.post('/api/auth/register', (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Please provide all fields' });
  }

  const db = readDb();
  const existingUser = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  // Password hashing
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  const newUser = {
    fullName,
    email: email.toLowerCase(),
    passwordHash,
    balance: 200000, // Initial balance bonus of ₦200,000
    dailyTarget: 50000,
    dailySpent: 12500,
    pinCreated: false,
    biometricEnabled: false
  };

  db.users.push(newUser);
  writeDb(db);

  res.json({
    success: true,
    user: {
      fullName: newUser.fullName,
      email: newUser.email,
      balance: newUser.balance,
      pinCreated: newUser.pinCreated,
      biometricEnabled: newUser.biometricEnabled
    }
  });
});

// Login Endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password' });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    return res.status(400).json({ error: 'User does not exist.' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (user.passwordHash !== passwordHash) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  res.json({
    success: true,
    user: {
      fullName: user.fullName,
      email: user.email,
      balance: user.balance,
      pinCreated: user.pinCreated,
      pinCode: user.pinCode,
      biometricEnabled: user.biometricEnabled
    }
  });
});

// Forgot Password Endpoint
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please provide an email address' });
  }

  const db = readDb();
  const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(400).json({ error: 'User does not exist.' });
  }

  // Generate OTP (6 digits) and secure token (random string)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  // Store password reset session
  db.passwordResets = db.passwordResets || [];
  db.passwordResets.push({
    email: email.toLowerCase(),
    otp,
    token,
    expiresAt,
    used: false
  });
  writeDb(db);

  console.log(`[EMAIL SIMULATOR] Sent password reset instructions to ${email}`);
  console.log(`[EMAIL SIMULATOR] OTP Code: ${otp}`);
  console.log(`[EMAIL SIMULATOR] Reset Link: http://localhost:3000/reset-password?token=${token}`);

  // Return the OTP and token in response so the frontend simulator can display it directly to user for testing
  res.json({
    success: true,
    message: 'Reset code and link dispatched securely. Check logs or UI simulated popup.',
    otp,
    token
  });
});

// Reset Password Endpoint
app.post('/api/auth/reset-password', (req, res) => {
  const { email, password, otp, token } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and new password are required' });
  }

  // Password validation: at least 8 chars, containing letter and number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (password.length < 8 || !hasLetter || !hasNumber) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long and contain both letters and numbers.'
    });
  }

  const db = readDb();
  db.passwordResets = db.passwordResets || [];

  // Match reset attempt
  const resetSessionIndex = db.passwordResets.findIndex((r: any) => {
    const isMatchingEmail = r.email.toLowerCase() === email.toLowerCase();
    const isMatchingCode = otp ? r.otp === otp : r.token === token;
    return isMatchingEmail && isMatchingCode;
  });

  if (resetSessionIndex === -1) {
    return res.status(400).json({ error: 'Invalid verification token or OTP.' });
  }

  const resetSession = db.passwordResets[resetSessionIndex];
  if (resetSession.used) {
    return res.status(400).json({ error: 'This reset token/OTP has already been used.' });
  }

  if (Date.now() > resetSession.expiresAt) {
    return res.status(400).json({ error: 'Verification token/OTP has expired (10 minutes limit).' });
  }

  // Find user and update password
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(400).json({ error: 'User no longer exists.' });
  }

  const newPasswordHash = crypto.createHash('sha256').update(password).digest('hex');
  db.users[userIndex].passwordHash = newPasswordHash;
  resetSession.used = true; // Mark as used
  writeDb(db);

  res.json({
    success: true,
    message: 'Password reset successfully!'
  });
});

// Real-Time Bank Name Verification
app.post('/api/auth/verify-account', (req, res) => {
  const { bank, accountNumber } = req.body;
  if (!bank || !accountNumber) {
    return res.status(400).json({ error: 'Please specify bank and account number.' });
  }

  if (accountNumber.length !== 10 || !/^\d+$/.test(accountNumber)) {
    return res.status(400).json({ error: 'Account number must be exactly 10 digits.' });
  }

  // Pre-determined lookups
  if (accountNumber === '8960723295') {
    return res.json({ success: true, accountName: 'Pwamunadi Ishaku' });
  }
  if (accountNumber === '0803456789') {
    return res.json({ success: true, accountName: 'Adebayo Samuel' });
  }

  // Deterministic name generator based on numbers
  const nigerianFirstNames = [
    'Olawale', 'Chinedu', 'Abubakar', 'Emeka', 'Babatunde',
    'Chidi', 'Fatima', 'Oluwaseun', 'Amina', 'Ngozi',
    'Kelechi', 'Tunde', 'Adeola', 'Yusuf', 'Ibrahim'
  ];
  const nigerianLastNames = [
    'Okonkwo', 'Balogun', 'Adedayo', 'Danjuma', 'Adeyemi',
    'Okeke', 'Obi', 'Sani', 'Aliyu', 'Nwachukwu',
    'Olatunji', 'Eze', 'Okafor', 'Bello', 'Garba'
  ];

  const sumDigits = accountNumber.split('').reduce((acc: number, val: string) => acc + parseInt(val), 0);
  const firstName = nigerianFirstNames[sumDigits % nigerianFirstNames.length];
  const lastName = nigerianLastNames[(sumDigits * 3) % nigerianLastNames.length];

  const officialName = `${firstName} ${lastName}`;

  // Simulate a real API latency
  setTimeout(() => {
    res.json({
      success: true,
      accountName: officialName
    });
  }, 800);
});

// Voucher Verification Endpoint
app.post('/api/auth/verify-voucher', (req, res) => {
  const { voucherCode } = req.body;
  if (!voucherCode) {
    return res.status(400).json({ error: 'Please provide a voucher code.' });
  }

  const codeClean = voucherCode.trim();
  if (codeClean === 'BPC-7674-2206-6501') {
    return res.json({ success: true, amount: 6500 });
  } else {
    return res.status(400).json({ error: 'Invalid BPC Voucher.' });
  }
});

// Update Balance Endpoint
app.post('/api/auth/update-balance', (req, res) => {
  const { email, balance } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    return res.status(400).json({ error: 'User not found' });
  }

  db.users[userIndex].balance = Number(balance);
  writeDb(db);

  res.json({
    success: true,
    balance: db.users[userIndex].balance
  });
});

// Purchase BPC Voucher Endpoint
app.post('/api/vouchers/purchase', (req, res) => {
  const { email, amount } = req.body;
  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  if (Number(amount) !== 6500) {
    return res.status(400).json({ error: 'BPC Voucher price is strictly fixed at ₦6,500' });
  }

  res.json({
    success: true,
    message: 'BPC Purchase payment initialized successfully!'
  });
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
    console.log(`[SwiftPay Server] Full-Stack listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
