import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import adminHandler from './api/admin.js';
import dbcheckHandler from './api/dbcheck.js';
import paymentSettingsHandler from './api/payment-settings.js';
import paymentSubmitHandler from './api/payment-submit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to get MySQL connection using environment variables
async function getDbConnection() {
  const host = process.env.DB_HOST || process.env.TT_DB_HOST || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(process.env.DB_PORT || process.env.TT_DB_PORT || '28487', 10);
  const user = process.env.DB_USER || process.env.TT_DB_USER || 'avnadmin';
  const password = process.env.DB_PASSWORD || process.env.TT_DB_PASS || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = process.env.DB_NAME || process.env.TT_DB_NAME || 'defaultdb';

  return await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }
  });
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.TT_ADMIN_PASSWORD || 'Heartofwisdom101@$';
}

// ── 1. GET /api/dbcheck or /api/healthz (Case-insensitive) ────────
app.get(['/api/dbcheck', '/API/dbcheck', '/api/healthz'], async (req, res) => {
  try {
    const conn = await getDbConnection();
    const [tables] = await conn.query('SHOW TABLES');
    await conn.end();

    const host = process.env.DB_HOST || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com (fallback)';
    return res.json({
      status: 'ok',
      message: 'Successfully connected to Aiven MySQL database!',
      database: {
        connected: true,
        tables_count: (tables as any[]).length,
        host: host,
        database: process.env.DB_NAME || 'defaultdb'
      },
      environment: {
        has_DB_HOST: !!process.env.DB_HOST,
        has_DB_PASSWORD: !!process.env.DB_PASSWORD,
        has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// ── 2. GET /api/invitation/verify ──────────────────────────────
app.get('/api/invitation/verify', async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(422).json({ valid: false, error: 'Enter a valid invitation code.' });
  }

  const adminPass = getAdminPassword();
  if (code === 'INVITATIONCODE' || code === 'TT-2026-VIP' || code === 'TESLA-TRADE-2026' || code === adminPass.toUpperCase()) {
    return res.json({ valid: true });
  }

  try {
    const conn = await getDbConnection();
    const [rows]: any = await conn.query('SELECT status FROM invitation_codes WHERE UPPER(code)=? LIMIT 1', [code]);
    await conn.end();
    return res.json({ valid: rows.length > 0 && rows[0].status === 'active' });
  } catch (e) {
    return res.json({ valid: code === 'INVITATIONCODE' || code === 'TT-2026-VIP' });
  }
});

// ── 3. POST /api/track ─────────────────────────────────────────
app.all('/api/track', async (req, res) => {
  const body = req.body || {};
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
  const ref = body.referrer || req.headers.referer || '';
  const landing = body.landing_page || req.url || '/';
  let source = body.campaign_source || body.source || body.ref || '';

  if (!source) {
    if (ref.includes('google.')) source = 'google';
    else if (ref.includes('t.co') || ref.includes('twitter.com') || ref.includes('x.com')) source = 'twitter';
    else if (ref.includes('whatsapp') || ref.includes('wa.me')) source = 'whatsapp';
    else if (ref.includes('telegram') || ref.includes('t.me')) source = 'telegram';
    else if (ref.includes('instagram.com')) source = 'instagram';
    else if (ref) source = 'referral';
    else source = 'direct';
  }

  const device = body.device_type || (/Mobi|Android|iPhone/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'desktop');

  try {
    const conn = await getDbConnection();
    await conn.query(
      'INSERT INTO analytics_clicks (ip_address, referrer, landing_page, campaign_source, device_type, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [ip.substring(0, 45), ref.substring(0, 500), landing.substring(0, 255), source.substring(0, 100), device.substring(0, 20), (req.headers['user-agent'] || '').substring(0, 500)]
    );
    await conn.end();
  } catch (e) {}

  return res.json({ success: true });
});

// ── 4. GET /api/analytics-data ─────────────────────────────────
app.get('/api/analytics-data', async (req, res) => {
  const pass = req.query.password || req.headers['x-admin-password'] || '';
  const isAuthed = pass === getAdminPassword();

  try {
    const conn = await getDbConnection();
    const [[{ total_clicks }]]: any = await conn.query('SELECT COUNT(*) as total_clicks FROM analytics_clicks');
    const [[{ unique_visitors }]]: any = await conn.query('SELECT COUNT(DISTINCT ip_address) as unique_visitors FROM analytics_clicks');
    const [[{ clicks_today }]]: any = await conn.query('SELECT COUNT(*) as clicks_today FROM analytics_clicks WHERE created_at >= CURDATE()');

    const [[{ total_signups }]]: any = await conn.query('SELECT COUNT(*) as total_signups FROM investor_accounts');
    const [[{ signups_today }]]: any = await conn.query('SELECT COUNT(*) as signups_today FROM investor_accounts WHERE registered_at >= CURDATE()');

    const [[{ total_investments, investment_volume }]]: any = await conn.query('SELECT COUNT(*) as total_investments, COALESCE(SUM(total), 0) as investment_volume FROM investments');
    const [[{ total_orders }]]: any = await conn.query('SELECT COUNT(*) as total_orders FROM ev_orders');

    const [sources]: any = await conn.query('SELECT campaign_source, COUNT(*) as count FROM analytics_clicks GROUP BY campaign_source ORDER BY count DESC LIMIT 10');
    const [devices]: any = await conn.query('SELECT device_type, COUNT(*) as count FROM analytics_clicks GROUP BY device_type ORDER BY count DESC');
    const [recent_clicks]: any = await conn.query('SELECT id, ip_address, referrer, landing_page, campaign_source, device_type, created_at FROM analytics_clicks ORDER BY id DESC LIMIT 50');

    let [recent_signups]: any = await conn.query('SELECT email, name, phone, onboarding_status, registered_at FROM investor_accounts ORDER BY registered_at DESC LIMIT 20');
    if (!isAuthed) {
      recent_signups = recent_signups.map((r: any) => {
        const parts = (r.email || '').split('@');
        return {
          ...r,
          email: parts[0] ? parts[0].substring(0, 3) + '***@' + (parts[1] || '') : '—'
        };
      });
    }

    await conn.end();

    return res.json({
      authenticated: isAuthed,
      summary: {
        total_clicks,
        unique_visitors,
        clicks_today,
        total_signups,
        signups_today,
        conversion_rate: total_clicks > 0 ? parseFloat(((total_signups / total_clicks) * 100).toFixed(2)) : 0,
        total_investments,
        investment_volume: parseFloat(investment_volume),
        total_orders
      },
      sources,
      devices,
      recent_clicks,
      recent_signups
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

function cleanString(val: any): string {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function verifyAdminPassword(input: any): boolean {
  if (!input) return false;
  const cleanInput = cleanString(input);
  const envPass = cleanString(process.env.ADMIN_PASSWORD || process.env.TT_ADMIN_PASSWORD);
  const defaultPass = 'Heartofwisdom101@$';
  if (cleanInput === defaultPass) return true;
  if (envPass && cleanInput === envPass) return true;
  return false;
}

// ── 5. Admin & Payment APIs ──────────────────────────────────────
app.all(['/api/admin', '/api/admin.php', '/api/admin/*'], (req, res) => adminHandler(req, res));
app.all(['/api/dbcheck', '/api/dbcheck.php', '/api/healthz'], (req, res) => dbcheckHandler(req, res));
app.all(['/api/payment-settings', '/api/payment-settings.php'], (req, res) => paymentSettingsHandler(req, res));
app.all(
  ['/api/payment-submit', '/api/payment-submit.php', '/api/payment-proof', '/api/payment-proof.php', '/api/investments'],
  (req, res) => paymentSubmitHandler(req, res)
);

// ── 6. Direct Portal Routes (NO INVITATION REQUIRED) ─────────────
app.get(['/admin', '/admin.php', '/admin.html'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'admin.html'));
});

app.get(['/analytics', '/analytics.html', '/analytics.php'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'analytics.html'));
});

// ── 7. Mount Vite in Dev ─────────────────────────────────────────
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Tesla Trade server running on http://localhost:${PORT}`);
  });
}

startServer();
