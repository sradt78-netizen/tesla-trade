import adminHandler from './admin.js';
import dbcheckHandler from './dbcheck.js';
import paymentSettingsHandler from './payment-settings.js';
import paymentSubmitHandler from './payment-submit.js';
import trackHandler from './track.js';
import analyticsDataHandler from './analytics-data.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-admin-password');

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

  // 3. Payment settings (wallets & bank)
  if (normalizedPath === '/payment-settings') {
    return await paymentSettingsHandler(req, res);
  }

  // 4. Payment & Deposit submission / receipts
  if (
    normalizedPath === '/payment-submit' ||
    normalizedPath === '/payment-proof' ||
    normalizedPath === '/investments'
  ) {
    return await paymentSubmitHandler(req, res);
  }

  // 5. Analytics & tracking
  if (normalizedPath === '/track') {
    return await trackHandler(req, res);
  }
  if (normalizedPath === '/analytics-data') {
    return await analyticsDataHandler(req, res);
  }

  // 6. Supabase configuration proxy
  if (normalizedPath === '/supabase-config') {
    return res.status(200).json({
      url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
    });
  }

  // 7. Invitation verification
  if (normalizedPath === '/invitation/verify') {
    return res.status(200).json({ valid: true });
  }

  return res.status(200).json({ ok: true, path: pathname });
}
