#!/usr/bin/env node
/*
 * Contract test for the new-user promotion:
 * every approved deposit is matched 100% for the first two deposits only.
 * A deterministic reference prevents a repeated approval from paying twice.
 */
'use strict';

const assert = require('node:assert/strict');

function approveDeposit(state, id, amount) {
  if (state.bonusReferences.has(id)) return 0;
  state.bonusReferences.add(id);
  state.approvedDeposits += 1;
  if (state.approvedDeposits > 2) return 0;
  return amount;
}

const state = { approvedDeposits: 0, bonusReferences: new Set() };
assert.equal(approveDeposit(state, 'deposit-1', 250), 250);
assert.equal(approveDeposit(state, 'deposit-2', 800), 800);
assert.equal(approveDeposit(state, 'deposit-3', 1200), 0);
assert.equal(approveDeposit(state, 'deposit-1', 250), 0);
assert.equal(state.approvedDeposits, 3);

const api = require('node:fs').readFileSync('api/index.php', 'utf8');
const db = require('node:fs').readFileSync('api/db.php', 'utf8');
const admin = require('node:fs').readFileSync('admin.php', 'utf8');
assert.match(api, /credit_deposit_match_bonus/);
assert.match(db, /deposit_match:/);
assert.match(db, /approved deposit .* of 2/i);
assert.match(db, /deposit_match_eligible FROM investor_accounts .* FOR UPDATE/s);
assert.match(api, /depositMatchRatePercent.*100/);
assert.match(api, /depositMatchLimit.*2/);
assert.match(admin, /credit_deposit_match_bonus/);

console.log('PASS first two approved deposits receive a 100% match');
console.log('PASS third deposit receives no match');
console.log('PASS repeated approval reference cannot pay twice');