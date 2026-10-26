#!/usr/bin/env node
/*
 * Static end-to-end contract checks for the settings surfaces shipped in the
 * archive. PHP cannot be exercised against the production database locally,
 * so this protects the browser/API/admin wiring and validation boundaries.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/index.php', 'utf8');
const admin = fs.readFileSync('admin.php', 'utf8');
const bundle = fs.readFileSync('assets/index-DbpOAvwP.js', 'utf8');

for (const route of [
  'payment-settings',
  'referral-settings',
  'email-settings',
  'telegram-settings',
  'admin/trading-settings',
]) {
  assert.ok(api.includes(route), `API must expose ${route}`);
}

assert.match(api, /if \(\$seg0 === 'payment-settings' && \$method === 'GET'\)/);
assert.match(api, /if \(\$seg0 === 'payment-settings' && \$method === 'PATCH'\)/);
assert.match(api, /if \(\$seg0 === 'referral-settings' && \$method === 'PATCH'\)/);
assert.match(api, /if \(\$seg0 === 'email-settings' && \$seg1 === '' && \$method === 'PATCH'\)/);
assert.match(api, /if \(\$seg0 === 'telegram-settings' && \$method === 'PATCH'\)/);
assert.match(api, /if \(\$seg0 === 'admin' && \$seg1 === 'trading-settings' && \$method === 'POST'\)/);
assert.match(api, /max\(0, \(float\)\$b\['bonus_amount'\]\)/);
assert.match(api, /max\(1, \(int\)\$b\['maturity_days'\]\)/);
assert.match(api, /require_admin\(\)/);

for (const field of [
  'save_trading_settings',
  'save_payment_settings',
  'save_email_settings',
  'save_telegram_settings',
  'test_email',
  'test_telegram',
]) {
  assert.ok(admin.includes(field), `Admin UI must submit ${field}`);
}
for (const field of [
  'profit_interval_seconds',
  'loss_interval_seconds',
  'profit_rate_percent',
  'loss_rate_percent',
  'telegram_bot_token',
  'telegram_chat_id',
]) {
  assert.ok(admin.includes(field), `Admin UI must render ${field}`);
}

assert.match(bundle, /path:"\/settings",component:/);
assert.match(bundle, /Save Changes/);
assert.match(bundle, /Email Notifications/);
assert.match(bundle, /SMS Notifications/);
assert.match(bundle, /path:"\/admin"/);

console.log('PASS settings API routes and admin authorization contracts');
console.log('PASS payment, email, Telegram, referral, and trading fields are wired');
console.log('PASS investor settings route exposes profile and notification controls');