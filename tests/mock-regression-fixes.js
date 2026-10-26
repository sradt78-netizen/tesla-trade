#!/usr/bin/env node
/*
 * Static contract checks for the three fixes that can otherwise regress when
 * a cached compiled frontend or an older MySQL schema is deployed.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/index.php', 'utf8');
const directPayment = fs.readFileSync('api/payment-submit.php', 'utf8');
const settings = fs.readFileSync('api/payment-settings.php', 'utf8');
const config = fs.readFileSync('api/config.php', 'utf8');
const admin = fs.readFileSync('admin.php', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const withdrawalFix = fs.readFileSync('assets/withdrawal-request-fix.js', 'utf8');
const paymentGuard = fs.readFileSync('assets/payment-method-guard.js', 'utf8');
const investmentFlow = fs.readFileSync('assets/investment-flow.js', 'utf8');
const registrationFlow = fs.readFileSync('assets/registration-flow-fix.js', 'utf8');

// The rich payment insert has 19 bound values followed by three timestamps.
// The old snapshot had only 18 placeholders, so every proof upload fell into
// the legacy insert and was silently discarded.
const richInsert = /VALUES \((\?,){18}\?,NOW\(\),NOW\(\),NOW\(\)\)/;
assert.match(api, richInsert, 'main payment insert must bind all proof columns');
assert.match(directPayment, richInsert, 'direct payment insert must bind all proof columns');
assert.match(api, /payment_proof_path=\?, payment_proof_name=\?/);
assert.match(admin, /href="\/api\/payment-proof\.php\?id=/);
assert.match(html, /id="ttinc-payment-proof"/);
assert.match(html, /form\.append\('paymentProof'/);

// The server catalog, public settings response, admin form, and compatibility
// payment UI must not offer the retired method.
for (const source of [api, settings, config, admin, html]) {
  assert.doesNotMatch(source, /gift.?card/i);
}
assert.match(paymentGuard, /delete data\.giftcard/);
assert.match(html, /payment-method-guard\.js/);
assert.match(registrationFlow, /\/api\/accounts/);
assert.match(registrationFlow, /invitationCode/);
assert.match(registrationFlow, /window\.location\.(?:href|replace)\('\/invest/);
assert.match(investmentFlow, /go\('\/overview\?payment=pending'\)/);

// Withdrawal requests must contain a destination that the API can persist.
assert.match(withdrawalFix, /id="ttinc-withdraw-details"/);
assert.match(withdrawalFix, /name="walletAddress"/);
assert.match(withdrawalFix, /payload\.walletAddress/);
assert.match(api, /Receiving wallet or bank details are required/);

// Admin controls are present and the API is the source of truth for both
// timing windows and movement percentages.
assert.match(admin, /profit_interval_seconds/);
assert.match(admin, /loss_interval_seconds/);
assert.match(admin, /profit_rate_percent/);
assert.match(admin, /loss_rate_percent/);
assert.match(api, /profitIntervalSeconds/);
assert.match(api, /lossIntervalSeconds/);
assert.match(api, /profitRatePercent/);
assert.match(api, /lossRatePercent/);
assert.match(api, /phaseRemainingSeconds/);
assert.match(fs.readFileSync('assets/trading-flow.js', 'utf8'), /phaseRemainingSeconds/);

console.log('PASS payment proof insert retains uploaded metadata');
console.log('PASS gift-card payment method is removed from all active surfaces');
console.log('PASS withdrawal dialog collects and forwards receiving details');
console.log('PASS admin trading percentages and timers are wired end to end');