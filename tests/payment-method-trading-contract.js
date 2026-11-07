#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const paymentUi = read('assets/investment-flow.js');
const paymentUiPublic = read('public/assets/investment-flow.js');
const tradingUi = read('assets/trading-flow.js');
const tradingUiPublic = read('public/assets/trading-flow.js');
const paymentSettings = read('api/_handlers/payment-settings.js');
const paymentSubmit = read('api/_handlers/payment-submit.js');
const tradingApi = read('api/_handlers/trading.js');
const html = read('index.html');

const catalogMatch = paymentUi.match(/var PAYMENT_METHODS = \[([\s\S]*?)\n  \];/);
assert.ok(catalogMatch, 'investor payment catalog must exist');
const keys = Array.from(catalogMatch[1].matchAll(/key:\s*'([^']+)'/g), match => match[1]);
assert.deepEqual(keys, ['usdt', 'btc', 'eth', 'bank'], 'investors must see only the three crypto methods and one bank transfer');
assert.match(paymentUi, /state\.settings\[method\.key\]\.enabled === true/, 'payment UI must only render methods enabled by Admin');
assert.doesNotMatch(paymentUi, /paypal|cashapp|venmo|alipay|wechat/i, 'retired payment methods must not remain in investor catalog');
assert.equal(paymentUi, paymentUiPublic, 'public and build-source payment assets must stay in sync');

assert.match(paymentSettings, /SHOW COLUMNS FROM app_settings/, 'payment settings must inspect the deployed settings schema');
assert.match(paymentSettings, /key_name/);
assert.match(paymentSettings, /value_data/);
assert.match(paymentSettings, /getActivePaymentMethodKeys/, 'backend must expose the same active method list for deposit validation');
assert.match(paymentSubmit, /getActivePaymentMethodKeys/, 'deposit submission must validate the selected method against Admin settings');
assert.match(paymentSubmit, /enabledPaymentMethods\.includes\(method\)/, 'disabled methods must be rejected server-side');

assert.match(tradingApi, /status IN \('active','approved','completed'\)/, 'trading lookup must accept the completed status already selected by the dashboard');
assert.match(tradingApi, /WHERE id=\? AND status IN \('active','approved','completed'\)/, 'trade persistence must use the same eligible statuses');
assert.match(tradingUi, /showError\(error && error\.message/, 'trading state failures must be visible instead of leaving an empty card');
assert.equal(tradingUi, tradingUiPublic, 'public and build-source trading assets must stay in sync');
assert.match(html, /investment-flow\.js\?v=20261107-admin-payment-methods/);
assert.match(html, /trading-flow\.js\?v=20261107-trading-state-errors/);

console.log('PASS: investor payment options are limited to the four Admin-enabled methods.');
console.log('PASS: disabled/retired methods are rejected by the deposit API.');
console.log('PASS: trading eligibility matches dashboard statuses and state errors are visible.');
