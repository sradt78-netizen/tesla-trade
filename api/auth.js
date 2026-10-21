import bcryptjs from 'bcryptjs';
import { getDbConnection, loadDatabase } from './db.js';
import { resolveSupabaseCredentials } from './supabase-config.js';
import { sendWelcomeEmail } from './mailer.js';
import { logUserAction } from './logger.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/api/, '');
  const body = req.method === 'POST' ? await parseJsonBody(req) : {};

  // ── 1. POST /api/auth/login ──────────────────────────────────────
  if (pathname === '/auth/login' || pathname === '/auth/login.php') {
    const email = cleanString(body.email).toLowerCase();
    const password = body.password || '';

    if (!email || !email.includes('@') || !password) {
      return res.status(400).json({ success: false, message: 'Enter a valid email and password.' });
    }

    let credential = null;
    let investorName = '';

    try {
      const conn = await getDbConnection();
      const [rows] = await conn.query(
        'SELECT email, password_hash FROM investor_credentials WHERE LOWER(email)=? LIMIT 1',
        [email]
      );
      if (rows && rows.length > 0) credential = rows[0];

      if (!credential) {
        const [acc] = await conn.query('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
        const [inv] = await conn.query('SELECT user_name FROM investments WHERE LOWER(user_email)=? LIMIT 1', [email]);
        await conn.end();

        if ((acc && acc.length > 0) || (inv && inv.length > 0)) {
          return res.status(200).json({
            success: false,
            needsPasswordSetup: true,
            message: 'Set a password to activate email/password login for this account.'
          });
        }
        return res.status(404).json({ success: false, message: 'No investor account was found for this email.' });
      }

      const [acc] = await conn.query('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (acc && acc.length > 0 && acc[0].name) investorName = acc[0].name;
      await conn.end();
    } catch (e) {
      const db = loadDatabase();
      credential = db.investor_credentials?.find(c => (c.email || '').toLowerCase() === email);
      const acc = db.investor_accounts?.find(u => (u.email || '').toLowerCase() === email);
      if (acc) investorName = acc.name;
    }

    // Verify password hash
    let passwordValid = false;
    if (credential && credential.password_hash) {
      try {
        passwordValid = bcryptjs.compareSync(password, credential.password_hash);
      } catch (err) {
        passwordValid = password === credential.password_hash;
      }
    }

    if (!passwordValid) {
      await logUserAction(req, {
        user_email: email,
        action_type: 'user.login_failed',
        description: `Failed login attempt for ${email}`,
        status: 'warning'
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    await logUserAction(req, {
      user_email: email,
      action_type: 'user.login',
      description: `Investor signed in successfully: ${email}`,
      status: 'success'
    });

    return res.status(200).json({
      success: true,
      email,
      name: investorName || email
    });
  }

  // ── 2. POST /api/auth/set-password ───────────────────────────────
  if (pathname === '/auth/set-password' || pathname === '/auth/set-password.php') {
    const email = cleanString(body.email).toLowerCase();
    const password = body.password || '';

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const hash = bcryptjs.hashSync(password, 10);
    let userName = 'Investor';

    try {
      const conn = await getDbConnection();
      await conn.query(
        'INSERT INTO investor_credentials (email, password_hash, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), updated_at=NOW()',
        [email, hash]
      );
      await conn.query(
        'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, "Investor", "active", NOW()) ON DUPLICATE KEY UPDATE onboarding_status="active"',
        [email]
      );
      const [acc] = await conn.query('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (acc && acc.length > 0 && acc[0].name) userName = acc[0].name;
      await conn.end();
    } catch (e) {
      console.warn('Set-password DB warning:', e.message);
    }

    await logUserAction(req, {
      user_email: email,
      action_type: 'user.password_setup',
      description: `Password set successfully for ${email}`,
      status: 'success'
    });

    sendWelcomeEmail(email, userName).catch(err => console.warn('Welcome email error:', err.message));

    return res.status(200).json({
      success: true,
      email,
      name: userName
    });
  }

  // ── 3. POST /api/auth/social-session ─────────────────────────────
  if (pathname === '/auth/social-session' || pathname === '/auth/social-session.php') {
    const accessToken = cleanString(body.accessToken);
    const provider = cleanString(body.provider || 'oauth');
    let email = cleanString(body.email).toLowerCase();
    let name = cleanString(body.name || 'Investor');

    // If Supabase credentials are configured, verify accessToken with Supabase API
    const { url: supabaseUrl, anonKey } = await resolveSupabaseCredentials();
    if (supabaseUrl && anonKey && accessToken) {
      try {
        const verifyRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        if (verifyRes.ok) {
          const user = await verifyRes.json();
          if (user && user.email) {
            email = user.email.toLowerCase();
            const meta = user.user_metadata || {};
            name = meta.full_name || meta.name || meta.user_name || name || email;
          }
        }
      } catch (err) {
        console.warn('Supabase remote token verify error:', err.message);
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, message: 'Social session token or email is required.' });
    }

    try {
      const conn = await getDbConnection();
      await conn.query(
        'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, "active", NOW()) ON DUPLICATE KEY UPDATE name=COALESCE(name, VALUES(name)), onboarding_status="active"',
        [email, name]
      );
      await conn.end();
    } catch (e) {}

    await logUserAction(req, {
      user_email: email,
      action_type: 'user.social_login',
      description: `Social login verified (${provider}): ${email}`,
      status: 'success',
      details: { provider, name }
    });

    return res.status(200).json({
      success: true,
      email,
      name
    });
  }

  return res.status(404).json({ success: false, message: 'Unknown auth action' });
}
