import mysql from 'mysql2/promise';

// Helper to get MySQL connection using Vercel or local environment variables
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

function parseJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-admin-password');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/^\/api/, '') || '/';
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  const method = req.method.toUpperCase();

  try {
    // ── 1. GET /healthz or /dbcheck ──────────────────────────────
    if (pathname === '/healthz' || pathname === '/dbcheck') {
      let dbConnected = false;
      let tableCount = 0;
      let errorMsg = null;
      try {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SHOW TABLES');
        tableCount = rows.length;
        dbConnected = true;
        await conn.end();
      } catch (err) {
        errorMsg = err.message;
      }

      return res.status(200).json({
        status: 'ok',
        database: {
          connected: dbConnected,
          tables: tableCount,
          host: process.env.DB_HOST || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com (fallback)',
          database: process.env.DB_NAME || 'defaultdb',
          error: errorMsg
        },
        environment: {
          has_DB_HOST: !!process.env.DB_HOST,
          has_DB_PASSWORD: !!process.env.DB_PASSWORD,
          has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
          has_RESEND_API_KEY: !!process.env.RESEND_API_KEY,
          has_SUPABASE_URL: !!process.env.SUPABASE_URL
        }
      });
    }

    // ── 2. GET /invitation/verify?code=... ────────────────────────
    if (pathname === '/invitation/verify' && method === 'GET') {
      const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
      if (!code) {
        return res.status(422).json({ valid: false, error: 'Enter a valid invitation code.' });
      }

      // Check admin pass or default fallback code
      const adminPass = getAdminPassword();
      if (code === 'INVITATIONCODE' || code === 'TT-2026-VIP' || code === 'TESLA-TRADE-2026' || code === adminPass.toUpperCase()) {
        return res.status(200).json({ valid: true });
      }

      try {
        const conn = await getDbConnection();
        const [rows] = await conn.query('SELECT status FROM invitation_codes WHERE UPPER(code)=? LIMIT 1', [code]);
        await conn.end();
        const isValid = rows.length > 0 && rows[0].status === 'active';
        return res.status(200).json({ valid: isValid });
      } catch (e) {
        return res.status(200).json({ valid: code === 'INVITATIONCODE' || code === 'TT-2026-VIP' });
      }
    }

    // ── 3. POST /track — Track clicks ─────────────────────────────
    if (pathname === '/track') {
      const body = await parseJsonBody(req);
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
      const ref = body.referrer || req.headers['referer'] || '';
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

      return res.status(200).json({ success: true });
    }

    // ── 4. GET /analytics-data ────────────────────────────────────
    if (pathname === '/analytics-data' && method === 'GET') {
      const pass = url.searchParams.get('password') || req.headers['x-admin-password'] || '';
      const isAuthed = pass === getAdminPassword();

      const conn = await getDbConnection();
      const [[{ total_clicks }]] = await conn.query('SELECT COUNT(*) as total_clicks FROM analytics_clicks');
      const [[{ unique_visitors }]] = await conn.query('SELECT COUNT(DISTINCT ip_address) as unique_visitors FROM analytics_clicks');
      const [[{ clicks_today }]] = await conn.query('SELECT COUNT(*) as clicks_today FROM analytics_clicks WHERE created_at >= CURDATE()');

      const [[{ total_signups }]] = await conn.query('SELECT COUNT(*) as total_signups FROM investor_accounts');
      const [[{ signups_today }]] = await conn.query('SELECT COUNT(*) as signups_today FROM investor_accounts WHERE registered_at >= CURDATE()');

      const [[{ total_investments, investment_volume }]] = await conn.query('SELECT COUNT(*) as total_investments, COALESCE(SUM(total), 0) as investment_volume FROM investments');
      const [[{ total_orders }]] = await conn.query('SELECT COUNT(*) as total_orders FROM ev_orders');

      const [sources] = await conn.query('SELECT campaign_source, COUNT(*) as count FROM analytics_clicks GROUP BY campaign_source ORDER BY count DESC LIMIT 10');
      const [devices] = await conn.query('SELECT device_type, COUNT(*) as count FROM analytics_clicks GROUP BY device_type ORDER BY count DESC');
      const [recent_clicks] = await conn.query('SELECT id, ip_address, referrer, landing_page, campaign_source, device_type, created_at FROM analytics_clicks ORDER BY id DESC LIMIT 50');

      let [recent_signups] = await conn.query('SELECT email, name, phone, onboarding_status, registered_at FROM investor_accounts ORDER BY registered_at DESC LIMIT 20');
      if (!isAuthed) {
        recent_signups = recent_signups.map(r => {
          const parts = (r.email || '').split('@');
          return {
            ...r,
            email: parts[0] ? parts[0].substring(0, 3) + '***@' + (parts[1] || '') : '—'
          };
        });
      }

      await conn.end();

      return res.status(200).json({
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
    }

    // ── 5. Admin API: /admin/invitations ──────────────────────────
    if (pathname.startsWith('/admin/invitations')) {
      const pass = req.headers['x-admin-password'] || url.searchParams.get('password');
      if (pass !== getAdminPassword()) {
        return res.status(401).json({ error: 'Unauthorized: Invalid admin password' });
      }

      const conn = await getDbConnection();

      if (method === 'GET') {
        const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
        await conn.end();
        return res.status(200).json({ success: true, codes });
      }

      if (method === 'POST') {
        const body = await parseJsonBody(req);
        const action = body.action || 'generate';

        if (action === 'generate') {
          const randomCode = 'TT-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
          const customCode = body.code ? body.code.trim().toUpperCase() : randomCode;
          await conn.query('INSERT INTO invitation_codes (code, status, source) VALUES (?, "active", "admin")', [customCode]);
          const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
          await conn.end();
          return res.status(200).json({ success: true, created: customCode, codes });
        }

        if (action === 'revoke' || action === 'reinstate') {
          const id = body.id;
          const newStatus = action === 'revoke' ? 'revoked' : 'active';
          await conn.query('UPDATE invitation_codes SET status=? WHERE id=?', [newStatus, id]);
          const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
          await conn.end();
          return res.status(200).json({ success: true, codes });
        }
      }

      await conn.end();
      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── 6. GET /supabase-config ───────────────────────────────────
    if (pathname === '/supabase-config') {
      return res.status(200).json({
        url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
        key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
      });
    }

    // ── 7. Fallback for other /api routes ─────────────────────────
    return res.status(200).json({ ok: true, path: pathname });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
