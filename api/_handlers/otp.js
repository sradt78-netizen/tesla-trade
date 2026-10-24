import { getDbConnection, resolveDatabaseConfig } from './dbcheck.js';

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

// In-memory fallback OTP storage when DB is offline or in development
const inMemoryOtps = new Map();

async function sendViaResend(apiKey, fromEmail, toEmail, toName, code) {
  if (!apiKey) return { ok: false, error: 'No RESEND_API_KEY configured' };

  const sender = fromEmail || 'onboarding@resend.dev';
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0c0d0e; color: #ffffff; border-radius: 12px; border: 1px solid #222;">
      <div style="margin-bottom: 24px; border-bottom: 1px solid #1f2023; padding-bottom: 16px;">
        <span style="color: #e31937; font-size: 20px; font-weight: 800; letter-spacing: 0.1em;">TESLA</span>
        <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.05em;"> TRADE INC</span>
      </div>
      <p style="font-size: 15px; color: #d1d5db; line-height: 1.6; margin-bottom: 16px;">
        Hello <strong>${toName || 'Investor'}</strong>,
      </p>
      <p style="font-size: 14px; color: #9ca3af; line-height: 1.6; margin-bottom: 24px;">
        Use the following one-time verification code to complete your request:
      </p>
      <div style="background: #141618; border: 1px solid #2a2d32; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff;">
          ${code}
        </div>
      </div>
      <p style="font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 8px;">
        This code will expire in 24 hours. For security, never share this code with anyone.
      </p>
      <p style="font-size: 12px; color: #6b7280; line-height: 1.6;">
        If you did not request this verification code, please ignore this email.
      </p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Tesla Trade Inc <${sender}>`,
        to: [toEmail],
        subject: `${code} is your Tesla Trade Inc verification code`,
        html: htmlBody
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) {
      return { ok: true, id: data.id };
    }
    return { ok: false, error: data.message || `Resend HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

  const isVerify = pathname === '/otp/verify' || pathname === '/otp-verify.php';
  const isSend = pathname === '/otp/send' || pathname === '/otp-send.php' || pathname === '/otp/resend';

  const email = cleanString(body.email || url.searchParams.get('email')).toLowerCase();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  }

  // ── 1. VERIFY OTP ──────────────────────────────────────────────
  if (isVerify) {
    const code = cleanString(body.code || url.searchParams.get('code'));
    if (!code || code.length < 4) {
      return res.status(400).json({ success: false, error: 'Enter the verification code.' });
    }

    let verified = false;

    // Check database first
    try {
      const conn = await getDbConnection();
      const [rows] = await conn.query(
        'SELECT * FROM otps WHERE LOWER(email)=? AND code=? AND used=0 AND expires_at >= NOW() ORDER BY id DESC LIMIT 1',
        [email, code]
      );
      if (rows.length > 0) {
        verified = true;
        await conn.query('UPDATE otps SET used=1 WHERE id=?', [rows[0].id]);
      }
      await conn.end();
    } catch (e) {
      // Fallback to in-memory check
      const mem = inMemoryOtps.get(email);
      if (mem && mem.code === code && mem.expiresAt > Date.now()) {
        verified = true;
        inMemoryOtps.delete(email);
      }
    }

    // Also accept in-memory if DB check didn't succeed
    if (!verified) {
      const mem = inMemoryOtps.get(email);
      if (mem && mem.code === code && mem.expiresAt > Date.now()) {
        verified = true;
        inMemoryOtps.delete(email);
      }
    }

    if (!verified) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect or expired verification code. Request a new code and try again.',
        message: 'Incorrect or expired verification code. Request a new code and try again.',
        canResend: true
      });
    }

    const verificationToken = 'tok_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    return res.status(200).json({
      success: true,
      verificationToken,
      token: verificationToken,
      message: 'Code verified successfully.'
    });
  }

  // ── 2. SEND OTP (VIA RESEND) ───────────────────────────────────
  if (isSend) {
    const name = cleanString(body.name || 'Investor');
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Read Resend configuration from environment variables or database app_settings
    let resendApiKey = cleanString(
      process.env.RESEND_API_KEY || process.env.TT_RESEND_API_KEY || process.env.VITE_RESEND_API_KEY
    );
    let resendFrom = cleanString(
      process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || process.env.RESEND_SENDER_EMAIL
    ) || 'onboarding@resend.dev';

    // Store OTP in database
    try {
      const conn = await getDbConnection();

      // Ensure otps table exists
      await conn.query(`
        CREATE TABLE IF NOT EXISTS otps (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          code VARCHAR(6) NOT NULL,
          expires_at DATETIME NOT NULL,
          used TINYINT(1) NOT NULL DEFAULT 0,
          name VARCHAR(255) DEFAULT 'Investor',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_otps_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // Read saved Resend settings from DB if not in env
      if (!resendApiKey) {
        try {
          const [settings] = await conn.query('SELECT `key`, `value` FROM app_settings WHERE `key` IN ("resend_api_key", "resend_from_email")');
          for (const s of settings) {
            if (s.key === 'resend_api_key' && s.value) resendApiKey = s.value;
            if (s.key === 'resend_from_email' && s.value) resendFrom = s.value;
          }
        } catch (e) {}
      }

      // Invalidate old unused OTPs
      await conn.query('UPDATE otps SET used=1 WHERE LOWER(email)=? AND used=0', [email]);

      // Insert new OTP with 24hr expiration
      await conn.query(
        'INSERT INTO otps (email, code, expires_at, name, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?, NOW())',
        [email, code, name]
      );

      await conn.end();
    } catch (dbErr) {
      console.warn('DB OTP insert warning, using memory fallback:', dbErr.message);
    }

    // Save in memory store
    inMemoryOtps.set(email, {
      code,
      name,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });

    // Send email via Resend if API key is present
    let resendResult = { ok: false, error: 'No RESEND_API_KEY found' };
    if (resendApiKey) {
      resendResult = await sendViaResend(resendApiKey, resendFrom, email, name, code);
      if (!resendResult.ok) {
        console.warn('Resend send warning:', resendResult.error);
      }
    }

    return res.status(200).json({
      success: true,
      code: code, // Enables instant dev/testing preview in UI banner
      message: resendResult.ok ? 'Verification code sent to your email.' : 'Verification code generated.',
      email_delivered: resendResult.ok,
      resend_status: resendResult.ok ? 'sent' : resendResult.error,
      expires_in: '24 hours'
    });
  }

  return res.status(404).json({ success: false, error: 'Unknown OTP action.' });
}
