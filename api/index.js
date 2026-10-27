import adminHandler from './_handlers/admin.js';
import dbcheckHandler from './_handlers/dbcheck.js';
import paymentSettingsHandler from './_handlers/payment-settings.js';
import paymentSubmitHandler from './_handlers/payment-submit.js';
import trackHandler from './_handlers/track.js';
import analyticsDataHandler from './_handlers/analytics-data.js';
import otpHandler from './_handlers/otp.js';
import authHandler from './_handlers/auth.js';
import supabaseConfigHandler from './_handlers/supabase-config.js';
import accountsHandler from './_handlers/accounts.js';
import stocksHandler from './_handlers/stocks.js';
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

  // 8. Payment & Deposit submission / receipts & Investment detail
  if (
    normalizedPath === '/payment-submit' ||
    normalizedPath === '/payment-proof' ||
    normalizedPath === '/investments' ||
    (normalizedPath.startsWith('/investments/') && !normalizedPath.includes('/trading'))
  ) {
    return await paymentSubmitHandler(req, res);
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

  // 11. Invitation verification fallback
  if (normalizedPath === '/invitation/verify') {
    return res.status(200).json({ valid: true });
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
      return handleTradingState(req, res, invId);
    }
    if (action === 'trading/start') {
      const body = await parseJsonBody(req);
      return handleTradingStart(req, res, invId, body);
    }
    if (action === 'trading/stop') {
      return handleTradingStop(req, res, invId);
    }
  }

  return res.status(200).json({ ok: true, path: pathname });
}
