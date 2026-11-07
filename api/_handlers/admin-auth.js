import crypto from 'crypto';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return {};
}

function clean(value) {
  return value == null ? '' : String(value).trim().replace(/^["']|["']$/g, '');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function adminAuthHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-password');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, authenticated: false, error: 'Method not allowed.' });
  }

  const body = readBody(req);
  const expected = clean(process.env.ADMIN_PASSWORD || process.env.TT_ADMIN_PASSWORD);
  const provided = clean(
    req.headers?.['x-admin-password'] ||
    (req.headers?.authorization || '').replace(/^Bearer\\s+/i, '') ||
    body.password ||
    body.admin_password ||
    ''
  );

  if (!expected) {
    return res.status(503).json({
      success: false,
      authenticated: false,
      error: 'Administrator password is not configured on the server.'
    });
  }

  let authenticated = !!provided && safeEqual(provided, expected);
  const expectedSha = clean(process.env.ADMIN_PASSWORD_SHA256 || process.env.TT_ADMIN_PASSWORD_SHA256);
  if (!authenticated && provided && expectedSha) {
    const actualSha = crypto.createHash('sha256').update(provided).digest('hex');
    authenticated = safeEqual(actualSha.toLowerCase(), expectedSha.toLowerCase());
  }

  if (!authenticated) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Incorrect administrator password.'
    });
  }

  return res.status(200).json({
    success: true,
    authenticated: true,
    message: 'Admin authenticated successfully.'
  });
}
