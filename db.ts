import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns';

const { Pool } = pg;

let configuredRawDatabaseUrl: string = (process.env.DATABASE_URL || '').trim();
let configuredRawSqlHost: string = (process.env.SQL_HOST || '').trim();

async function validateAndSanitizeDbEnv(): Promise<{ connectionString?: string; sqlHost?: string }> {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
    configuredRawDatabaseUrl = process.env.DATABASE_URL.trim();
  }
  if (process.env.SQL_HOST && process.env.SQL_HOST.trim()) {
    configuredRawSqlHost = process.env.SQL_HOST.trim();
  }
  // Check and clear any unresolvable PGHOST / PGHOSTNAME / DB_HOST / POSTGRES_HOST env vars
  // so node-postgres never implicitly attempts to connect to a stale host
  for (const envKey of ['PGHOST', 'PGHOSTNAME', 'DB_HOST', 'POSTGRES_HOST']) {
    const val = (process.env[envKey] || '').trim();
    if (val) {
      if (val !== 'localhost' && val !== '127.0.0.1' && !val.startsWith('/')) {
        try {
          await dns.promises.lookup(val);
        } catch {
          console.warn(`[SwiftPay DB] Removing unreachable ${envKey} from environment.`);
          delete process.env[envKey];
        }
      }
    }
  }

  let validSqlHost: string | undefined;
  const rawSqlHost = (process.env.SQL_HOST || '').trim();
  if (rawSqlHost) {
    if (rawSqlHost !== 'localhost' && rawSqlHost !== '127.0.0.1' && !rawSqlHost.startsWith('/')) {
      try {
        await dns.promises.lookup(rawSqlHost);
        validSqlHost = rawSqlHost;
      } catch {
        console.warn('[SwiftPay DB] Configured SQL_HOST is unreachable; removing from environment.');
        delete process.env.SQL_HOST;
      }
    } else {
      validSqlHost = rawSqlHost;
    }
  }

  let validConnectionString: string | undefined;
  const rawUrl = (process.env.DATABASE_URL || '').trim();
  if (rawUrl && rawUrl !== 'postgresql://user:password@localhost:5432/swiftpay') {
    try {
      const parsed = new URL(rawUrl);
      const hostname = parsed.hostname;
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        await dns.promises.lookup(hostname);
      }
      validConnectionString = rawUrl;
    } catch {
      console.warn('[SwiftPay DB] Configured DATABASE_URL host is unreachable in DNS; falling back.');
      delete process.env.DATABASE_URL;
    }
  } else if (rawUrl) {
    delete process.env.DATABASE_URL;
  }

  // Support standard PGHOST + PGDATABASE + PGUSER + PGPASSWORD environment variables if set and reachable
  if (!validConnectionString) {
    const pgHost = (process.env.PGHOST || process.env.DB_HOST || process.env.POSTGRES_HOST || '').trim();
    const pgDb = (process.env.PGDATABASE || process.env.POSTGRES_DB || '').trim();
    const pgUser = (process.env.PGUSER || process.env.POSTGRES_USER || '').trim();
    const pgPass = (process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '').trim();
    const pgPort = (process.env.PGPORT || '5432').trim();
    if (pgHost && pgDb && pgUser) {
      const encodedPass = encodeURIComponent(pgPass);
      validConnectionString = `postgresql://${encodeURIComponent(pgUser)}:${encodedPass}@${pgHost}:${pgPort}/${encodeURIComponent(pgDb)}`;
    }
  }

  return { connectionString: validConnectionString, sqlHost: validSqlHost };
}

let isPostgres = false;
let usedSqlHost = false;
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
  payment_transactions: any[];
  ai_chat_logs: any[];
  ai_custom_faqs: any[];
}

// -------------------- JSON DATABASE ENGINE FALLBACK --------------------
function safeParseJsonField(val: any): any {
  if (!val) return [];
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return [];
  }
}

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
      wdv_payments: [],
      payment_transactions: [],
      ai_chat_logs: [],
      ai_custom_faqs: []
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
        wdvverified: u.wdvVerified || u.wdvverified ? 1 : 0,
        iswdvverified: u.isWdvVerified || u.iswdvverified ? 1 : 0,
        welcomerewardshown: u.welcomeRewardShown || u.welcomerewardshown ? 1 : 0,
        giftday: Number(u.giftDay ?? u.giftday ?? 0),
        giftactive: u.giftActive !== 0 && u.giftactive !== 0 ? 1 : 0,
        lastgiftcredittime: u.lastGiftCreditTime || u.lastgiftcredittime || '',
        giftexpiresat: u.giftExpiresAt || u.giftexpiresat || ''
      })),
      vouchers: (parsed.vouchers || []).map((v: any) => {
        const c = v.code || v.voucherCode || v.vouchercode || '';
        const idVal = v.id || c || `v-${Date.now()}`;
        return {
          id: idVal,
          vouchercode: c,
          code: c,
          voucherCode: c,
          amount: Number(v.amount ?? 6500),
          status: v.status || 'unused',
          usedby: v.usedBy || v.usedby || '',
          usedBy: v.usedBy || v.usedby || '',
          usedat: v.usedAt || v.usedat || '',
          usedAt: v.usedAt || v.usedat || '',
          generatedat: v.generatedAt || v.generatedat || v.createdAt || v.createdat || new Date().toISOString(),
          generatedAt: v.generatedAt || v.generatedat || v.createdAt || v.createdat || new Date().toISOString(),
          createdat: v.createdAt || v.createdat || v.generatedAt || v.generatedat || new Date().toISOString(),
          createdAt: v.createdAt || v.createdat || v.generatedAt || v.generatedat || new Date().toISOString(),
          withdrawalid: v.withdrawalId || v.withdrawalid || '',
          withdrawalId: v.withdrawalId || v.withdrawalid || '',
          purchasedby: v.purchasedBy || v.purchasedby || 'admin',
          purchasedBy: v.purchasedBy || v.purchasedby || 'admin',
          redeemedby: safeStringifyJsonField(v.redeemedBy || v.redeemedby),
          redeemedBy: safeStringifyJsonField(v.redeemedBy || v.redeemedby)
        };
      }),
      password_resets: (parsed.password_resets || parsed.passwordResets || []).map((r: any) => ({
        id: r.id || r.token || '',
        emailorphone: (r.emailorphone || r.email || '').toLowerCase(),
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
        userid: w.userId || w.userid || '',
        email: w.email || '',
        phone: w.phone || '',
        amount: Number(w.amount || 0),
        bankName: w.bankName || w.bankname || '',
        bankname: w.bankName || w.bankname || '',
        accountNumber: w.accountNumber || w.accountnumber || '',
        accountnumber: w.accountNumber || w.accountnumber || '',
        accountName: w.accountName || w.accountname || '',
        accountname: w.accountName || w.accountname || '',
        reference: w.reference || '',
        status: w.status || 'pending',
        timestamp: w.timestamp || w.created_at || new Date().toISOString(),
        created_at: w.created_at || w.timestamp || new Date().toISOString(),
        notes: w.notes || w.adminNotes || w.adminnotes || '',
        vouchercode: w.voucherCode || w.vouchercode || '',
        voucherCode: w.voucherCode || w.vouchercode || '',
        posSlipPath: w.posSlipPath || w.posslippath || '',
        posSlippath: w.posSlipPath || w.posslippath || '',
        posSlipUploadedAt: w.posSlipUploadedAt || w.posslipuploadedat || '',
        posSlipuploadedAt: w.posSlipUploadedAt || w.posslipuploadedat || '',
        posSlipUploadedBy: w.posSlipUploadedBy || w.posslipuploadedby || '',
        posSlipuploadedBy: w.posSlipUploadedBy || w.posslipuploadedby || '',
        approvedAmount: Number(w.approvedAmount || w.approvedamount || 0),
        approvedamount: Number(w.approvedAmount || w.approvedamount || 0),
        approvalHistory: typeof w.approvalHistory === 'string'
          ? (safeParseJsonField(w.approvalHistory) || [])
          : (Array.isArray(w.approvalHistory) ? w.approvalHistory : (Array.isArray(w.approval_history) ? w.approval_history : []))
      })),
      wdv_payments: (parsed.wdv_payments || parsed.wdvPayments || []).map((p: any) => ({
        id: p.id || '',
        reference: p.reference || '',
        userEmail: (p.userEmail || p.useremail || '').toLowerCase(),
        useremail: (p.userEmail || p.useremail || '').toLowerCase(),
        amount: Number(p.amount || 0),
        bankName: p.bankName || p.bankname || '',
        bankname: p.bankName || p.bankname || '',
        accountNumber: p.accountNumber || p.accountnumber || '',
        accountnumber: p.accountNumber || p.accountnumber || '',
        accountName: p.accountName || p.accountname || '',
        accountname: p.accountName || p.accountname || '',
        status: p.status || 'pending',
        createdAt: p.createdAt || p.createdat || new Date().toISOString(),
        createdat: p.createdAt || p.createdat || new Date().toISOString(),
        expiresAt: p.expiresAt || p.expiresat || '',
        expiresat: p.expiresAt || p.expiresat || '',
        paidAt: p.paidAt || p.paidat || '',
        paidat: p.paidAt || p.paidat || '',
        voucherCode: p.voucherCode || p.vouchercode || '',
        vouchercode: p.voucherCode || p.vouchercode || '',
        provider: p.provider || 'manual_transfer',
        webhookData: p.webhookData || p.webhookdata || '',
        webhookdata: p.webhookData || p.webhookdata || ''
      })),
      payment_transactions: (parsed.payment_transactions || parsed.paymentTransactions || []).map((pt: any) => ({
        id: pt.id || '',
        reference: pt.reference || '',
        userEmail: (pt.userEmail || pt.useremail || '').toLowerCase(),
        useremail: (pt.userEmail || pt.useremail || '').toLowerCase(),
        userName: pt.userName || pt.username || '',
        username: pt.userName || pt.username || '',
        amount: Number(pt.amount || 0),
        currency: pt.currency || 'NGN',
        provider: pt.provider || 'korapay',
        providerReference: pt.providerReference || pt.providerreference || '',
        providerreference: pt.providerReference || pt.providerreference || '',
        purpose: pt.purpose || 'wallet_funding',
        status: pt.status || 'pending',
        channel: pt.channel || '',
        authorizationUrl: pt.authorizationUrl || pt.authorizationurl || '',
        authorizationurl: pt.authorizationUrl || pt.authorizationurl || '',
        metadata: pt.metadata || '{}',
        createdAt: pt.createdAt || pt.createdat || new Date().toISOString(),
        createdat: pt.createdAt || pt.createdat || new Date().toISOString(),
        verifiedAt: pt.verifiedAt || pt.verifiedat || '',
        verifiedat: pt.verifiedAt || pt.verifiedat || '',
        webhookData: pt.webhookData || pt.webhookdata || '',
        webhookdata: pt.webhookData || pt.webhookdata || ''
      })),
      ai_chat_logs: parsed.ai_chat_logs || [],
      ai_custom_faqs: parsed.ai_custom_faqs || []
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
      wdv_payments: [],
      payment_transactions: [],
      ai_chat_logs: [],
      ai_custom_faqs: []
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

// Helper to normalize voucher codes for lookup
function normVCode(codeStr: string | undefined): string {
  if (!codeStr) return '';
  return codeStr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// -------------------- DATABASE INITIALIZATION --------------------
export async function initDb() {
  const dbCfg = await validateAndSanitizeDbEnv();
  let candidatePool: pg.Pool | null = null;
  usedSqlHost = false;

  if (dbCfg.connectionString || dbCfg.sqlHost) {
    // 1. Prioritize production DATABASE_URL first if configured
    if (dbCfg.connectionString) {
      try {
        console.log('[SwiftPay DB] Verifying PostgreSQL DATABASE_URL connection...');
        const isLocal = dbCfg.connectionString.includes('localhost') || dbCfg.connectionString.includes('127.0.0.1');
        const sslDisabled = process.env.PGSSLMODE === 'disable' || dbCfg.connectionString.includes('sslmode=disable');
        const primarySsl: any = (isLocal || sslDisabled) ? false : { rejectUnauthorized: false };

        candidatePool = new Pool({
          connectionString: dbCfg.connectionString,
          connectionTimeoutMillis: 8000,
          ssl: primarySsl
        });

        try {
          const testClient = await candidatePool.connect();
          try {
            await testClient.query('SELECT 1');
          } finally {
            testClient.release();
          }
        } catch (firstErr: any) {
          // If Render internal PostgreSQL rejects SSL or requires SSL, automatically negotiate fallback SSL mode
          try { await candidatePool.end(); } catch (_) {}
          const fallbackSsl: any = primarySsl ? false : { rejectUnauthorized: false };
          candidatePool = new Pool({
            connectionString: dbCfg.connectionString,
            connectionTimeoutMillis: 8000,
            ssl: fallbackSsl
          });
          const retryClient = await candidatePool.connect();
          try {
            await retryClient.query('SELECT 1');
          } finally {
            retryClient.release();
          }
        }

        candidatePool.on('error', (err) => {
          console.error('[SwiftPay DB Pool Error]', err.message);
        });
        pgPool = candidatePool;
        isPostgres = true;
        usedSqlHost = false;
        console.log('[SwiftPay DB] PostgreSQL DATABASE_URL connection verified and active.');
      } catch (dbUrlErr: any) {
        console.warn(`[SwiftPay DB] Configured DATABASE_URL failed connection test (${dbUrlErr.message}).`);
        if (candidatePool) {
          try { await candidatePool.end(); } catch (_) {}
          candidatePool = null;
        }
      }
    }

    // 2. If DATABASE_URL was not set or failed to connect, try SQL_HOST if available
    if (!isPostgres && dbCfg.sqlHost) {
      try {
        console.log('[SwiftPay DB] Verifying Cloud SQL connection...');
        candidatePool = new Pool({
          host: dbCfg.sqlHost,
          user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
          password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          connectionTimeoutMillis: 5000,
        });
        candidatePool.on('error', (err) => {
          console.error('[SwiftPay DB Pool Error]', err.message);
        });
        const client = await candidatePool.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          client.release();
        }
        pgPool = candidatePool;
        isPostgres = true;
        usedSqlHost = true;
        console.log('[SwiftPay DB] PostgreSQL SQL_HOST connection verified and active.');
      } catch (sqlHostErr: any) {
        console.warn(`[SwiftPay DB] PostgreSQL SQL_HOST unavailable (${sqlHostErr.message}).`);
        if (candidatePool) {
          try { await candidatePool.end(); } catch (_) {}
          candidatePool = null;
        }
      }
    }

    if (!isPostgres) {
      console.warn(`[SwiftPay DB] No PostgreSQL connection available. Automatically switching to persistent JSON database at ${JSON_FILE}.`);
      pgPool = null;
      getJsonDb();
    }
  } else {
    console.log(`[SwiftPay DB] Using persistent JSON database engine at ${JSON_FILE}...`);
    isPostgres = false;
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
      giftExpiresAt TEXT,
      lastActivityTime TEXT
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
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lastActivityTime TEXT`);
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
      posSlipUploadedBy TEXT,
      approvedAmount REAL DEFAULT 0,
      approvalHistory TEXT DEFAULT '[]'
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
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      userEmail TEXT,
      userName TEXT,
      amount REAL,
      currency TEXT DEFAULT 'NGN',
      provider TEXT,
      providerReference TEXT,
      purpose TEXT DEFAULT 'wallet_funding',
      status TEXT DEFAULT 'pending',
      channel TEXT,
      authorizationUrl TEXT,
      metadata TEXT,
      createdAt TEXT,
      verifiedAt TEXT,
      webhookData TEXT
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      voucherCode TEXT UNIQUE,
      code TEXT,
      amount REAL DEFAULT 6500,
      status TEXT DEFAULT 'unused',
      usedBy TEXT DEFAULT '',
      usedAt TEXT DEFAULT '',
      redeemedBy TEXT DEFAULT '[]',
      generatedAt TEXT,
      createdAt TEXT,
      withdrawalId TEXT DEFAULT '',
      purchasedBy TEXT DEFAULT 'admin'
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
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS email TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS accountName TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS reference TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS voucherCode TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS notes TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS posSlipPath TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS posSlipUploadedAt TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS posSlipUploadedBy TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS approvedAmount REAL DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS approvalHistory TEXT DEFAULT '[]'`);
  } catch (e) {}

  try {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wdvVerified INTEGER DEFAULT 0`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS redeemedBy TEXT DEFAULT '[]'`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS id TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucherCode TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS code TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS amount REAL DEFAULT 6500`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unused'`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS usedBy TEXT DEFAULT ''`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS usedAt TEXT DEFAULT ''`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS generatedAt TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS createdAt TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS withdrawalId TEXT`);
  } catch (e) {}
  try {
    await execute(`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS purchasedBy TEXT`);
  } catch (e) {}

  // Ensure vouchers table schema is complete and compatible in PostgreSQL without losing existing rows
  await ensureVouchersSchemaPostgres();

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

  // Ensure unique indexes for ON CONFLICT target resolution in PostgreSQL
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_uniq ON users(email)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_id_uniq ON vouchers(id)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_code_uniq ON vouchers(voucherCode)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_rawcode_uniq ON vouchers(code)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_settings_key_uniq ON admin_settings(key)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_id_uniq ON password_resets(id)`); } catch (e) {}
  try { await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wdv_payments_ref_uniq ON wdv_payments(reference)`); } catch (e) {}

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
      try {
        await execute(`INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [key, value]);
      } catch (_) {
        try { await execute(`UPDATE admin_settings SET value = $1 WHERE key = $2`, [value, key]); } catch (e2) {}
      }
    }
    console.log('[SwiftPay DB] Default admin settings seeded.');
  }

  // Reinitialize the pool with App user (least privilege) only when SQL_HOST is the active connection
  if (isPostgres && usedSqlHost && process.env.SQL_HOST && process.env.SQL_USER) {
    try {
      await execute(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${process.env.SQL_USER}"`);
      await execute(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${process.env.SQL_USER}"`);
    } catch (_) {}
    console.log('[SwiftPay DB] Schema setup and seeding complete. Switching database connection pool to App user (least privilege)...');
    try {
      if (pgPool) {
        await pgPool.end();
      }
    } catch (err) {
      console.error('[SwiftPay DB] Error closing Admin pool:', err);
    }

    pgPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      connectionTimeoutMillis: 10000,
    });
    pgPool.on('error', (err) => {
      console.error('[SwiftPay DB Pool Error]', err.message);
    });
  }
}

// -------------------- QUERY EXECUTION CONTROLLER --------------------
function isConnectionFailure(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'EPIPE' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '08000' ||
    code === '08003' ||
    code === '08006' ||
    code === '08001' ||
    code === '08004' ||
    code === '28P01' ||
    code === '28000' ||
    code === '3D000' ||
    msg.includes('getaddrinfo') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('pool not initialized') ||
    msg.includes('no pg_hba.conf entry')
  );
}

export async function ensureVouchersSchemaPostgres(): Promise<void> {
  if (!isPostgres || !pgPool) return;
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        voucherCode TEXT UNIQUE,
        code TEXT,
        amount REAL DEFAULT 6500,
        status TEXT DEFAULT 'unused',
        usedBy TEXT DEFAULT '',
        usedAt TEXT DEFAULT '',
        redeemedBy TEXT DEFAULT '[]',
        generatedAt TEXT,
        createdAt TEXT,
        withdrawalId TEXT DEFAULT '',
        purchasedBy TEXT DEFAULT 'admin'
      )
    `);

    const alterCols = [
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS id TEXT`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS voucherCode TEXT`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS code TEXT`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS amount REAL DEFAULT 6500`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unused'`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS usedBy TEXT DEFAULT ''`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS usedAt TEXT DEFAULT ''`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS redeemedBy TEXT DEFAULT '[]'`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS generatedAt TEXT`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS createdAt TEXT`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS withdrawalId TEXT DEFAULT ''`,
      `ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS purchasedBy TEXT DEFAULT 'admin'`
    ];
    for (const stmt of alterCols) {
      try { await pgPool.query(stmt); } catch (_) {}
    }

    // Inspect existing columns in vouchers table to handle legacy types or NOT NULL constraints
    const colRes = await pgPool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vouchers'
    `);
    const existingColNames = new Set(colRes.rows.map((r: any) => String(r.column_name)));
    const textCols = new Set([
      'id', 'vouchercode', 'code', 'status', 'usedby', 'usedat',
      'generatedat', 'createdat', 'withdrawalid', 'purchasedby', 'redeemedby'
    ]);

    for (const row of colRes.rows) {
      const colName = String(row.column_name);
      const lowerName = colName.toLowerCase();
      const dataType = String(row.data_type || '').toLowerCase();
      const isNullable = String(row.is_nullable || '').toUpperCase();

      // If a mixed-case quoted column exists alongside or instead of lowercase
      if (colName !== lowerName) {
        if (!existingColNames.has(lowerName)) {
          try {
            await pgPool.query(`ALTER TABLE vouchers RENAME COLUMN "${colName}" TO ${lowerName}`);
            existingColNames.add(lowerName);
          } catch (_) {}
        } else {
          try {
            await pgPool.query(`UPDATE vouchers SET ${lowerName} = COALESCE(${lowerName}, "${colName}"::text) WHERE ${lowerName} IS NULL OR ${lowerName} = ''`);
            await pgPool.query(`ALTER TABLE vouchers ALTER COLUMN "${colName}" DROP NOT NULL`);
          } catch (_) {}
        }
      }

      // Convert any non-text target columns (e.g. integer id or timestamp usedAt) to TEXT
      if (textCols.has(lowerName) && dataType !== 'text' && dataType !== 'character varying') {
        try {
          await pgPool.query(`ALTER TABLE vouchers ALTER COLUMN "${colName}" DROP DEFAULT`);
        } catch (_) {}
        try {
          await pgPool.query(`ALTER TABLE vouchers ALTER COLUMN "${colName}" TYPE TEXT USING "${colName}"::text`);
        } catch (_) {}
      }

      // Drop unexpected NOT NULL constraints on non-PK columns so inserts never fail
      if (isNullable === 'NO' && lowerName !== 'id' && lowerName !== 'code' && lowerName !== 'vouchercode') {
        try {
          await pgPool.query(`ALTER TABLE vouchers ALTER COLUMN "${colName}" DROP NOT NULL`);
        } catch (_) {}
      }
    }

    // Backfill legacy rows safely without deleting any existing records
    try {
      await pgPool.query(`UPDATE vouchers SET code = voucherCode WHERE (code IS NULL OR code = '') AND voucherCode IS NOT NULL AND voucherCode <> ''`);
      await pgPool.query(`UPDATE vouchers SET voucherCode = code WHERE (voucherCode IS NULL OR voucherCode = '') AND code IS NOT NULL AND code <> ''`);
      await pgPool.query(`UPDATE vouchers SET id = 'v-' || COALESCE(voucherCode, code) WHERE (id IS NULL OR id = '') AND COALESCE(voucherCode, code) IS NOT NULL`);
      await pgPool.query(`UPDATE vouchers SET status = 'unused' WHERE status IS NULL OR status = ''`);
      await pgPool.query(`UPDATE vouchers SET amount = 6500 WHERE amount IS NULL`);
      await pgPool.query(`UPDATE vouchers SET generatedAt = COALESCE(generatedAt, createdAt, $1) WHERE generatedAt IS NULL OR generatedAt = ''`, [new Date().toISOString()]);
      await pgPool.query(`UPDATE vouchers SET createdAt = COALESCE(createdAt, generatedAt) WHERE createdAt IS NULL OR createdAt = ''`);
    } catch (_) {}
  } catch (err: any) {
    console.warn('[SwiftPay DB] Warning during ensureVouchersSchemaPostgres:', err.message);
  }
}

function executeJson(sql: string, params: any[] = []): any {
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
            beneficiaries: safeStringifyJsonField(params[17]),
            phonebeneficiaries: safeStringifyJsonField(params[18]),
            loginhistory: safeStringifyJsonField(params[19]),
            notifications: safeStringifyJsonField(params[20]),
            transactions: safeStringifyJsonField(params[21]),
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
        } else if (sqlUpper.includes('UPDATE USERS')) {
          const emailParam = params[params.length - 1];
          if (emailParam) {
            const lowerEmail = String(emailParam).toLowerCase();
            const u = db.users.find(x => x.email === lowerEmail);
            if (u) {
              if (sqlUpper.includes('BALANCE =')) {
                u.balance = Number(params[0]);
              }
            }
          }
        } else if (sqlUpper.includes('DELETE FROM USERS')) {
          const email = (params[0] || '').toLowerCase();
          db.users = db.users.filter(u => u.email !== email);
        } else if (sqlUpper.includes('INSERT INTO VOUCHERS')) {
          // Flexible mapping for vouchers insert
          let vId = '';
          let vCode = '';
          let amt = 6500;
          let st = 'unused';
          let uBy = '';
          let uAt = '';
          let genAt = new Date().toISOString();
          let wId = '';
          let pBy = 'admin';
          let rBy = '[]';

          if (params.length >= 12) {
            vId = params[0];
            vCode = params[1] || params[2];
            amt = Number(params[3] ?? 6500);
            st = params[4] || 'unused';
            uBy = params[5] || '';
            uAt = params[6] || '';
            genAt = params[7] || params[8] || new Date().toISOString();
            wId = params[9] || '';
            pBy = params[10] || 'admin';
            rBy = safeStringifyJsonField(params[11]);
          } else if (params.length >= 11) {
            vId = params[0];
            vCode = params[1] || params[2];
            amt = Number(params[3] ?? 6500);
            st = params[4] || 'unused';
            uBy = params[5] || '';
            uAt = params[6] || '';
            genAt = params[7] || new Date().toISOString();
            wId = params[8] || '';
            pBy = params[9] || 'admin';
            rBy = safeStringifyJsonField(params[10]);
          } else {
            vCode = params[0];
            amt = Number(params[1] ?? 6500);
            st = params[2] || 'unused';
            uBy = params[3] || '';
            uAt = params[4] || '';
            rBy = safeStringifyJsonField(params[5]);
            vId = `v-${normVCode(vCode) || Date.now()}`;
          }

          const voucherObj = {
            id: vId || `v-${normVCode(vCode)}`,
            vouchercode: vCode,
            code: vCode,
            voucherCode: vCode,
            amount: amt,
            status: st,
            usedby: uBy,
            usedBy: uBy,
            usedat: uAt,
            usedAt: uAt,
            generatedat: genAt,
            generatedAt: genAt,
            createdat: genAt,
            createdAt: genAt,
            withdrawalid: wId,
            withdrawalId: wId,
            purchasedby: pBy,
            purchasedBy: pBy,
            redeemedby: rBy,
            redeemedBy: rBy
          };

          db.vouchers = db.vouchers.filter(x => x.id !== voucherObj.id && normVCode(x.code) !== normVCode(vCode));
          db.vouchers.push(voucherObj);
        } else if (sqlUpper.includes('UPDATE VOUCHERS')) {
          // Match voucher by ID or code at end of params
          const target = params[params.length - 1];
          const normTarget = normVCode(String(target));

          const v = db.vouchers.find(x => x.id === target || normVCode(x.code) === normTarget || normVCode(x.voucherCode) === normTarget);
          if (v) {
            if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
              v.status = params[0];
            }
            if (sqlUpper.includes('USEDAT =') || sqlUpper.includes('USEDAT=')) {
              v.usedat = params[1] || new Date().toISOString();
              v.usedAt = v.usedat;
            }
            if (sqlUpper.includes('USEDBY =') || sqlUpper.includes('USEDBY=')) {
              v.usedby = params[2] || '';
              v.usedBy = v.usedby;
            }
            if (sqlUpper.includes('WITHDRAWALID =') || sqlUpper.includes('WITHDRAWALID=')) {
              v.withdrawalid = params[3] || '';
              v.withdrawalId = v.withdrawalid;
            }
            if (sqlUpper.includes('REDEEMEDBY =') || sqlUpper.includes('REDEEMEDBY=')) {
              const rVal = params[3] || params[2] || '[]';
              v.redeemedby = safeStringifyJsonField(rVal);
              v.redeemedBy = v.redeemedby;
            }
          }
        } else if (sqlUpper.includes('DELETE FROM VOUCHERS')) {
          const target = params[0];
          const normTarget = normVCode(String(target));
          db.vouchers = db.vouchers.filter(v => v.id !== target && normVCode(v.code) !== normTarget && normVCode(v.voucherCode) !== normTarget);
        } else if (sqlUpper.includes('INSERT INTO WDV_PAYMENTS')) {
          const p = {
            id: params[0],
            reference: params[1],
            useremail: (params[2] || '').toLowerCase(),
            userEmail: (params[2] || '').toLowerCase(),
            amount: Number(params[3] ?? 0),
            bankname: params[4],
            bankName: params[4],
            accountnumber: params[5],
            accountNumber: params[5],
            accountname: params[6],
            accountName: params[6],
            status: params[7] || 'pending',
            createdat: params[8] || new Date().toISOString(),
            createdAt: params[8] || new Date().toISOString(),
            expiresat: params[9] || '',
            expiresAt: params[9] || '',
            paidat: params[10] || '',
            paidAt: params[10] || '',
            vouchercode: params[11] || '',
            voucherCode: params[11] || '',
            provider: params[12] || 'manual_transfer',
            webhookdata: params[13] || '',
            webhookData: params[13] || ''
          };
          db.wdv_payments = db.wdv_payments || [];
          db.wdv_payments = db.wdv_payments.filter((x: any) => x.reference !== p.reference && x.id !== p.id);
          db.wdv_payments.push(p);
        } else if (sqlUpper.includes('INSERT INTO PAYMENT_TRANSACTIONS')) {
          const pt = {
            id: params[0],
            reference: params[1],
            useremail: (params[2] || '').toLowerCase(),
            userEmail: (params[2] || '').toLowerCase(),
            username: params[3] || '',
            userName: params[3] || '',
            amount: Number(params[4] || 0),
            currency: params[5] || 'NGN',
            provider: params[6] || 'korapay',
            providerreference: params[7] || '',
            providerReference: params[7] || '',
            purpose: params[8] || 'wallet_funding',
            status: params[9] || 'pending',
            channel: params[10] || '',
            authorizationurl: params[11] || '',
            authorizationUrl: params[11] || '',
            metadata: params[12] || '{}',
            createdat: params[13] || new Date().toISOString(),
            createdAt: params[13] || new Date().toISOString(),
            verifiedat: params[14] || '',
            verifiedAt: params[14] || '',
            webhookdata: params[15] || '',
            webhookData: params[15] || ''
          };
          db.payment_transactions = db.payment_transactions || [];
          db.payment_transactions = db.payment_transactions.filter((x: any) => x.reference !== pt.reference && x.id !== pt.id);
          db.payment_transactions.push(pt);
        } else if (sqlUpper.includes('UPDATE PAYMENT_TRANSACTIONS')) {
          db.payment_transactions = db.payment_transactions || [];
          const refParam = params[params.length - 1];
          const pt = db.payment_transactions.find((x: any) => x.reference === refParam || x.id === refParam);
          if (pt) {
            if (sqlUpper.includes("STATUS = 'SUCCESSFUL'") || sqlUpper.includes("STATUS='SUCCESSFUL'")) {
              pt.status = 'successful';
              pt.verifiedat = params[0] || new Date().toISOString();
              pt.verifiedAt = pt.verifiedat;
              if (params[1] !== undefined) {
                pt.providerreference = params[1] || '';
                pt.providerReference = pt.providerreference;
              }
              if (params[2] !== undefined) {
                pt.webhookdata = params[2] || '';
                pt.webhookData = pt.webhookdata;
              }
              if (params[3] !== undefined) {
                pt.channel = params[3] || pt.channel || 'card';
              }
            } else {
              if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
                pt.status = params[0];
              }
              if (sqlUpper.includes('VERIFIEDAT =') || sqlUpper.includes('VERIFIEDAT=')) {
                pt.verifiedat = params[1] || new Date().toISOString();
                pt.verifiedAt = pt.verifiedat;
              }
              if (sqlUpper.includes('PROVIDERREFERENCE =') || sqlUpper.includes('PROVIDERREFERENCE=')) {
                pt.providerreference = params[2] || '';
                pt.providerReference = pt.providerreference;
              }
            }
          }
        } else if (sqlUpper.includes('UPDATE WDV_PAYMENTS')) {
          db.wdv_payments = db.wdv_payments || [];
          const refParam = params[params.length - 1];
          const p = db.wdv_payments.find((x: any) => x.reference === refParam || x.id === refParam);
          if (p) {
            if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
              p.status = params[0];
            }
            if (sqlUpper.includes('PAIDAT =') || sqlUpper.includes('PAIDAT=')) {
              p.paidat = params[1] || new Date().toISOString();
              p.paidAt = p.paidat;
            }
            if (sqlUpper.includes('VOUCHERCODE =') || sqlUpper.includes('VOUCHERCODE=')) {
              p.vouchercode = params[2] || params[1] || '';
              p.voucherCode = p.vouchercode;
            }
            if (sqlUpper.includes('WEBHOOKDATA =') || sqlUpper.includes('WEBHOOKDATA=')) {
              p.webhookdata = params[3] || '';
              p.webhookData = p.webhookdata;
            }
          }
        } else if (sqlUpper.includes('INSERT INTO WITHDRAW_REQUESTS')) {
          const w = {
            id: params[0],
            userid: params[1],
            userId: params[1],
            email: params[2],
            amount: Number(params[3] ?? 0),
            bankname: params[4],
            bankName: params[4],
            accountnumber: params[5],
            accountNumber: params[5],
            accountname: params[6],
            accountName: params[6],
            status: params[7] || 'pending',
            timestamp: params[8] || new Date().toISOString(),
            created_at: params[8] || new Date().toISOString(),
            reference: params[9],
            vouchercode: params[10] || '',
            voucherCode: params[10] || '',
            notes: params[11] || '',
            posSlippath: params[12] || '',
            posSlipPath: params[12] || '',
            posSlipuploadedAt: params[13] || '',
            posSlipUploadedAt: params[13] || '',
            posSlipuploadedBy: params[14] || '',
            posSlipUploadedBy: params[14] || ''
          };
          db.withdraw_requests = db.withdraw_requests || [];
          db.withdraw_requests = db.withdraw_requests.filter((x: any) => x.id !== w.id);
          db.withdraw_requests.push(w);
        } else if (sqlUpper.includes('UPDATE WITHDRAW_REQUESTS')) {
          db.withdraw_requests = db.withdraw_requests || [];
          const targetId = params[params.length - 1];
          if (targetId) {
            const req = db.withdraw_requests.find((x: any) => x.id === targetId);
            if (req) {
              if (sqlUpper.includes('APPROVEDAMOUNT =') || sqlUpper.includes('APPROVEDAMOUNT=')) {
                // If updating status, approvedAmount, approvalHistory
                if (sqlUpper.includes('STATUS =') && sqlUpper.includes('APPROVALHISTORY =')) {
                  req.status = params[0];
                  req.approvedAmount = Number(params[1] || 0);
                  req.approvedamount = Number(params[1] || 0);
                  req.approvalHistory = typeof params[2] === 'string' ? (safeParseJsonField(params[2]) || []) : (params[2] || []);
                } else if (sqlUpper.includes('APPROVEDAMOUNT =')) {
                  req.approvedAmount = Number(params[0] || 0);
                  req.approvedamount = Number(params[0] || 0);
                }
              }
              if (sqlUpper.includes('APPROVALHISTORY =') || sqlUpper.includes('APPROVALHISTORY=')) {
                if (!sqlUpper.includes('STATUS =')) {
                  req.approvalHistory = typeof params[0] === 'string' ? (safeParseJsonField(params[0]) || []) : (params[0] || []);
                }
              }
              if (sqlUpper.includes('STATUS =') || sqlUpper.includes('STATUS=')) {
                if (sqlUpper.includes('STATUS =') && sqlUpper.includes('NOTES =')) {
                  req.status = params[0];
                  req.notes = params[1];
                } else if (!sqlUpper.includes('APPROVEDAMOUNT =')) {
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
                req.posSlipPath = params[0];
                req.posSlipuploadedAt = params[1];
                req.posSlipUploadedAt = params[1];
                req.posSlipuploadedBy = params[2];
                req.posSlipUploadedBy = params[2];
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
        } else if (sqlUpper.includes('DELETE FROM ADMIN_SETTINGS')) {
          const k = params[0];
          if (k) {
            delete db.admin_settings[k];
          }
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
        } else if (sqlUpper.includes('INSERT INTO AI_CHAT_LOGS')) {
          db.ai_chat_logs = db.ai_chat_logs || [];
          db.ai_chat_logs.unshift({
            id: params[0],
            session_id: params[1],
            user_email: params[2],
            user_message: params[3],
            ai_response: params[4],
            escalated_to_whatsapp: params[5],
            is_unanswered: params[6],
            timestamp: params[7]
          });
        } else if (sqlUpper.includes('INSERT INTO AI_CUSTOM_FAQS')) {
          db.ai_custom_faqs = db.ai_custom_faqs || [];
          db.ai_custom_faqs.push({
            id: params[0],
            question: params[1],
            answer: params[2],
            created_at: params[3]
          });
        } else if (sqlUpper.includes('DELETE FROM AI_CUSTOM_FAQS')) {
          db.ai_custom_faqs = db.ai_custom_faqs || [];
          db.ai_custom_faqs = db.ai_custom_faqs.filter((f: any) => f.id !== params[0]);
        }
        
        saveJsonDb(db);
        return { rows: [], lastID: Date.now(), changes: 1 };
}

export function execute(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres && pgPool) {
      pgPool.query(sql, params, (err, res) => {
        if (err) {
          if (isConnectionFailure(err)) {
            console.warn(`[SwiftPay DB] PostgreSQL connection error during execute (${err.message}); switching to JSON fallback.`);
            isPostgres = false;
            try {
              return resolve(executeJson(sql, params));
            } catch (jsonErr) {
              return reject(jsonErr);
            }
          }
          return reject(err);
        }
        resolve(res);
      });
    } else {
      try {
        resolve(executeJson(sql, params));
      } catch (err) {
        reject(err);
      }
    }
  });
}

function getRowJson(sql: string, params: any[] = []): any {
  const db = getJsonDb();
  const sqlUpper = sql.toUpperCase();

  if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM USERS') || sqlUpper.includes('COUNT(*) AS COUNT FROM USERS')) {
    return { count: db.users.length };
  }
  if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM VOUCHERS') || sqlUpper.includes('COUNT(*) AS COUNT FROM VOUCHERS')) {
    return { count: db.vouchers.length };
  }
  if (sqlUpper.includes('SELECT COUNT(*) AS COUNT FROM ADMIN_SETTINGS') || sqlUpper.includes('COUNT(*) AS COUNT FROM ADMIN_SETTINGS')) {
    return { count: Object.keys(db.admin_settings).length };
  }
  if (sqlUpper.includes('FROM ADMINS')) {
    const email = (params[0] || '').toLowerCase();
    return db.admins.find(a => a.email === email) || null;
  }
  if (sqlUpper.includes('FROM USERS')) {
    const target = (params[0] || '').toLowerCase();
    return db.users.find(u => u.email === target || u.phone === target) || null;
  }
  if (sqlUpper.includes('FROM VOUCHERS')) {
    const rawCode = params[0] || params[1] || '';
    const normCode = normVCode(String(rawCode));
    const row = db.vouchers.find(v =>
      v.id === rawCode ||
      v.withdrawalid === rawCode ||
      v.withdrawalId === rawCode ||
      normVCode(v.code) === normCode ||
      normVCode(v.voucherCode) === normCode
    );
    return row || null;
  }
  if (sqlUpper.includes('FROM WITHDRAW_REQUESTS')) {
    db.withdraw_requests = db.withdraw_requests || [];
    const idVal = params[0];
    return db.withdraw_requests.find((w: any) => w.id === idVal) || null;
  }
  if (sqlUpper.includes('FROM WDV_PAYMENTS')) {
    db.wdv_payments = db.wdv_payments || [];
    const refVal = params[0];
    if (sqlUpper.includes('LOWER(USEREMAIL)')) {
      const targetEmail = String(refVal || '').toLowerCase();
      const matches = db.wdv_payments.filter((p: any) =>
        (p.useremail || p.userEmail || '').toLowerCase() === targetEmail &&
        (!sqlUpper.includes("STATUS = 'PENDING'") || p.status === 'pending')
      );
      return matches[matches.length - 1] || null;
    }
    return db.wdv_payments.find((p: any) => p.reference === refVal || p.id === refVal) || null;
  }
  if (sqlUpper.includes('FROM PAYMENT_TRANSACTIONS')) {
    db.payment_transactions = db.payment_transactions || [];
    const refVal = params[0];
    return db.payment_transactions.find((p: any) => p.reference === refVal || p.id === refVal) || null;
  }
  if (sqlUpper.includes('FROM ADMIN_SETTINGS')) {
    const keyVal = params[0];
    if (keyVal && db.admin_settings[keyVal] !== undefined) {
      return { key: keyVal, value: db.admin_settings[keyVal] };
    }
    return null;
  }

  return null;
}

export function getRow(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (isPostgres && pgPool) {
      pgPool.query(sql, params, (err, res) => {
        if (err) {
          if (isConnectionFailure(err)) {
            console.warn(`[SwiftPay DB] PostgreSQL connection error during getRow (${err.message}); switching to JSON fallback.`);
            isPostgres = false;
            try {
              return resolve(getRowJson(sql, params));
            } catch (jsonErr) {
              return reject(jsonErr);
            }
          }
          return reject(err);
        }
        resolve(res.rows[0] || null);
      });
    } else {
      try {
        resolve(getRowJson(sql, params));
      } catch (err) {
        reject(err);
      }
    }
  });
}

function getAllRowsJson(sql: string, params: any[] = []): any[] {
  const db = getJsonDb();
  const sqlUpper = sql.toUpperCase();

  if (sqlUpper.includes('FROM ADMIN_SETTINGS')) {
    return Object.entries(db.admin_settings).map(([key, value]) => ({ key, value }));
  }
  if (sqlUpper.includes('FROM USERS')) {
    return db.users;
  }
  if (sqlUpper.includes('FROM VOUCHERS')) {
    const sorted = [...db.vouchers].sort((a, b) => {
      const tA = new Date(a.generatedAt || a.generatedat || 0).getTime();
      const tB = new Date(b.generatedAt || b.generatedat || 0).getTime();
      return tB - tA;
    });
    return sorted;
  }
  if (sqlUpper.includes('FROM PASSWORD_RESETS')) {
    return db.password_resets;
  }
  if (sqlUpper.includes('FROM LOGS')) {
    return db.logs;
  }
  if (sqlUpper.includes('FROM WITHDRAW_REQUESTS')) {
    db.withdraw_requests = db.withdraw_requests || [];
    return db.withdraw_requests;
  }
  if (sqlUpper.includes('FROM WDV_PAYMENTS')) {
    db.wdv_payments = db.wdv_payments || [];
    return db.wdv_payments;
  }
  if (sqlUpper.includes('FROM PAYMENT_TRANSACTIONS')) {
    db.payment_transactions = db.payment_transactions || [];
    return db.payment_transactions;
  }
  if (sqlUpper.includes('FROM AI_CHAT_LOGS')) {
    db.ai_chat_logs = db.ai_chat_logs || [];
    return db.ai_chat_logs;
  }
  if (sqlUpper.includes('FROM AI_CUSTOM_FAQS')) {
    db.ai_custom_faqs = db.ai_custom_faqs || [];
    return db.ai_custom_faqs;
  }

  return [];
}

export function getAllRows(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (isPostgres && pgPool) {
      pgPool.query(sql, params, (err, res) => {
        if (err) {
          if (isConnectionFailure(err)) {
            console.warn(`[SwiftPay DB] PostgreSQL connection error during getAllRows (${err.message}); switching to JSON fallback.`);
            isPostgres = false;
            try {
              return resolve(getAllRowsJson(sql, params));
            } catch (jsonErr) {
              return reject(jsonErr);
            }
          }
          return reject(err);
        }
        resolve(res.rows);
      });
    } else {
      try {
        resolve(getAllRowsJson(sql, params));
      } catch (err) {
        reject(err);
      }
    }
  });
}

export function generateSecureVoucherCode(): string {
  const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const p1 = hex.slice(0, 4);
  const p2 = hex.slice(4, 8);
  const p3 = hex.slice(8, 12);
  return `WDV-${p1}-${p2}-${p3}`;
}

export interface CreateVoucherParams {
  amount?: number;
  purchasedBy?: string;
  withdrawalId?: string;
  preferredCode?: string;
}

export interface CreatedVoucherRecord {
  id: string;
  code: string;
  voucherCode: string;
  amount: number;
  status: string;
  usedBy: string;
  usedAt: string;
  generatedAt: string;
  createdAt: string;
  withdrawalId: string;
  purchasedBy: string;
  redeemedBy: any[];
}

/**
 * Atomically generates and stores a cryptographically unique WDV voucher in the active datastore.
 * Uses an explicit PostgreSQL transaction (BEGIN ... INSERT ... RETURNING ... COMMIT) when PostgreSQL is active.
 */
export async function createVoucherAtomic(params: CreateVoucherParams = {}): Promise<CreatedVoucherRecord> {
  const amount = Number(params.amount ?? 6500);
  const purchasedBy = params.purchasedBy || 'admin';
  const withdrawalId = params.withdrawalId || '';
  const maxAttempts = 15;

  if (isPostgres && pgPool) {
    let client: pg.PoolClient | null = null;
    try {
      client = await pgPool.connect();
    } catch (connErr: any) {
      if (isConnectionFailure(connErr)) {
        console.warn(`[SwiftPay DB] PostgreSQL connection error in createVoucherAtomic (${connErr.message}); switching to JSON fallback.`);
        isPostgres = false;
      } else {
        throw connErr;
      }
    }

    if (client && isPostgres) {
      let schemaCheckedOnRetry = false;
      try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const code = (attempt === 0 && params.preferredCode) ? params.preferredCode : generateSecureVoucherCode();
          const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          const generatedAt = new Date().toISOString();

          await client.query('BEGIN');
          try {
            const dupCheck = await client.query(
              `SELECT 1 FROM vouchers WHERE voucherCode = $1 OR code = $1 OR id = $2 LIMIT 1`,
              [code, id]
            );
            if (dupCheck.rows.length > 0) {
              await client.query('ROLLBACK');
              continue;
            }

            const insertRes = await client.query(
              `INSERT INTO vouchers (
                id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, createdAt, withdrawalId, purchasedBy, redeemedBy
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *`,
              [id, code, code, amount, 'unused', '', '', generatedAt, generatedAt, withdrawalId, purchasedBy, '[]']
            );

            await client.query('COMMIT');
            const row = insertRes.rows[0] || {};
            const finalCode = row.vouchercode || row.voucherCode || row.code || code;
            const finalId = row.id || id;
            const finalGenAt = row.generatedat || row.generatedAt || row.createdat || row.createdAt || generatedAt;

            return {
              id: finalId,
              code: finalCode,
              voucherCode: finalCode,
              amount: Number(row.amount ?? amount),
              status: row.status || 'unused',
              usedBy: row.usedby || row.usedBy || '',
              usedAt: row.usedat || row.usedAt || '',
              generatedAt: finalGenAt,
              createdAt: finalGenAt,
              withdrawalId: row.withdrawalid || row.withdrawalId || withdrawalId,
              purchasedBy: row.purchasedby || row.purchasedBy || purchasedBy,
              redeemedBy: []
            };
          } catch (txErr: any) {
            try { await client.query('ROLLBACK'); } catch (_) {}
            const pgCode = String(txErr?.code || '');
            // 23505 = unique_violation in PostgreSQL -> retry with a new code
            if (pgCode === '23505') {
              continue;
            }
            // If a column/table/type mismatch occurred on first attempt, auto-heal schema and retry
            if (!schemaCheckedOnRetry && (pgCode === '42703' || pgCode === '42P01' || pgCode === '22P02' || pgCode === '23502')) {
              schemaCheckedOnRetry = true;
              await ensureVouchersSchemaPostgres();
              continue;
            }
            if (isConnectionFailure(txErr)) {
              console.warn(`[SwiftPay DB] PostgreSQL connection error during voucher insert (${txErr.message}); switching to JSON fallback.`);
              isPostgres = false;
              break;
            }
            throw txErr;
          }
        }
        if (isPostgres) {
          throw new Error('Exhausted attempts to generate a unique voucher code in PostgreSQL.');
        }
      } finally {
        client.release();
      }
    }
  }

  // Fallback for local development JSON datastore
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = (attempt === 0 && params.preferredCode) ? params.preferredCode : generateSecureVoucherCode();
    const existing = getRowJson(`SELECT 1 FROM vouchers WHERE voucherCode = $1 OR code = $1`, [code]);
    if (existing) {
      continue;
    }

    const id = `v-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const generatedAt = new Date().toISOString();

    executeJson(
      `INSERT INTO vouchers (id, voucherCode, code, amount, status, usedBy, usedAt, generatedAt, withdrawalId, purchasedBy, redeemedBy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, code, code, amount, 'unused', '', '', generatedAt, withdrawalId, purchasedBy, '[]']
    );

    const verifyInserted = getRowJson(`SELECT * FROM vouchers WHERE voucherCode = $1`, [code]);
    if (!verifyInserted) {
      throw new Error('Failed to verify persisted voucher in datastore.');
    }

    return {
      id,
      code,
      voucherCode: code,
      amount,
      status: 'unused',
      usedBy: '',
      usedAt: '',
      generatedAt,
      createdAt: generatedAt,
      withdrawalId,
      purchasedBy,
      redeemedBy: []
    };
  }

  throw new Error('Exhausted attempts to generate a unique voucher code.');
}

export function isPostgresActive(): boolean {
  return isPostgres;
}

function maskDatabaseUrl(rawUrl: string): { maskedUrl: string; host: string; database: string } {
  if (!rawUrl) {
    return { maskedUrl: 'not_set', host: 'not_set', database: 'not_set' };
  }
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname || 'unknown';
    const port = parsed.port ? `:${parsed.port}` : '';
    const dbName = (parsed.pathname || '').replace(/^\//, '') || 'unknown';
    const user = parsed.username ? `${parsed.username}:***@` : '';
    return {
      maskedUrl: `${parsed.protocol}//${user}${host}${port}/${dbName}`,
      host,
      database: dbName
    };
  } catch {
    return { maskedUrl: 'invalid_url_format', host: 'invalid_url', database: 'unknown' };
  }
}

export interface PostgresDiagnosticResult {
  connected: boolean;
  databaseUrlConnected: boolean;
  activeDatastore: 'postgresql' | 'json_fallback';
  databaseUrlConfigured: boolean;
  maskedConnection: string;
  host: string;
  database: string;
  databaseUser?: string;
  serverTime?: string;
  pgVersion?: string;
  latencyMs: number;
  vouchersCount?: number;
  usersCount?: number;
  databaseUrlError?: string;
  error?: string;
  errorCode?: string;
  timestamp: string;
}

/**
 * Executes a live diagnostic query directly against the configured DATABASE_URL (PostgreSQL)
 * and logs the detailed result to the server logs.
 */
export async function runPostgresDiagnosticQuery(): Promise<PostgresDiagnosticResult> {
  const startMs = Date.now();
  const timestamp = new Date().toISOString();
  const effectiveRawUrl = (process.env.DATABASE_URL || configuredRawDatabaseUrl || '').trim();
  const effectiveSqlHost = (process.env.SQL_HOST || configuredRawSqlHost || '').trim();
  const hasDbUrl = Boolean(effectiveRawUrl && effectiveRawUrl !== 'postgresql://user:password@localhost:5432/swiftpay');
  const { maskedUrl, host, database } = hasDbUrl
    ? maskDatabaseUrl(effectiveRawUrl)
    : effectiveSqlHost
      ? { maskedUrl: `postgresql://${effectiveSqlHost}/${process.env.SQL_DB_NAME || ''}`, host: effectiveSqlHost, database: process.env.SQL_DB_NAME || 'unknown' }
      : { maskedUrl: 'not_configured', host: 'none', database: 'none' };

  console.log(`[SwiftPay DB Diagnostic] Starting PostgreSQL connectivity check against DATABASE_URL (host=${host}, db=${database}, activeEngine=${isPostgres ? 'postgresql' : 'json_fallback'})...`);

  // 1. Always probe configured DATABASE_URL directly when DATABASE_URL is set
  let databaseUrlError: string | undefined;
  let databaseUrlErrorCode: string | undefined;
  if (hasDbUrl) {
    // If pgPool is already connected to DATABASE_URL (not SQL_HOST), query pgPool directly
    if (isPostgres && pgPool && !usedSqlHost) {
      try {
        const metaRes = await pgPool.query(`
          SELECT
            1 AS ok,
            NOW() AS server_time,
            current_database() AS database_name,
            current_user AS database_user,
            version() AS pg_version
        `);
        const countRes = await pgPool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM vouchers) AS vouchers_count,
            (SELECT COUNT(*)::int FROM users) AS users_count
        `);
        const latencyMs = Date.now() - startMs;
        const metaRow = metaRes.rows[0] || {};
        const countRow = countRes.rows[0] || {};

        const result: PostgresDiagnosticResult = {
          connected: true,
          databaseUrlConnected: true,
          activeDatastore: 'postgresql',
          databaseUrlConfigured: true,
          maskedConnection: maskedUrl,
          host,
          database: metaRow.database_name || database,
          databaseUser: metaRow.database_user || 'unknown',
          serverTime: metaRow.server_time ? new Date(metaRow.server_time).toISOString() : timestamp,
          pgVersion: String(metaRow.pg_version || '').split(',')[0],
          latencyMs,
          vouchersCount: Number(countRow.vouchers_count ?? 0),
          usersCount: Number(countRow.users_count ?? 0),
          timestamp
        };

        console.log(
          `[SwiftPay DB Diagnostic] DATABASE_URL SUCCESS: Connected to Render PostgreSQL database "${result.database}" on host "${result.host}" as "${result.databaseUser}" in ${latencyMs}ms | serverTime=${result.serverTime} | vouchers=${result.vouchersCount} | users=${result.usersCount}`
        );
        return result;
      } catch (err: any) {
        databaseUrlError = err?.message || String(err);
        databaseUrlErrorCode = err?.code || 'QUERY_ERROR';
        console.error(
          `[SwiftPay DB Diagnostic] DATABASE_URL ERROR on active pool (host=${host}, db=${database}, code=${databaseUrlErrorCode}): ${databaseUrlError}`
        );
      }
    } else {
      // Probe DATABASE_URL directly with a dedicated diagnostic connection
      let tempPool: pg.Pool | null = null;
      try {
        const isLocal = effectiveRawUrl.includes('localhost') || effectiveRawUrl.includes('127.0.0.1');
        const sslDisabled = process.env.PGSSLMODE === 'disable' || effectiveRawUrl.includes('sslmode=disable');
        tempPool = new Pool({
          connectionString: effectiveRawUrl,
          connectionTimeoutMillis: 6000,
          ssl: (isLocal || sslDisabled) ? false : { rejectUnauthorized: false }
        });

        const metaRes = await tempPool.query(`
          SELECT
            1 AS ok,
            NOW() AS server_time,
            current_database() AS database_name,
            current_user AS database_user,
            version() AS pg_version
        `);
        let vouchersCount = 0;
        let usersCount = 0;
        try {
          const countRes = await tempPool.query(`
            SELECT
              (SELECT COUNT(*)::int FROM vouchers) AS vouchers_count,
              (SELECT COUNT(*)::int FROM users) AS users_count
          `);
          vouchersCount = Number(countRes.rows[0]?.vouchers_count ?? 0);
          usersCount = Number(countRes.rows[0]?.users_count ?? 0);
        } catch (_) {}

        const latencyMs = Date.now() - startMs;
        const metaRow = metaRes.rows[0] || {};

        const result: PostgresDiagnosticResult = {
          connected: true,
          databaseUrlConnected: true,
          activeDatastore: isPostgres ? 'postgresql' : 'json_fallback',
          databaseUrlConfigured: true,
          maskedConnection: maskedUrl,
          host,
          database: metaRow.database_name || database,
          databaseUser: metaRow.database_user || 'unknown',
          serverTime: metaRow.server_time ? new Date(metaRow.server_time).toISOString() : timestamp,
          pgVersion: String(metaRow.pg_version || '').split(',')[0],
          latencyMs,
          vouchersCount,
          usersCount,
          timestamp
        };

        console.log(
          `[SwiftPay DB Diagnostic] DATABASE_URL SUCCESS: Connected to Render PostgreSQL database "${result.database}" on host "${result.host}" as "${result.databaseUser}" in ${latencyMs}ms | vouchers=${vouchersCount} | users=${usersCount}`
        );
        return result;
      } catch (directErr: any) {
        databaseUrlError = directErr?.message || String(directErr);
        databaseUrlErrorCode = directErr?.code || 'CONNECTION_FAILED';
        console.error(
          `[SwiftPay DB Diagnostic] DATABASE_URL FAILED (host=${host}, db=${database}, code=${databaseUrlErrorCode}): ${databaseUrlError}`
        );
      } finally {
        if (tempPool) {
          try { await tempPool.end(); } catch (_) {}
        }
      }
    }
  }

  // 2. If DATABASE_URL failed or was not set, check if fallback PostgreSQL (SQL_HOST) is active
  if (isPostgres && pgPool) {
    try {
      const metaRes = await pgPool.query(`
        SELECT
          NOW() AS server_time,
          current_database() AS database_name,
          current_user AS database_user,
          version() AS pg_version
      `);
      const countRes = await pgPool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM vouchers) AS vouchers_count,
          (SELECT COUNT(*)::int FROM users) AS users_count
      `);
      const latencyMs = Date.now() - startMs;
      const metaRow = metaRes.rows[0] || {};
      const countRow = countRes.rows[0] || {};

      const result: PostgresDiagnosticResult = {
        connected: true,
        databaseUrlConnected: false,
        activeDatastore: 'postgresql',
        databaseUrlConfigured: hasDbUrl,
        maskedConnection: maskedUrl,
        host,
        database: metaRow.database_name || database,
        databaseUser: metaRow.database_user || 'unknown',
        serverTime: metaRow.server_time ? new Date(metaRow.server_time).toISOString() : timestamp,
        pgVersion: String(metaRow.pg_version || '').split(',')[0],
        latencyMs,
        vouchersCount: Number(countRow.vouchers_count ?? 0),
        usersCount: Number(countRow.users_count ?? 0),
        databaseUrlError,
        errorCode: databaseUrlErrorCode,
        timestamp
      };

      console.log(
        `[SwiftPay DB Diagnostic] Active Fallback PostgreSQL Connected: db="${result.database}" as "${result.databaseUser}" in ${latencyMs}ms (DATABASE_URL status: ${databaseUrlError || 'not_set'})`
      );
      return result;
    } catch (poolErr: any) {
      console.error(`[SwiftPay DB Diagnostic] Fallback PostgreSQL pool error: ${poolErr?.message || poolErr}`);
    }
  }

  const latencyMs = Date.now() - startMs;
  const finalError = databaseUrlError || 'No production PostgreSQL DATABASE_URL is configured or reachable; running on local JSON datastore.';
  console.warn(`[SwiftPay DB Diagnostic] RESULT: connected=false | host=${host} | error=${finalError}`);
  return {
    connected: false,
    databaseUrlConnected: false,
    activeDatastore: 'json_fallback',
    databaseUrlConfigured: hasDbUrl,
    maskedConnection: maskedUrl,
    host,
    database,
    latencyMs,
    databaseUrlError,
    error: finalError,
    errorCode: databaseUrlErrorCode || 'DATABASE_URL_UNREACHABLE',
    timestamp
  };
}

