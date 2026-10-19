import mysql from 'mysql2/promise';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

async function getDbConnection() {
  const host = cleanString(process.env.DB_HOST || process.env.TT_DB_HOST) || 'mysql-16d35e3c-sradt78-a386.a.aivencloud.com';
  const port = parseInt(cleanString(process.env.DB_PORT || process.env.TT_DB_PORT) || '28487', 10);
  const user = cleanString(process.env.DB_USER || process.env.TT_DB_USER) || 'avnadmin';
  const password = cleanString(process.env.DB_PASSWORD || process.env.TT_DB_PASS) || 'AVNS_eN3hQrUWcOL7PRQXP_i';
  const database = cleanString(process.env.DB_NAME || process.env.TT_DB_NAME) || 'defaultdb';

  return await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: false }
  });
}

function parseBody(req) {
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const body = req.method === 'POST' ? await parseBody(req) : {};
  const action = body.action || url.searchParams.get('action') || 'all_data';

  let conn = null;
  try {
    conn = await getDbConnection();

    // ── 1. GET ALL DASHBOARD DATA ───────────────────────────────────
    if (action === 'all_data' || req.method === 'GET') {
      const [investors] = await conn.query('SELECT * FROM investor_accounts ORDER BY registered_at DESC');
      const [investments] = await conn.query('SELECT * FROM investments ORDER BY created_at DESC');
      const [kyc] = await conn.query('SELECT * FROM kyc_submissions ORDER BY created_at DESC');
      const [orders] = await conn.query('SELECT * FROM ev_orders ORDER BY created_at DESC LIMIT 100');
      const [withdrawals] = await conn.query('SELECT * FROM withdrawals ORDER BY created_at DESC');
      const [financing] = await conn.query('SELECT * FROM financing_applications ORDER BY created_at DESC');
      const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
      const [clicks] = await conn.query('SELECT * FROM analytics_clicks ORDER BY id DESC LIMIT 50');

      let settings = {};
      try {
        const [settingsRows] = await conn.query('SELECT `key`, `value` FROM app_settings');
        for (const row of settingsRows) {
          settings[row.key] = row.value;
        }
      } catch (e) {}

      await conn.end();

      return res.status(200).json({
        success: true,
        investors,
        investments,
        kyc,
        orders,
        withdrawals,
        financing,
        codes,
        clicks,
        settings
      });
    }

    // ── 2. ADD MONEY / CREDIT INVESTOR BALANCE ─────────────────────
    if (action === 'credit_balance' || action === 'add_funds') {
      const email = cleanString(body.email).toLowerCase();
      const amount = parseFloat(body.amount || '0');
      const note = body.note || 'Admin credit';

      if (!email || amount <= 0) {
        await conn.end();
        return res.status(400).json({ success: false, error: 'Valid email and positive amount required.' });
      }

      // Check if investment exists for user
      const [invRows] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? LIMIT 1', [email]);
      if (invRows.length > 0) {
        const currentTotal = parseFloat(invRows[0].total || '0') + amount;
        const currentValue = parseFloat(invRows[0].total_current_value || invRows[0].total || '0') + amount;
        await conn.query('UPDATE investments SET total=?, total_current_value=? WHERE id=?', [currentTotal, currentValue, invRows[0].id]);
      } else {
        await conn.query(
          'INSERT INTO investments (user_email, user_name, plan_id, plan_label, total, total_current_value, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [email, 'Investor', 'standard', 'Standard Plan', amount, amount, 'active']
        );
      }

      // Insert into account_transactions
      try {
        await conn.query(
          'INSERT INTO account_transactions (user_email, transaction_type, amount, status, description) VALUES (?, ?, ?, ?, ?)',
          [email, 'credit', amount, 'completed', note]
        );
      } catch (e) {}

      await conn.end();
      return res.status(200).json({ success: true, message: `Successfully credited $${amount} to ${email}!` });
    }

    // ── 3. KYC APPROVE / REJECT ─────────────────────────────────────
    if (action === 'approve_kyc' || action === 'reject_kyc') {
      const id = body.id;
      const status = action === 'approve_kyc' ? 'approved' : 'rejected';
      await conn.query('UPDATE kyc_submissions SET status=? WHERE id=?', [status, id]);

      if (status === 'approved') {
        const [kRows] = await conn.query('SELECT user_email FROM kyc_submissions WHERE id=? LIMIT 1', [id]);
        if (kRows.length > 0) {
          await conn.query('UPDATE investor_accounts SET onboarding_status="verified" WHERE LOWER(email)=?', [kRows[0].user_email.toLowerCase()]);
        }
      }

      await conn.end();
      return res.status(200).json({ success: true, message: `KYC status updated to ${status}.` });
    }

    // ── 4. RECEIPT APPROVE / REJECT ─────────────────────────────────
    if (action === 'approve_receipt' || action === 'reject_receipt') {
      const id = body.id;
      const status = action === 'approve_receipt' ? 'approved' : 'rejected';
      await conn.query('UPDATE ev_orders SET status=? WHERE id=?', [status, id]);
      await conn.end();
      return res.status(200).json({ success: true, message: `Receipt status updated to ${status}.` });
    }

    // ── 5. WITHDRAWALS APPROVE / REJECT ─────────────────────────────
    if (action === 'approve_withdrawal' || action === 'reject_withdrawal') {
      const id = body.id;
      const status = action === 'approve_withdrawal' ? 'approved' : 'rejected';
      await conn.query('UPDATE withdrawals SET status=? WHERE id=?', [status, id]);
      await conn.end();
      return res.status(200).json({ success: true, message: `Withdrawal status updated to ${status}.` });
    }

    // ── 6. FINANCING APPLICATION REVIEW ────────────────────────────
    if (action === 'approve_financing' || action === 'reject_financing') {
      const id = body.id;
      const status = action === 'approve_financing' ? 'approved' : 'rejected';
      await conn.query('UPDATE financing_applications SET status=? WHERE id=?', [status, id]);
      await conn.end();
      return res.status(200).json({ success: true, message: `Financing status updated to ${status}.` });
    }

    // ── 7. INVITATION CODE GENERATE / REVOKE / REINSTATE ────────────
    if (action === 'generate_code') {
      const randomCode = 'TT-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const customCode = cleanString(body.code || randomCode).toUpperCase();
      await conn.query('INSERT INTO invitation_codes (code, status, source) VALUES (?, "active", "admin")', [customCode]);
      const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
      await conn.end();
      return res.status(200).json({ success: true, created: customCode, codes });
    }

    if (action === 'revoke_code' || action === 'reinstate_code') {
      const id = body.id;
      const newStatus = action === 'revoke_code' ? 'revoked' : 'active';
      await conn.query('UPDATE invitation_codes SET status=? WHERE id=?', [newStatus, id]);
      const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
      await conn.end();
      return res.status(200).json({ success: true, codes });
    }

    // ── 8. SETTINGS SAVE ───────────────────────────────────────────
    if (action === 'save_settings') {
      const s = body.settings || {};
      for (const [k, v] of Object.entries(s)) {
        await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?', [k, String(v), String(v)]);
      }
      await conn.end();
      return res.status(200).json({ success: true, message: 'Settings saved successfully.' });
    }

    await conn.end();
    return res.status(200).json({ success: true });

  } catch (error) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('API Admin Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
