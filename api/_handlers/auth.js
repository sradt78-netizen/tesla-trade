import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { getDbConnection } from './dbcheck.js';
import { resolveSupabaseCredentials } from './supabase-config.js';

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
    let investmentStatus = 'none';

    try {
      const conn = await getDbConnection();

      // Check credentials table
      const [rows] = await conn.query(
        'SELECT email, password_hash FROM investor_credentials WHERE LOWER(email)=? LIMIT 1',
        [email]
      );
      if (rows.length > 0) credential = rows[0];

      // If credentials not found, check if an investor account or investment exists
      if (!credential) {
        const [acc] = await conn.query('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
        const [inv] = await conn.query('SELECT user_name FROM investments WHERE LOWER(user_email)=? LIMIT 1', [email]);
        await conn.end();

        if (acc.length > 0 || inv.length > 0) {
          return res.status(200).json({
            success: false,
            needsPasswordSetup: true,
            message: 'Set a password to activate email/password login for this account.'
          });
        }
        return res.status(404).json({ success: false, message: 'No investor account was found for this email.' });
      }

      // Resolve persisted onboarding and investment state at login. Never infer
      // approval from client storage or a stale session response.
      const [acc] = await conn.query('SELECT name, phone, age, onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (acc.length > 0 && acc[0].name) investorName = acc[0].name;
      var investorPhone = acc[0]?.phone || '';
      var investorAge = Number(acc[0]?.age || 0);
      var onboardingStatus = String(acc[0]?.onboarding_status || 'registered');
      const [investments] = await conn.query(
        "SELECT status FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC",
        [email]
      );
      const states = investments.map(row => String(row.status || '').toLowerCase());
      investmentStatus = states.some(s => ['active','approved'].includes(s))
        ? 'active'
        : states.some(s => ['pending','pending_approval'].includes(s))
          ? 'pending_approval'
          : 'none';
      onboardingStatus = investmentStatus;
      await conn.end();

    } catch (e) {
      console.error('[auth login] database lookup failed:', e.message);
      return res.status(503).json({
        success: false,
        message: 'Login is temporarily unavailable because the account database could not be reached. Please try again.'
      });
    }

    // Verify password hash
    let passwordValid = false;
    if (credential && credential.password_hash) {
      try {
        passwordValid = bcryptjs.compareSync(password, credential.password_hash);
      } catch (err) {
        passwordValid = false;
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    return res.status(200).json({
      success: true,
      email,
      name: investorName || email,
      phone: investorPhone || '',
      age: Number(investorAge || 0),
      onboardingStatus: onboardingStatus || 'registered',
      investmentStatus: typeof investmentStatus === 'string' ? investmentStatus : 'none'
    });
  }

  // ── 2. POST /api/auth/set-password ───────────────────────────────
  if (pathname === '/auth/set-password' || pathname === '/auth/set-password.php') {
    const email = cleanString(body.email).toLowerCase();
    const password = body.password || '';
    const verificationToken = cleanString(body.verificationToken || body.token);

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const secret = process.env.OTP_TOKEN_SECRET || process.env.TT_OTP_TOKEN_SECRET;
    if (!secret || !verificationToken) return res.status(401).json({ success: false, message: 'Verify your email before setting a password.' });
    try {
      const [payloadPart, signature] = verificationToken.split('.');
      const expected = crypto.createHmac('sha256', secret).update(payloadPart || '').digest();
      const supplied = Buffer.from(signature || '', 'hex');
      const payload = JSON.parse(Buffer.from(payloadPart || '', 'base64url').toString('utf8'));
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected) || payload.email !== email || !Number.isFinite(payload.exp) || payload.exp < Date.now()) throw new Error('invalid token');
    } catch (e) { return res.status(401).json({ success: false, message: 'Verification token invalid or expired.' }); }

    const hash = bcryptjs.hashSync(password, 10);
    let userName = 'Investor';
    let conn = null;

    try {
      conn = await getDbConnection();

      // Ensure investor_credentials table exists
      await conn.query(`
        CREATE TABLE IF NOT EXISTS investor_credentials (
          email VARCHAR(255) PRIMARY KEY,
          password_hash VARCHAR(255) NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Upsert password hash
      await conn.query(
        'INSERT INTO investor_credentials (email, password_hash, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), updated_at=NOW()',
        [email, hash]
      );

      // Upsert account
      await conn.query(
        'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, "Investor", "pending_approval", NOW()) ON DUPLICATE KEY UPDATE email=VALUES(email)',
        [email]
      );

      const [acc] = await conn.query('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (acc.length > 0 && acc[0].name) userName = acc[0].name;

      await conn.end();
      conn = null;
    } catch (e) {
      console.error('[auth set-password] durable credential save failed:', e.message);
      if (conn) {
        try { await conn.end(); } catch (closeError) {}
      }
      return res.status(503).json({
        success: false,
        message: 'Your password could not be saved to the account database. Please retry; your account has not been activated for sign-in.'
      });
    }

    // Notify the administrator only after the account is durably created.
    try {
      const [{ notifySignup }, { sendWelcomeEmail }] = await Promise.all([import('../telegram.js'), import('../mailer.js')]);
      const alerts = await Promise.allSettled([
        notifySignup({ name: userName, email, ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '' }),
        sendWelcomeEmail(email, userName)
      ]);
      alerts.forEach(result => {
        if (result.status === 'rejected') console.error('[auth signup] notification failed:', result.reason?.message || result.reason);
        else if (result.value?.ok === false) console.error('[auth signup] notification not delivered:', result.value.error);
      });
    } catch (alertError) {
      console.error('[auth signup] Telegram alert failed:', alertError.message);
    }

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

    if (supabaseUrl && anonKey && accessToken && !email) {
      return res.status(401).json({ success: false, message: 'The social access token could not be verified.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid social account email is required.' });
    }
    // In production, never trust an email supplied by the browser as proof of
    // identity. Require the provider token to be verified by Supabase.
    if (process.env.NODE_ENV === 'production' && !(supabaseUrl && anonKey && accessToken)) {
      return res.status(401).json({ success: false, message: 'Social sign-in verification is not configured.' });
    }

    // Upsert account, then resolve its actual persisted investment state.
    let investmentStatus = 'none';
    let profilePhone = '';
    let profileAge = 0;
    let onboardingStatus = 'registered';
    try {
      const conn = await getDbConnection();
      await conn.query(
        'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, "pending_approval", NOW()) ON DUPLICATE KEY UPDATE name=COALESCE(name, VALUES(name))',
        [email, name]
      );
      const [accountRows] = await conn.query(
        'SELECT phone, age, onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1',
        [email]
      );
      profilePhone = accountRows[0]?.phone || '';
      profileAge = Number(accountRows[0]?.age || 0);
      onboardingStatus = String(accountRows[0]?.onboarding_status || 'registered');
      const [rows] = await conn.query(
        "SELECT status FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC",
        [email]
      );
      const states = rows.map(row => String(row.status || '').toLowerCase());
      const persistedOnboarding = String(accountRows[0]?.onboarding_status || 'none').toLowerCase();
      investmentStatus = states.some(s => ['active','approved','completed'].includes(s))
        ? 'active'
        : states.some(s => ['pending','pending_approval'].includes(s))
          ? 'pending_approval'
  : 'none';
      onboardingStatus = investmentStatus;
      await conn.end();
    } catch (e) {
      console.error('[auth social-session] database lookup failed:', e.message);
      return res.status(503).json({
        success: false,
        message: 'Social sign-in is temporarily unavailable because the account database could not be reached. Please retry.'
      });
    }

    return res.status(200).json({
      success: true,
      email,
      name,
      provider,
      phone: profilePhone,
      age: profileAge,
      onboardingStatus,
      isNewAccount: false,
      investmentStatus,
      message: 'Social session verified successfully.'
    });
  }

  return res.status(404).json({ success: false, error: 'Unknown auth endpoint.' });
}
