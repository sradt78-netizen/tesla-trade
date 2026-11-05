import adminHandler from './_handlers/admin.js';
import dbcheckHandler, { getDbConnection } from './_handlers/dbcheck.js';
import paymentSettingsHandler from './_handlers/payment-settings.js';
import paymentSubmitHandler from './_handlers/payment-submit.js';
import trackHandler from './_handlers/track.js';
import analyticsDataHandler from './_handlers/analytics-data.js';
import otpHandler from './_handlers/otp.js';
import authHandler from './_handlers/auth.js';
import supabaseConfigHandler from './_handlers/supabase-config.js';
import accountsHandler from './_handlers/accounts.js';
import stocksHandler from './_handlers/stocks.js';
import withdrawalsHandler from './_handlers/withdrawals.js';
import {
  handleTradingState,
  handleTradingStart,
  handleTradingStop,
  handleTradingSettingsGet,
  handleTradingSettingsPost
} from './_handlers/trading.js';

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

  // 1. Admin endpoints
  if (normalizedPath.startsWith('/admin')) {
    return await adminHandler(req, res);
  }

  // 2. Database diagnostics and healthcheck
  if (normalizedPath === '/dbcheck' || normalizedPath === '/healthz') {
    return await dbcheckHandler(req, res);
  }

  // 3. Supabase configuration proxy
  if (normalizedPath === '/supabase-config') {
    return await supabaseConfigHandler(req, res);
  }

  // 4. OTP verification & Resend Email API
  if (
    normalizedPath.startsWith('/otp/') ||
    normalizedPath === '/otp-send' ||
    normalizedPath === '/otp-verify'
  ) {
    return await otpHandler(req, res);
  }

  // 5. Authentication (Login, Set-Password, Supabase Social-Session)
  if (normalizedPath.startsWith('/auth/')) {
    return await authHandler(req, res);
  }

  // 6. Investor accounts, profile, status & transactions
  if (
    normalizedPath === '/accounts' ||
    normalizedPath === '/profile' ||
    normalizedPath === '/my-status' ||
    normalizedPath === '/account-status' ||
    normalizedPath === '/transactions'
  ) {
    return await accountsHandler(req, res);
  }

  // 7. Payment settings (wallets & bank)
  if (normalizedPath === '/payment-settings') {
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
    return await paymentSubmitHandler(req, res);
  }

  if (normalizedPath === '/withdrawals') {
    return await withdrawalsHandler(req, res);
  }
  if (normalizedPath === '/withdrawal-deposits') {
    return res.status(410).json({ success: false, error: 'Upfront deposits are not required or accepted for withdrawal requests. Submit the withdrawal directly.' });
  }

  // 9. Analytics & tracking
  if (normalizedPath === '/track') {
    return await trackHandler(req, res);
  }
  if (normalizedPath === '/analytics-data') {
    return await analyticsDataHandler(req, res);
  }

  // 10. Stock quotes & Live Market Desk
  if (normalizedPath === '/stocks' || normalizedPath.startsWith('/stocks/')) {
    return await stocksHandler(req, res);
  }

  // 11. Invitation verification: accept only an active code stored by an administrator.
  if (normalizedPath === '/invitation/verify') {
    const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code || code.length > 64) return res.status(400).json({ valid: false, error: 'A valid invitation code is required.' });
    let conn;
    try {
      conn = await getDbConnection();
      const [rows] = await conn.query('SELECT code FROM invitation_codes WHERE UPPER(code)=? AND status="active" LIMIT 1', [code]);
      await conn.end();
      return res.status(200).json({ valid: rows.length > 0 });
    } catch (error) {
      if (conn) try { await conn.end(); } catch (e) {}
      return res.status(503).json({ valid: false, error: 'Invitation validation is temporarily unavailable.' });
    }
  }

  // 12. Trading Settings
  if (normalizedPath === '/admin/trading-settings') {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      return handleTradingSettingsPost(req, res, body);
    }
    return handleTradingSettingsGet(req, res);
  }

  // 13. Algorithmic Trading Endpoints (state, start, stop)
  const tradingMatch = normalizedPath.match(/^\/investments\/([^/]+)\/(trading-state|trading\/start|trading\/stop)$/);
  if (tradingMatch) {
    const invId = decodeURIComponent(tradingMatch[1]);
    const action = tradingMatch[2];
    if (action === 'trading-state') {
      return await handleTradingState(req, res, invId);
    }
    if (action === 'trading/start') {
      const body = await parseJsonBody(req);
      return await handleTradingStart(req, res, invId, body);
    }
    if (action === 'trading/stop') {
      const stopBody = req.method === 'POST' ? await parseJsonBody(req) : {};
      return await handleTradingStop(req, res, invId, stopBody);
    }
  }

  return res.status(404).json({ success: false, error: 'API endpoint not found. This action was not completed.', path: pathname });
}
