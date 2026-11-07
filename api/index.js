
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-admin-password, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname.replace(/^\/api/, '') || '/';
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  // Normalize path without .php extension for routing
  const normalizedPath = pathname.replace(/\.php$/, '');

  try {

  // Trading settings must be routed before the broad Admin API matcher below.
  if (normalizedPath === '/admin/trading-settings') {
    const { handleTradingSettingsGet, handleTradingSettingsPost } = await import('./_handlers/trading.js');
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      return await handleTradingSettingsPost(req, res, body);
    }
    if (req.method === 'GET') return await handleTradingSettingsGet(req, res);
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  // 1. Admin endpoints
  if (normalizedPath.startsWith('/admin')) {
    const adminAction = url.searchParams.get('action') || '';
    // Keep password verification independent from the full admin dashboard
    // module and its optional email/support/deposit dependencies.
    if (adminAction === 'verify_auth' || adminAction === 'login') {
      const { default: adminAuthHandler } = await import('./_handlers/admin-auth.js');
      return await adminAuthHandler(req, res);
    }
    const { default: adminHandler } = await import('./_handlers/admin.js');
    return await adminHandler(req, res);
  }

  // 2. Database diagnostics and healthcheck
  if (normalizedPath === '/dbcheck' || normalizedPath === '/healthz') {
    const { default: dbcheckHandler } = await import('./_handlers/dbcheck.js');
    return await dbcheckHandler(req, res);
  }

  // 3. Supabase configuration proxy
  if (normalizedPath === '/supabase-config') {
    const { default: supabaseConfigHandler } = await import('./_handlers/supabase-config.js');
    return await supabaseConfigHandler(req, res);
  }

  // 4. OTP verification & Resend Email API
  if (
    normalizedPath.startsWith('/otp/') ||
    normalizedPath === '/otp-send' ||
    normalizedPath === '/otp-verify'
  ) {
    const { default: otpHandler } = await import('./_handlers/otp.js');
    return await otpHandler(req, res);
  }

  // 5. Authentication (Login, Set-Password, Supabase Social-Session)
  if (normalizedPath.startsWith('/auth/')) {
    const { default: authHandler } = await import('./_handlers/auth.js');
    return await authHandler(req, res);
  }

  // Investor referral dashboard (read-only totals and referral-link management).
  if (normalizedPath === '/referral/dashboard' || normalizedPath === '/referral/code') {
    const { default: referralHandler } = await import('./_handlers/referral.js');
    return await referralHandler(req, res);
  }

  // Investor support tickets (public ticket links use high-entropy access tokens).
  if (normalizedPath === '/support') {
    const { default: supportHandler } = await import('./_handlers/support.js');
    return await supportHandler(req, res);
  }

  // 6. Investor accounts, profile, status & transactions
  if (
    normalizedPath === '/accounts' ||
    normalizedPath === '/profile' ||
    normalizedPath === '/my-status' ||
    normalizedPath === '/account-status' ||
    normalizedPath === '/transactions'
  ) {
    const { default: accountsHandler } = await import('./_handlers/accounts.js');
    return await accountsHandler(req, res);
  }

  // 7. Payment settings (wallets & bank)
  if (normalizedPath === '/payment-settings') {
    const { default: paymentSettingsHandler } = await import('./_handlers/payment-settings.js');
    return await paymentSettingsHandler(req, res);
  }

  // 8. Payment & Deposit submission / receipts
  if (
    normalizedPath === '/payment-submit' ||
    normalizedPath === '/payment-proof' ||
    normalizedPath === '/investments' ||
    // GET /api/investments/:id is what the waiting page, dashboard and
    // overview poll for status + balance. Trading sub-routes are matched
    // further down, so only a single id segment is handled here.
    /^\/investments\/[^/]+$/.test(normalizedPath)
  ) {
    const { default: paymentSubmitHandler } = await import('./_handlers/payment-submit.js');
    return await paymentSubmitHandler(req, res);
  }

  // 9. Analytics & tracking
  if (normalizedPath === '/track') {
    const { default: trackHandler } = await import('./_handlers/track.js');
    return await trackHandler(req, res);
  }
  if (normalizedPath === '/analytics-data') {
    const { default: analyticsDataHandler } = await import('./_handlers/analytics-data.js');
    return await analyticsDataHandler(req, res);
  }

  // 10. Stock quotes & Live Market Desk
  if (normalizedPath === '/stocks' || normalizedPath.startsWith('/stocks/')) {
    const { default: stocksHandler } = await import('./_handlers/stocks.js');
    return await stocksHandler(req, res);
  }

  // 11. Invitation verification: accept only an active code stored by an administrator.
  if (normalizedPath === '/invitation/verify') {
    const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code || code.length > 64) return res.status(400).json({ valid: false, error: 'A valid invitation code is required.' });
    let conn;
    try {
      const { getDbConnection } = await import('./_handlers/dbcheck.js');
      conn = await getDbConnection();
      const [rows] = await conn.query('SELECT code FROM invitation_codes WHERE UPPER(code)=? AND status="active" LIMIT 1', [code]);
      await conn.end();
      return res.status(200).json({ valid: rows.length > 0 });
    } catch (error) {
      if (conn) try { await conn.end(); } catch (e) {}
      return res.status(503).json({ valid: false, error: 'Invitation validation is temporarily unavailable.' });
    }
  }

  // 13. Algorithmic Trading Endpoints (state, start, stop)
  const tradingMatch = normalizedPath.match(/^\/investments\/([^/]+)\/(trading-state|trading\/start|trading\/stop)$/);
  if (tradingMatch) {
    const invId = decodeURIComponent(tradingMatch[1]);
    const action = tradingMatch[2];
    if (action === 'trading-state') {
      const { handleTradingState } = await import('./_handlers/trading.js');
      return await handleTradingState(req, res, invId);
    }
    if (action === 'trading/start') {
      const body = await parseJsonBody(req);
      const { handleTradingStart } = await import('./_handlers/trading.js');
      return await handleTradingStart(req, res, invId, body);
    }
    if (action === 'trading/stop') {
      const stopBody = req.method === 'POST' ? await parseJsonBody(req) : {};
      const { handleTradingStop } = await import('./_handlers/trading.js');
      return await handleTradingStop(req, res, invId, stopBody);
    }
  }

  return res.status(200).json({ ok: true, path: pathname });
  } catch (error) {
    const requestId = 'api_' + Date.now().toString(36);
    console.error('[api router] request failed', {
      requestId,
      path: pathname,
      error: error?.message || String(error),
      stack: error?.stack
    });
    if (res.headersSent) return;
    return res.status(500).json({
      success: false,
      error: 'The requested service could not be started. Please retry.',
      requestId
    });
  }
}
