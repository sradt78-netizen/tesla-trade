import adminHandler from './admin.js';
import dbcheckHandler from './dbcheck.js';
import paymentSettingsHandler from './payment-settings.js';
import paymentSubmitHandler from './payment-submit.js';
import trackHandler from './track.js';
import analyticsDataHandler from './analytics-data.js';
import otpHandler from './otp.js';
import authHandler from './auth.js';
import supabaseConfigHandler from './supabase-config.js';
import accountsHandler from './accounts.js';

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
    normalizedPath === '/investments'
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

  // 10. Invitation verification fallback
  if (normalizedPath === '/invitation/verify') {
    return res.status(200).json({ valid: true });
  }

  return res.status(200).json({ ok: true, path: pathname });
}
