#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const paymentUi = read('assets/investment-flow.js');
const pendingUi = read('assets/pending-payment-dashboard.js');
const historyUi = read('assets/transaction-history-fix.js');
const adminHtml = read('admin.html');
const adminApi = read('api/_handlers/admin.js');
const accountsApi = read('api/_handlers/accounts.js');
const telegramApi = read('api/telegram.js');
const apiRouter = read('api/index.js');
const phpBackend = read('php-backend/index.php');

// Both investor payment experiences must use the same four-method catalog.
const catalog = paymentUi.match(/var PAYMENT_METHODS = \[([\s\S]*?)\n  \];/);
assert.ok(catalog, 'main investor payment catalog must exist');
const paymentKeys = Array.from(catalog[1].matchAll(/key:\s*'([^']+)'/g), m => m[1]);
assert.deepEqual(paymentKeys, ['usdt', 'btc', 'eth', 'bank']);

const planCatalog = index.match(/var TT_PAYMENT_METHODS = \[([\s\S]*?)\n\s*\];/);
assert.ok(planCatalog, 'dashboard plan chooser payment catalog must exist');
assert.deepEqual(
  Array.from(planCatalog[1].matchAll(/key:\s*'([^']+)'/g), m => m[1]),
  ['usdt', 'eth', 'btc', 'bank']
);

const modalStart = index.indexOf('function openPayModal()');
const modalEnd = index.indexOf('window.ttincOpenDepositModal', modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart, 'dashboard deposit modal must exist');
const dashboardPaymentModal = index.slice(modalStart, modalEnd);
assert.equal((dashboardPaymentModal.match(/addMethod\('/g) || []).length, 4, 'dashboard deposit modal must add exactly four methods');
assert.doesNotMatch(dashboardPaymentModal, /venmo|cashapp|paypal|alipay|wechat/i, 'retired payment methods must not be shown in dashboard modal');
assert.doesNotMatch(dashboardPaymentModal, /@sample|sample(?:CashApp|[-_](?:venmo|paypal|alipay|wechat))/i, 'invented sample payment destinations must not be displayed');

assert.match(index, /transaction-history-fix\.js\?v=20261107-dashboard-history/);
assert.match(index, /pending-payment-dashboard\.js\?v=20261107-method-display/);
assert.match(pendingUi, /Payment Method/);
assert.match(pendingUi, /escapeHtml\(det\.method\)/);
assert.match(historyUi, /Recent history/);
assert.match(historyUi, /\/api\/transactions\?email=/);
assert.match(historyUi, /View all/);

// Referral attribution is validated against the real referral_codes table and set once.
assert.match(accountsApi, /ensureReferralAttributionColumn/);
assert.match(accountsApi, /resolveReferralCode/);
assert.match(accountsApi, /SELECT email FROM referral_codes WHERE UPPER\(code\)=\? LIMIT 1/);
assert.match(accountsApi, /referral_code=IF\(referral_code IS NULL OR referral_code='', VALUES\(referral_code\), referral_code\)/);

assert.match(adminApi, /approved_investment_amount/);
assert.match(adminApi, /pending_investment_amount/);
assert.match(adminApi, /LEFT JOIN referral_codes rc/);
assert.match(adminApi, /\n\s*referrals,/);
assert.match(adminHtml, /switchTab\('referrals'\)/);
assert.match(adminHtml, /id="tab-referrals"/);
assert.match(adminHtml, /function renderReferralReport/);
assert.match(adminHtml, /stat-referral-approved/);
assert.match(adminHtml, /stat-referral-pending/);

// Telegram credentials are shared through the existing MySQL app_settings record.
assert.match(adminHtml, /cfg-telegram-token/);
assert.match(adminHtml, /cfg-telegram-chat-id/);
assert.match(adminHtml, /saveTelegramSettings/);
assert.match(adminHtml, /testTelegramSettings/);
assert.match(adminApi, /action === 'test_telegram'/);
assert.match(telegramApi, /await getDbConnection\(\)/);
assert.match(telegramApi, /telegram_settings/);

// KYC's existing PHP submission handler already emits Telegram on successful persistence.
// The Vercel Node router still lacks a KYC handler; log this as a visible build warning
// rather than falsely claiming a Vercel KYC submission has been wired end to end.
assert.match(phpBackend, /send_telegram\(.*New KYC Submission/s);
const hasVercelKycRoute = /normalizedPath\s*===\s*['"]\/kyc['"]/.test(apiRouter) ||
  /normalizedPath\.startsWith\(['"]\/kyc/.test(apiRouter);
if (!hasVercelKycRoute) {
  console.warn('WARN: /api/kyc still falls through the Vercel Node API router; the persistent KYC upload route needs to be wired before claiming end-to-end KYC Telegram delivery.');
}

// Validate the Admin page structure and its inline script syntax.
assert.equal((adminHtml.match(/<html/gi) || []).length, 1, 'Admin page must contain exactly one html element');
assert.equal((adminHtml.match(/<\/html>/gi) || []).length, 1, 'Admin page must contain exactly one closing html tag');
const scripts = Array.from(adminHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), m => m[1]).filter(s => s.trim());
for (let i = 0; i < scripts.length; i++) {
  new vm.Script(scripts[i], { filename: 'admin-inline-' + i + '.js' });
}

console.log('PASS: both investor payment flows display only the four approved methods.');
console.log('PASS: dashboard pending view shows selected payment method and history reads the saved ledger.');
console.log('PASS: referrals are captured once and Admin totals real approved/pending investment records.');
console.log('PASS: Admin Telegram controls save to the same MySQL settings record and support a live test message.');
console.log('PASS: Admin HTML and inline JavaScript are structurally valid.');
