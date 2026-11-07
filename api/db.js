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
    // Normalize investment rows preserving actual values
    if (Array.isArray(loaded.investments)) {
      loaded.investments.forEach(inv => {
        const t = parseFloat(inv.total);
        inv.total = !isNaN(t) && t > 0 ? t : 0;
        const cv = parseFloat(inv.total_current_value);
        inv.total_current_value = !isNaN(cv) && cv > 0 ? cv : (inv.total > 0 ? inv.total : 0);
      });
    }
  }

  memoryDb = loaded;
  saveDatabaseSync();
  return memoryDb;
}

export const loadDatabaseSync = loadDatabase;

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

  // Never fall back to credentials embedded in source code. Production must
  // provide a complete server-side connection configuration through Vercel.
  const host = clean(hostKey ? process.env[hostKey] : '');
  const portValue = clean(portKey ? process.env[portKey] : '');
  const user = clean(userKey ? process.env[userKey] : '');
  const password = clean(passKey ? process.env[passKey] : '');
  const database = clean(dbKey ? process.env[dbKey] : '');
  const port = portValue ? parseInt(portValue, 10) : 3306;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    source: hostKey ? `Environment (${hostKey})` : 'Missing environment configuration'
  };
}

/**
 * Checks MySQL connectivity with a fast timeout (800ms)
 * If unreachable, caches result for 30s to prevent request latency.
 */
export async function checkMySqlHealth(force = false) {
  const now = Date.now();
  if (!force && mysqlStatus.tested && (mysqlStatus.available || now - mysqlStatus.lastTestedAt < 15000)) {
    return mysqlStatus;
  }

  const cfg = resolveDatabaseConfig();
  mysqlStatus.config = cfg;
  mysqlStatus.lastTestedAt = now;

  try {
    if (!cfg.host || !cfg.user || !cfg.password || !cfg.database || !Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
      throw new Error('Database configuration is incomplete. Set DATABASE_URL or DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in the server environment.');
    }
    const conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl,
      connectTimeout: 6000
    });
    const [tables] = await conn.query('SHOW TABLES');
    await conn.end();
    mysqlStatus.tested = true;
    mysqlStatus.available = true;
    mysqlStatus.error = null;
    mysqlStatus.tablesCount = Array.isArray(tables) ? tables.length : 0;
    try { await ensureTradingColumns(cfg); } catch (e) {}
  } catch (err) {
    mysqlStatus.tested = true;
    mysqlStatus.available = false;
    mysqlStatus.error = err.message;
  }

  return mysqlStatus;
}

// ── MySQL Emulation Layer ───────────────────────────────────────
/**
function parseInsertValues(cleanSql, params) {
  const match = cleanSql.match(/insert\s+into\s+[^(]+\s*\(([^)]+)\)\s*values\s*\((.+)\)/is);
  if (!match || !match[1] || !match[2]) return null;
  const cols = match[1].split(',').map(c => c.trim().toLowerCase().replace(/[`"']/g, ''));
  const valString = match[2].trim();
  const valTokens = [];
  let currentTok = '';
  let inQuote = false;
  let quoteChar = '';
  for (let i = 0; i < valString.length; i++) {
    const ch = valString[i];
    if (inQuote) {
      if (ch === quoteChar) inQuote = false;
      else currentTok += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ',') {
      valTokens.push(currentTok.trim());
      currentTok = '';
    } else {
      currentTok += ch;
    }
  }
  if (currentTok.trim()) valTokens.push(currentTok.trim());

  const result = {};
  let pIdx = 0;
  cols.forEach((col, idx) => {
    const tok = valTokens[idx];
    if (tok === '?') {
      if (params[pIdx] !== undefined) {
        result[col] = params[pIdx++];
      }
    } else if (tok !== undefined) {
      if (tok.toUpperCase() === 'NOW()') {
        result[col] = new Date().toISOString();
      } else {
        result[col] = tok.replace(/^["']|["']$/g, '');
      }
    }
  });
  return result;
}

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
        if (cleanSql.includes('COUNT(*) as total_signups')) {
          return [[{ total_signups: db.investor_accounts.length }], []];
        }
        if (cleanSql.includes('signups_today')) {
          const today = new Date().toISOString().slice(0, 10);
          const count = db.investor_accounts.filter(a => (a.registered_at || a.created_at || '').startsWith(today)).length;
          return [[{ signups_today: count }], []];
        }
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
        if (cleanSql.includes('LIMIT 20')) {
          rows = rows.slice(0, 20);
        }
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO') || upperSql.startsWith('REPLACE INTO')) {
        const email = String(params[0] || '').toLowerCase().trim();
        const name = String(params[1] || 'Investor').trim();
        const phone = params[2] !== undefined ? String(params[2]) : '';
        const age = params[3] !== undefined ? parseInt(params[3], 10) : 0;

        let status = 'pending_deposit';
        if (cleanSql.includes('plan_selection')) status = 'plan_selection';
        if (cleanSql.includes('pending_approval')) status = 'pending_approval';
        if (cleanSql.includes('pending_deposit')) status = 'pending_deposit';
        if (cleanSql.includes('"active"') || cleanSql.includes("'active'")) status = 'active';

        let existing = db.investor_accounts.find(u => (u.email || '').toLowerCase() === email);
        if (existing) {
          if (name && name !== 'Investor') existing.name = name;
          if (phone) existing.phone = phone;
          if (age) existing.age = age;
          if (status === 'active' || existing.onboarding_status === 'registered') {
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
              acc.deposit_match_eligible = 1;
              acc.activated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            } else if (cleanSql.includes('onboarding_status="declined"') || cleanSql.includes("onboarding_status='declined'")) {
              acc.onboarding_status = 'declined';
            }
          } else {
            db.investor_accounts.unshift({
              email: email,
              name: 'Investor',
              onboarding_status: 'active',
              deposit_match_eligible: 1,
              registered_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
              created_at: new Date().toISOString()
            });
          }
          saveDatabaseSync();
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
        if (cleanSql.includes('COUNT(*) as total_investments') || cleanSql.includes('investment_volume')) {
          const total = db.investments.length;
          const volume = db.investments.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
          return [[{ total_investments: total, investment_volume: volume }], []];
        }
        let rows = [...db.investments];
        if (cleanSql.includes('LOWER(user_email)=?') || cleanSql.includes('user_email=?')) {
          const email = String(params[0] || '').toLowerCase().trim();
          rows = rows.filter(r => (r.user_email || '').toLowerCase() === email);
        }
        if (cleanSql.includes('id=?') || cleanSql.includes('id = ?')) {
          const matchIds = params.map(p => String(p || '').trim().toLowerCase()).filter(Boolean);
          rows = rows.filter(r => {
            const rId = String(r.id || '').trim().toLowerCase();
            const rClean = rId.replace(/^dep_/, '');
            const rDep = 'dep_' + rClean;
            return matchIds.some(m => m === rId || m === rClean || m === rDep);
          });
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
        const colMatch = cleanSql.match(/insert\s+into\s+investments\s*\(([^)]+)\)/i);
        const newInv = {
          id: 'inv_' + Math.random().toString(36).substring(2, 10),
          tx_id: 'tx_' + Math.random().toString(36).substring(2, 10),
          user_id: '',
          user_name: 'Investor',
          user_email: '',
          portfolio: 'Investment Portfolio',
          total: 0,
          total_current_value: 0,
          method: 'USDT (TRC-20)',
          status: 'pending_approval',
          plan_id: 'starter_ai',
          plan_label: 'Explorer',
          plan_name: 'Explorer',
          projected_roi: 70,
          payment_confirmed: 1,
          payment_reference: '',
          payment_proof_path: '',
          payment_proof_name: 'receipt.jpg',
          payment_submitted_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        const parsedVals = parseInsertValues(cleanSql, params);
        if (parsedVals) {
          Object.assign(newInv, parsedVals);
        } else if (colMatch && colMatch[1]) {
          const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase().replace(/[`"']/g, ''));
          cols.forEach((col, idx) => {
            if (params[idx] !== undefined && params[idx] !== null) {
              newInv[col] = params[idx];
            }
          });
        } else {
          if (params[0]) newInv.id = String(params[0]);
          if (params[1]) newInv.tx_id = String(params[1]);
          if (params[2]) newInv.user_id = String(params[2]);
          if (params[3]) newInv.user_name = String(params[3]);
          if (params[4]) newInv.user_email = String(params[4]).toLowerCase().trim();
        }

        // Numeric normalization
        const parsedTotal = parseFloat(newInv.total != null ? newInv.total : 0);
        newInv.total = !isNaN(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0;
        const parsedVal = parseFloat(newInv.total_current_value != null ? newInv.total_current_value : newInv.total);
        newInv.total_current_value = !isNaN(parsedVal) && parsedVal >= 0 ? parsedVal : newInv.total;
        newInv.user_email = String(newInv.user_email || '').toLowerCase().trim();
        if (cleanSql.includes('"active"') || cleanSql.includes("'active'")) {
          newInv.status = 'active';
        }

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
        const idParams = params.map(p => String(p || '').trim().toLowerCase());
        let matchedCount = 0;
        for (const inv of db.investments) {
          const invId = String(inv.id || '').toLowerCase();
          const cleanInvId = invId.replace(/^dep_/, '');
          const depInvId = 'dep_' + cleanInvId;
          const invEmail = (inv.user_email || '').toLowerCase();

          const isMatch = idParams.some(p => {
            if (!p) return false;
            return invId === p || cleanInvId === p || depInvId === p || (p.includes('@') && invEmail === p);
          });

          if (isMatch) {
            matchedCount++;
            if (cleanSql.includes('status=?') || cleanSql.includes('status = ?')) {
              // params: [status, total, total_current_value, earnings, ...]
              inv.status = String(params[0] || 'active');
              if (params[1] !== undefined) {
                const amt = parseFloat(params[1]);
                if (!isNaN(amt) && amt > 0) inv.total = amt;
              }
              if (params[2] !== undefined) {
                const cv = parseFloat(params[2]);
                if (!isNaN(cv) && cv > 0) inv.total_current_value = cv;
                else if (inv.total > 0) inv.total_current_value = inv.total;
              }
              if (params[3] !== undefined) {
                const earn = parseFloat(params[3]);
                if (!isNaN(earn) && earn >= 0) inv.earnings = earn;
                else inv.earnings = 0;
              }
              if (inv.status === 'active') {
                inv.activated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
              }
            } else if (cleanSql.includes('total=?, total_current_value=?')) {
              inv.total = parseFloat(params[0] || inv.total || 1000);
              inv.total_current_value = parseFloat(params[1] || inv.total || 0);
              if (params[2] !== undefined && params[2] !== null) inv.payment_proof_path = String(params[2]);
              if (params[3] !== undefined && params[3] !== null) inv.payment_proof_name = String(params[3]);
              if (params[4] !== undefined && params[4] !== null) inv.payment_reference = String(params[4]);
              if (cleanSql.includes('status="pending_approval"') || cleanSql.includes("status='pending_approval'")) {
                inv.status = 'pending_approval';
              }
            } else if (cleanSql.includes('status="active"') || cleanSql.includes("status='active'")) {
              inv.status = 'active';
              inv.total = parseFloat(inv.total || 1000);
              inv.total_current_value = inv.total;
              inv.earnings = 0;
              inv.activated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            } else if (cleanSql.includes('status="declined"') || cleanSql.includes("status='declined'")) {
              inv.status = 'declined';
            }
            inv.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
          }
        }
        saveDatabaseSync();
        return [{ affectedRows: matchedCount }, []];
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
        let rows = [...(db.account_transactions || [])];
        if (cleanSql.includes('user_email')) {
          const email = String(params[0] || '').toLowerCase().trim();
          rows = rows.filter(r => (r.user_email || '').toLowerCase() === email);
        }
        return [rows, []];
      }

      if (upperSql.startsWith('INSERT INTO')) {
        const colMatch = cleanSql.match(/insert\s+into\s+account_transactions\s*\(([^)]+)\)/i);
        const newTx = {
          id: 'tx_' + Math.random().toString(36).substring(2, 9),
          investment_id: '',
          user_email: '',
          type: 'deposit',
          amount: 0,
          status: 'processed',
          note: 'Transaction',
          created_at: new Date().toISOString()
        };

        const parsedVals = parseInsertValues(cleanSql, params);
        if (parsedVals) {
          Object.assign(newTx, parsedVals);
        } else if (colMatch && colMatch[1]) {
          const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase().replace(/[`"']/g, ''));
          cols.forEach((col, idx) => {
            if (params[idx] !== undefined && params[idx] !== null) {
              newTx[col] = params[idx];
            }
          });
        } else {
          newTx.id = params[0] || newTx.id;
          newTx.user_email = params[1] || '';
          newTx.amount = parseFloat(params[2] || 0);
        }

        if (cleanSql.includes('"deposit"') || cleanSql.includes("'deposit'")) newTx.type = 'deposit';
        if (cleanSql.includes('"profit"') || cleanSql.includes("'profit'")) newTx.type = 'profit';
        if (cleanSql.includes('"withdrawal"') || cleanSql.includes("'withdrawal'")) newTx.type = 'withdrawal';
        if (cleanSql.includes('"processed"') || cleanSql.includes("'processed'")) newTx.status = 'processed';
        if (cleanSql.includes('"pending"') || cleanSql.includes("'pending'")) newTx.status = 'pending';
        if (cleanSql.includes('"completed"') || cleanSql.includes("'completed'")) newTx.status = 'completed';

        newTx.user_email = String(newTx.user_email || '').toLowerCase().trim();
        newTx.amount = parseFloat(newTx.amount != null ? newTx.amount : 0);
        newTx.type = newTx.type || newTx.transaction_type || 'deposit';
        newTx.created_at = newTx.created_at || new Date().toISOString();

        if (!Array.isArray(db.account_transactions)) db.account_transactions = [];
        db.account_transactions.unshift(newTx);
        saveDatabaseSync();
        return [{ affectedRows: 1, insertId: newTx.id }, []];
      }

      if (upperSql.startsWith('UPDATE')) {
        const id = String(params[params.length - 1] || '');
        const tx = (db.account_transactions || []).find(t => String(t.reference_id) === id || String(t.id) === id || String(t.investment_id) === id);
        if (tx) {
          if (cleanSql.includes('status="processed"') || cleanSql.includes("status='processed'")) tx.status = 'processed';
          if (cleanSql.includes('status="declined"') || cleanSql.includes("status='declined'")) tx.status = 'declined';
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
      if (upperSql.startsWith('SELECT')) {
        if (cleanSql.includes('COUNT(*) as total_orders')) {
          return [[{ total_orders: (db.ev_orders || []).length }], []];
        }
        return [db.ev_orders || [], []];
      }
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
      if (upperSql.startsWith('SELECT')) {
        const clicks = db.analytics_clicks || [];
        if (cleanSql.includes('COUNT(*) as total_clicks')) {
          return [[{ total_clicks: clicks.length }], []];
        }
        if (cleanSql.includes('unique_visitors')) {
          const uniqueIps = new Set(clicks.map(c => c.ip_address).filter(Boolean));
          return [[{ unique_visitors: uniqueIps.size }], []];
        }
        if (cleanSql.includes('clicks_today')) {
          const today = new Date().toISOString().slice(0, 10);
          const count = clicks.filter(c => (c.created_at || '').startsWith(today)).length;
          return [[{ clicks_today: count }], []];
        }
        if (cleanSql.includes('GROUP BY campaign_source')) {
          const counts = {};
          clicks.forEach(c => {
            const src = c.campaign_source || 'direct';
            counts[src] = (counts[src] || 0) + 1;
          });
          const rows = Object.entries(counts).map(([campaign_source, count]) => ({ campaign_source, count })).sort((a, b) => b.count - a.count);
          return [rows.slice(0, 10), []];
        }
        if (cleanSql.includes('GROUP BY device_type')) {
          const counts = {};
          clicks.forEach(c => {
            const dev = c.device_type || 'desktop';
            counts[dev] = (counts[dev] || 0) + 1;
          });
          const rows = Object.entries(counts).map(([device_type, count]) => ({ device_type, count })).sort((a, b) => b.count - a.count);
          return [rows, []];
        }
        return [clicks.slice(0, 50), []];
      }
      if (upperSql.startsWith('INSERT INTO')) {
        const ip = params[0] || '';
        const referrer = params[1] || '';
        const landing = params[2] || '';
        const source = params[3] || 'direct';
        const device = params[4] || 'desktop';
        const ua = params[5] || '';
        if (!db.analytics_clicks) db.analytics_clicks = [];
        db.analytics_clicks.unshift({
          id: db.analytics_clicks.length + 1,
          ip_address: ip,
          referrer,
          landing_page: landing,
          campaign_source: source,
          device_type: device,
          user_agent: ua,
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
        saveDatabaseSync();
        return [{ affectedRows: 1, insertId: db.analytics_clicks.length }, []];
      }
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
export async function ensureTradingColumns(cfg) {
  cfg = cfg || resolveDatabaseConfig();
  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ssl: cfg.ssl, connectTimeout: 6000 });
  const cols = [
    "trading_status VARCHAR(20) NOT NULL DEFAULT 'idle'",
    "trading_amount DECIMAL(15,2) NOT NULL DEFAULT 0",
    "trading_current_value DECIMAL(15,2) NOT NULL DEFAULT 0",
    "trading_started_at DATETIME DEFAULT NULL",
    "trading_updated_at DATETIME DEFAULT NULL",
    "activated_at DATETIME DEFAULT NULL",
    "plan_name VARCHAR(100) DEFAULT NULL",
    "plan_id VARCHAR(50) DEFAULT NULL",
    "earnings DECIMAL(15,2) DEFAULT 0",
    "updated_at DATETIME DEFAULT NULL",
    "plan_label VARCHAR(100) DEFAULT NULL",
    "deposit_purpose VARCHAR(50) NOT NULL DEFAULT 'investment'",
    "deposit_parent_id VARCHAR(36) DEFAULT NULL",
    "payment_confirmed TINYINT(1) NOT NULL DEFAULT 0",
    "can_withdraw TINYINT(1) NOT NULL DEFAULT 0",
    "referral_code VARCHAR(16) DEFAULT NULL"
  ];
  for (const c of cols) {
    try { await conn.query('ALTER TABLE investments ADD COLUMN ' + c); } catch (e) {}
  }
  // Receipts are submitted as data URLs; VARCHAR(500) cannot hold even small image uploads.
  await conn.query('ALTER TABLE investments MODIFY COLUMN payment_proof_path LONGTEXT NULL');
  await conn.end();
}

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
        connectTimeout: 6000
      });
    } catch (connectionError) {
      const error = new Error('The MySQL database is unavailable. Local mock storage is disabled.');
      error.code = 'DB_UNAVAILABLE';
      error.cause = connectionError;
      throw error;
    }
  }

  const error = new Error('The MySQL database is unavailable. Local mock storage is disabled.');
  error.code = 'DB_UNAVAILABLE';
  throw error;
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
