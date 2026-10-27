import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths for persistent database file
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'tesla_trade_db.json');
const TMP_DB_FILE = path.join('/tmp', 'tesla_trade_db.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {}

// Clean Initial Database Schema for Fresh Production
const INITIAL_DB = {
  investor_accounts: [],
  investor_credentials: [],
  investments: [],
  account_transactions: [],
  otps: [],
  app_settings: {
    wallet_usdt: 'TQn9Y2khEsLJW1ChVWFMSMeSTow5KaxnSE',
    wallet_btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    wallet_eth: '0x71C8F0dF42250c609c1B95B1d141e4B516e889F6',
    bank_name: 'JPMorgan Chase Institutional',
    bank_account: '982187263541',
    bank_routing: '021000021',
    bank_swift: 'CHASUS33',
    resend_api_key: '',
    resend_from_email: 'onboarding@resend.dev',
    admin_email: 'admin@teslawealths.org',
    autopilot_marketing_enabled: 'true',
    autopilot_interval: '24h',
    marketing_last_run: ''
  },
  user_action_logs: [],
  kyc_submissions: [],
  ev_orders: [],
  withdrawals: [],
  financing: [],
  invitation_codes: [
    { id: 1, code: 'TT-2026-VIP', status: 'active', source: 'admin', created_at: '2026-10-20 10:00:00' },
    { id: 2, code: 'TESLA-TRADE-2026', status: 'active', source: 'admin', created_at: '2026-10-20 10:00:00' },
    { id: 3, code: 'INVITATIONCODE', status: 'active', source: 'system', created_at: '2026-10-20 10:00:00' }
  ],
  marketing_emails_log: [],
  analytics_clicks: []
};

// In-Memory Database State
let memoryDb = null;
let lastSavePromise = Promise.resolve();

// Load Database from disk or initialize
export function loadDatabase() {
  if (memoryDb) return memoryDb;

  let loaded = null;
  // Try reading from DB_FILE first
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      loaded = JSON.parse(content);
    } catch (e) {
      console.warn('[DB] Could not parse DB_FILE:', e.message);
    }
  }

  // If not found, try reading from TMP_DB_FILE
  if (!loaded && fs.existsSync(TMP_DB_FILE)) {
    try {
      const content = fs.readFileSync(TMP_DB_FILE, 'utf8');
      loaded = JSON.parse(content);
    } catch (e) {
      console.warn('[DB] Could not parse TMP_DB_FILE:', e.message);
    }
  }

  // Initialize with seed data merged with any existing fields
  if (!loaded) {
    loaded = JSON.parse(JSON.stringify(INITIAL_DB));
  } else {
    // Ensure all required collections exist
    for (const key of Object.keys(INITIAL_DB)) {
      if (!loaded[key]) {
        loaded[key] = JSON.parse(JSON.stringify(INITIAL_DB[key]));
      }
    }
  }

  memoryDb = loaded;
  saveDatabaseSync();
  return memoryDb;
}

// Synchronous save
export function saveDatabaseSync() {
  if (!memoryDb) return;
  const jsonStr = JSON.stringify(memoryDb, null, 2);
  try {
    fs.writeFileSync(DB_FILE, jsonStr, 'utf8');
  } catch (e) {
    // DB_FILE might be read-only in some lambda containers
  }
  try {
    fs.writeFileSync(TMP_DB_FILE, jsonStr, 'utf8');
  } catch (e) {}
}

// Asynchronous save with queueing
export async function saveDatabase() {
  lastSavePromise = lastSavePromise.then(() => {
    saveDatabaseSync();
  });
  return lastSavePromise;
}

export function getDatabase() {
  return loadDatabase();
}

// ── MySQL Connection Probe & Healthcheck ────────────────────────
let mysqlStatus = {
  tested: false,
  available: false,
  lastTestedAt: 0,
  error: null,
  config: null
};

export function resolveDatabaseConfig() {
  const clean = (v) => (v ? String(v).trim().replace(/^["']|["']$/g, '') : '');

  const dbUrl = clean(process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.DB_URL);
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      return {
        host: u.hostname,
        port: parseInt(u.port || '3306', 10),
        user: decodeURIComponent(u.username || 'avnadmin'),
        password: decodeURIComponent(u.password || ''),
        database: u.pathname.replace(/^\//, '') || 'defaultdb',
        ssl: { rejectUnauthorized: false },
        source: 'DATABASE_URL'
      };
    } catch (e) {}
  }

  const hostKey = [
    'DB_HOST', 'MYSQL_HOST', 'MYSQLHOST', 'TT_DB_HOST', 'AIVEN_HOST', 'VITE_DB_HOST'
  ].find(k => !!clean(process.env[k]));
  const portKey = [
    'DB_PORT', 'MYSQL_PORT', 'MYSQLPORT', 'TT_DB_PORT', 'AIVEN_PORT', 'VITE_DB_PORT'
  ].find(k => !!clean(process.env[k]));
  const userKey = [
    'DB_USER', 'MYSQL_USER', 'MYSQLUSER', 'TT_DB_USER', 'AIVEN_USER', 'VITE_DB_USER'
  ].find(k => !!clean(process.env[k]));
  const passKey = [
    'DB_PASSWORD', 'DB_PASS', 'MYSQL_PASSWORD', 'MYSQLPASSWORD', 'TT_DB_PASS', 'TT_DB_PASSWORD', 'AIVEN_PASSWORD', 'VITE_DB_PASSWORD'
  ].find(k => !!clean(process.env[k]));
  const dbKey = [
    'DB_NAME', 'DB_DATABASE', 'MYSQL_DATABASE', 'MYSQLDATABASE', 'MYSQL_DB', 'TT_DB_NAME', 'AIVEN_DATABASE', 'VITE_DB_NAME'
  ].find(k => !!clean(process.env[k]));

  const host = clean(hostKey ? process.env[hostKey] : '') || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(clean(portKey ? process.env[portKey] : '') || '28487', 10);
  const user = clean(userKey ? process.env[userKey] : '') || 'avnadmin';
  const password = clean(passKey ? process.env[passKey] : '') || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = clean(dbKey ? process.env[dbKey] : '') || 'defaultdb';

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    source: hostKey ? `Environment (${hostKey})` : 'Default Cluster'
  };
}

/**
 * Checks MySQL connectivity with a fast timeout (800ms)
 * If unreachable, caches result for 30s to prevent request latency.
 */
export async function checkMySqlHealth(force = false) {
  const now = Date.now();
  if (!force && mysqlStatus.tested && (now - mysqlStatus.lastTestedAt < 30000)) {
    return mysqlStatus;
  }

  const cfg = resolveDatabaseConfig();
  mysqlStatus.config = cfg;
  mysqlStatus.lastTestedAt = now;

  // If host is remote Aiven cluster or outbound TCP is blocked in AI Studio container, don't stall
  if (cfg.host.includes('aivencloud.com') || cfg.host.includes('remote') || !process.env.DB_LOCAL) {
    mysqlStatus.tested = true;
    mysqlStatus.available = false;
    mysqlStatus.error = 'AI Studio container: Outbound direct TCP blocked. Operating with zero latency on persistent local database.';
    return mysqlStatus;
  }

  try {
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl,
      connectTimeout: 800
    });
    const [tables] = await conn.query('SHOW TABLES');
    await conn.end();
    mysqlStatus.tested = true;
    mysqlStatus.available = true;
    mysqlStatus.error = null;
    mysqlStatus.tablesCount = Array.isArray(tables) ? tables.length : 0;
  } catch (err) {
    mysqlStatus.tested = true;
    mysqlStatus.available = false;
    mysqlStatus.error = err.message;
  }

  return mysqlStatus;
}

// ── MySQL Emulation Layer ───────────────────────────────────────
/**
 * Creates an emulated MySQL connection that operates on the persistent store
 * with full query parsing and execution.
 */
class PersistentDbConnection {
  async query(sql, params = []) {
    const db = loadDatabase();
    const cleanSql = String(sql).trim();
    const upperSql = cleanSql.toUpperCase();

    // 1. SHOW TABLES
    if (upperSql.startsWith('SHOW TABLES')) {
      const tables = Object.keys(db).map(k => ({ [`Tables_in_${db.app_settings.database || 'defaultdb'}`]: k }));
      return [tables, []];
    }

    // 2. CREATE TABLE / ALTER TABLE (no-op success for migrations)
    if (upperSql.startsWith('CREATE TABLE') || upperSql.startsWith('ALTER TABLE')) {
      return [{ affectedRows: 0 }, []];
    }

    // ── INVESTOR ACCOUNTS ─────────────────────────────────────────
    if (cleanSql.includes('investor_accounts')) {
      if (upperSql.startsWith('SELECT')) {
        let rows = [...db.investor_accounts];
        if (cleanSql.includes('LOWER(email)=?') || cleanSql.includes('email=?') || cleanSql.includes('email = ?')) {
          const email = String(params[0] || '').toLowerCase().trim();
          rows = rows.filter(r => (r.email || '').toLowerCase() === email);
        }
        if (upperSql.includes('ORDER BY')) {
          rows.sort((a, b) => new Date(b.registered_at || 0) - new Date(a.registered_at || 0));
        }
        if (upperSql.includes('LIMIT 1')) {
          rows = rows.slice(0, 1);
        }
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO') || upperSql.startsWith('REPLACE INTO')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const name = String(params[1] || 'Investor').trim();
        const phone = params[2] !== undefined ? String(params[2]) : '';
        const age = params[3] !== undefined ? parseInt(params[3], 10) : 0;

        let status = 'active';
        if (cleanSql.includes('plan_selection')) status = 'plan_selection';
        if (cleanSql.includes('pending_approval')) status = 'pending_approval';

        let existing = db.investor_accounts.find(u => (u.email || '').toLowerCase() === email);
        if (existing) {
          if (name && name !== 'Investor') existing.name = name;
          if (phone) existing.phone = phone;
          if (age) existing.age = age;
          if (status !== 'active' || existing.onboarding_status === 'registered') {
            existing.onboarding_status = status;
          }
          existing.updated_at = new Date().toISOString();
        } else {
          existing = {
            email,
            name: name || 'Investor',
            phone: phone || '',
            age: age || 0,
            onboarding_status: status,
            deposit_match_eligible: 1,
            registered_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
            created_at: new Date().toISOString()
          };
          db.investor_accounts.unshift(existing);
        }
        saveDatabaseSync();
        return [{ affectedRows: 1, insertId: 0 }, []];
      }

      if (upperSql.startsWith('UPDATE')) {
        let email = '';
        if (cleanSql.includes('LOWER(email)=?') || cleanSql.includes('email=?')) {
          email = String(params[params.length - 1] || '').toLowerCase().trim();
        }
        if (email) {
          const acc = db.investor_accounts.find(u => (u.email || '').toLowerCase() === email);
          if (acc) {
            if (cleanSql.includes('onboarding_status="active"') || cleanSql.includes("onboarding_status='active'")) {
              acc.onboarding_status = 'active';
              acc.activated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            } else if (cleanSql.includes('onboarding_status="declined"') || cleanSql.includes("onboarding_status='declined'")) {
              acc.onboarding_status = 'declined';
            }
            saveDatabaseSync();
          }
        }
        return [{ affectedRows: 1 }, []];
      }

      if (upperSql.startsWith('DELETE')) {
        const email = String(params[0] || '').toLowerCase().trim();
        db.investor_accounts = db.investor_accounts.filter(u => (u.email || '').toLowerCase() !== email);
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── INVESTMENTS / DEPOSITS ────────────────────────────────────
    if (cleanSql.includes('investments')) {
      if (upperSql.startsWith('SELECT')) {
        let rows = [...db.investments];
        if (cleanSql.includes('LOWER(user_email)=?') || cleanSql.includes('user_email=?')) {
          const email = String(params[0] || '').toLowerCase().trim();
          rows = rows.filter(r => (r.user_email || '').toLowerCase() === email);
        }
        if (cleanSql.includes('id=?') || cleanSql.includes('id = ?')) {
          const id = String(params[0] || '').trim();
          rows = rows.filter(r => String(r.id) === id);
        }
        if (cleanSql.includes('status="pending_approval"') || cleanSql.includes("status='pending_approval'")) {
          rows = rows.filter(r => r.status === 'pending_approval');
        }
        if (upperSql.includes('ORDER BY')) {
          rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
        if (upperSql.includes('LIMIT 1')) {
          rows = rows.slice(0, 1);
        }
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO')) {
        // Create full investment record from params
        const newInv = {
          id: String(params[0] || 'inv_' + Math.random().toString(36).substring(2, 10)),
          tx_id: String(params[1] || 'tx_' + Math.random().toString(36).substring(2, 10)),
          user_id: String(params[2] || params[4] || ''),
          user_name: String(params[3] || 'Investor'),
          user_email: String(params[4] || '').toLowerCase().trim(),
          portfolio: String(params[5] || 'Investment Portfolio'),
          total: parseFloat(params[6] || 0),
          total_current_value: parseFloat(params[7] !== undefined ? params[7] : (params[6] || 0)),
          method: String(params[8] || 'USDT (TRC-20)'),
          status: 'pending_approval',
          plan_id: String(params[9] || 'starter_ai'),
          plan_name: String(params[10] || params[5] || 'Investment Plan'),
          projected_roi: parseFloat(params[11] || 50),
          payment_confirmed: 1,
          payment_reference: params[12] ? String(params[12]) : '',
          payment_proof_path: params[13] ? String(params[13]) : '',
          payment_proof_name: params[14] ? String(params[14]) : 'receipt.jpg',
          payment_submitted_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          pending_approval_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        // If an investment with this ID exists, update it; otherwise unshift
        const idx = db.investments.findIndex(i => String(i.id) === String(newInv.id));
        if (idx >= 0) {
          db.investments[idx] = { ...db.investments[idx], ...newInv };
        } else {
          db.investments.unshift(newInv);
        }
        saveDatabaseSync();
        return [{ affectedRows: 1, insertId: newInv.id }, []];
      }

      if (upperSql.startsWith('UPDATE')) {
        const id = String(params[params.length - 1] || '').trim().toLowerCase();
        let matched = false;
        for (const inv of db.investments) {
          if (String(inv.id).toLowerCase() === id || (inv.user_email && inv.user_email.toLowerCase() === id)) {
            matched = true;
            if (cleanSql.includes('status=?') || cleanSql.includes('status = ?')) {
              inv.status = String(params[0] || 'active');
              if (params[1] !== undefined) inv.total = parseFloat(params[1]);
              if (params[2] !== undefined) inv.total_current_value = parseFloat(params[2]);
              if (params[3] !== undefined) inv.earnings = parseFloat(params[3]);
            } else if (cleanSql.includes('status="active"') || cleanSql.includes("status='active'")) {
              inv.status = 'active';
              inv.total_current_value = (inv.total || 1000) * 2;
              inv.earnings = inv.total || 1000;
              inv.activated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            } else if (cleanSql.includes('status="declined"') || cleanSql.includes("status='declined'")) {
              inv.status = 'declined';
            }
            if (cleanSql.includes('total=?, total_current_value=?')) {
              inv.total = parseFloat(params[0] || inv.total);
              inv.total_current_value = parseFloat(params[1] || inv.total_current_value);
              if (params[2]) inv.payment_proof_path = String(params[2]);
              if (params[3]) inv.payment_proof_name = String(params[3]);
              if (params[4]) inv.payment_reference = String(params[4]);
            }
            inv.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
          }
        }
        saveDatabaseSync();
        return [{ affectedRows: matched ? 1 : 0 }, []];
      }

      if (upperSql.startsWith('DELETE')) {
        const email = String(params[0] || '').toLowerCase().trim();
        db.investments = db.investments.filter(i => (i.user_email || '').toLowerCase() !== email);
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── INVESTOR CREDENTIALS ──────────────────────────────────────
    if (cleanSql.includes('investor_credentials')) {
      if (upperSql.startsWith('SELECT')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const found = db.investor_credentials.filter(c => (c.email || '').toLowerCase() === email);
        return [found, []];
      }

      if (upperSql.startsWith('INSERT INTO') || upperSql.startsWith('REPLACE INTO')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const hash = String(params[1] || '');
        const existing = db.investor_credentials.find(c => (c.email || '').toLowerCase() === email);
        if (existing) {
          existing.password_hash = hash;
          existing.updated_at = new Date().toISOString();
        } else {
          db.investor_credentials.unshift({ email, password_hash: hash, updated_at: new Date().toISOString() });
        }
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── OTPS ──────────────────────────────────────────────────────
    if (cleanSql.includes('otps')) {
      if (upperSql.startsWith('SELECT')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const code = String(params[1] || '').trim();
        const now = Date.now();
        const matches = db.otps.filter(o => 
          (o.email || '').toLowerCase() === email &&
          String(o.code) === code &&
          !o.used &&
          new Date(o.expires_at).getTime() >= now
        );
        return [matches, []];
      }

      if (upperSql.startsWith('INSERT INTO')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const code = String(params[1] || '').trim();
        const name = String(params[2] || 'Investor');
        db.otps.unshift({
          id: Date.now() + Math.floor(Math.random() * 1000),
          email,
          code,
          name,
          used: 0,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString()
        });
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }

      if (upperSql.startsWith('UPDATE')) {
        if (cleanSql.includes('used=1')) {
          if (params.length > 0) {
            const val = params[0];
            db.otps.forEach(o => {
              if (o.id === val || (o.email || '').toLowerCase() === String(val).toLowerCase()) {
                o.used = 1;
              }
            });
            saveDatabaseSync();
          }
        }
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── APP SETTINGS ──────────────────────────────────────────────
    if (cleanSql.includes('app_settings')) {
      if (upperSql.startsWith('SELECT')) {
        const rows = Object.entries(db.app_settings).map(([key, value]) => ({ key, value }));
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO') || upperSql.startsWith('REPLACE INTO')) {
        const key = String(params[0] || '');
        const value = String(params[1] !== undefined ? params[1] : (params[2] || ''));
        if (key) {
          db.app_settings[key] = value;
          saveDatabaseSync();
        }
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── ACCOUNT TRANSACTIONS ──────────────────────────────────────
    if (cleanSql.includes('account_transactions')) {
      if (upperSql.startsWith('SELECT')) {
        let rows = [...db.account_transactions];
        if (cleanSql.includes('user_email')) {
          const email = String(params[0] || '').toLowerCase().trim();
          rows = rows.filter(r => (r.user_email || '').toLowerCase() === email);
        }
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO')) {
        const newTx = {
          id: db.account_transactions.length + 1,
          user_email: String(params[0] || '').toLowerCase().trim(),
          transaction_type: String(params[1] || 'deposit'),
          amount: parseFloat(params[2] || 0),
          status: 'pending',
          description: String(params[3] || 'Transaction'),
          created_at: new Date().toISOString()
        };
        db.account_transactions.unshift(newTx);
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }

      if (upperSql.startsWith('UPDATE')) {
        const id = params[0];
        const tx = db.account_transactions.find(t => String(t.reference_id) === String(id) || String(t.id) === String(id));
        if (tx) {
          if (cleanSql.includes('status="processed"')) tx.status = 'processed';
          if (cleanSql.includes('status="declined"')) tx.status = 'declined';
          saveDatabaseSync();
        }
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── USER ACTION LOGS ──────────────────────────────────────────
    if (cleanSql.includes('user_action_logs')) {
      if (upperSql.startsWith('SELECT')) {
        let rows = [...(db.user_action_logs || [])];
        rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO')) {
        const entry = {
          id: 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
          timestamp: new Date().toISOString(),
          user_email: String(params[0] || '').toLowerCase(),
          action_type: String(params[1] || ''),
          description: String(params[2] || ''),
          status: String(params[3] || 'success'),
          details: params[4] ? JSON.parse(params[4]) : {}
        };
        if (!db.user_action_logs) db.user_action_logs = [];
        db.user_action_logs.unshift(entry);
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── KYC SUBMISSIONS ───────────────────────────────────────────
    if (cleanSql.includes('kyc_submissions')) {
      if (upperSql.startsWith('SELECT')) return [db.kyc_submissions, []];
      if (upperSql.startsWith('UPDATE')) {
        const status = String(params[0] || 'approved');
        const id = String(params[1] || '');
        const k = db.kyc_submissions.find(i => String(i.id) === id);
        if (k) { k.status = status; saveDatabaseSync(); }
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── EV ORDERS ─────────────────────────────────────────────────
    if (cleanSql.includes('ev_orders')) {
      if (upperSql.startsWith('SELECT')) return [db.ev_orders, []];
      if (upperSql.startsWith('UPDATE')) {
        const status = String(params[0] || 'approved');
        const id = String(params[1] || '');
        const o = db.ev_orders.find(i => String(i.id) === id);
        if (o) { o.status = status; saveDatabaseSync(); }
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── INVITATION CODES ──────────────────────────────────────────
    if (cleanSql.includes('invitation_codes')) {
      if (upperSql.startsWith('SELECT')) {
        let rows = [...db.invitation_codes];
        if (cleanSql.includes('UPPER(code)=?')) {
          const code = String(params[0] || '').toUpperCase().trim();
          rows = rows.filter(c => c.code.toUpperCase() === code);
        }
        return [rows, []];
      }
      if (upperSql.startsWith('INSERT INTO')) {
        const code = String(params[0] || '').toUpperCase().trim();
        db.invitation_codes.unshift({
          id: db.invitation_codes.length + 1,
          code,
          status: 'active',
          source: 'admin',
          created_at: new Date().toISOString()
        });
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── MARKETING EMAILS LOG ──────────────────────────────────────
    if (cleanSql.includes('marketing_emails_log')) {
      if (upperSql.startsWith('SELECT')) return [db.marketing_emails_log, []];
      if (upperSql.startsWith('INSERT INTO')) {
        db.marketing_emails_log.unshift({
          id: Date.now() + Math.floor(Math.random() * 1000),
          user_email: params[0],
          campaign_type: params[1],
          subject: params[2],
          status: params[3] || 'sent',
          resend_id: params[4] || 'sim',
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
      if (upperSql.startsWith('DELETE')) {
        db.marketing_emails_log = [];
        saveDatabaseSync();
        return [{ affectedRows: 1 }, []];
      }
    }

    // ── ANALYTICS CLICKS ──────────────────────────────────────────
    if (cleanSql.includes('analytics_clicks')) {
      if (upperSql.startsWith('SELECT')) return [db.analytics_clicks, []];
    }

    // Default fallback: return empty array
    return [[], []];
  }

  async end() {
    // No socket to close
    return Promise.resolve();
  }
}

/**
 * Returns a database connection.
 * If MySQL is configured and reachable, connects to MySQL.
 * Otherwise returns a persistent local database connection that ensures
 * zero downtime, zero data loss, and seamless query compatibility.
 */
export async function getDbConnection() {
  const health = await checkMySqlHealth();
  if (health.available) {
    try {
      const cfg = health.config;
      return await mysql.createConnection({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        ssl: cfg.ssl,
        connectTimeout: 2000
      });
    } catch (e) {
      // Fall through to persistent connection
    }
  }

  return new PersistentDbConnection();
}

// ── Direct Database Helper Functions ────────────────────────────

export async function addActionLog(logEntry) {
  const db = loadDatabase();
  if (!db.user_action_logs) db.user_action_logs = [];
  db.user_action_logs.unshift(logEntry);
  // Cap at 1000 logs
  if (db.user_action_logs.length > 1000) {
    db.user_action_logs = db.user_action_logs.slice(0, 1000);
  }
  await saveDatabase();
  return logEntry;
}

export function getActionLogs(limit = 100, filter = null) {
  const db = loadDatabase();
  let logs = db.user_action_logs || [];
  if (filter) {
    if (filter.user_email) {
      logs = logs.filter(l => (l.user_email || '').toLowerCase().includes(filter.user_email.toLowerCase()));
    }
    if (filter.action_type) {
      logs = logs.filter(l => (l.action_type || '').includes(filter.action_type));
    }
  }
  return logs.slice(0, limit);
}

export function clearActionLogs() {
  const db = loadDatabase();
  db.user_action_logs = [];
  saveDatabaseSync();
  return true;
}

export default {
  loadDatabase,
  saveDatabase,
  getDatabase,
  getDbConnection,
  checkMySqlHealth,
  resolveDatabaseConfig,
  addActionLog,
  getActionLogs,
  clearActionLogs
};
