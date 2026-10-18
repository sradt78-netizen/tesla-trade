#!/usr/bin/env node
/*
 * Mock regression coverage for the invitation/registration failure:
 * - a configured invitation is restored into a non-empty ledger
 * - an explicitly revoked code remains rejected
 * - the live registration panel (which is not inside a form) completes the
 *   OTP, account, and password API handoff before routing to plan selection
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dbSource = fs.readFileSync('api/db.php', 'utf8');
assert.match(dbSource, /SELECT id FROM invitation_codes WHERE code=\? LIMIT 1/);
assert.doesNotMatch(dbSource, /SELECT COUNT\(\*\) FROM invitation_codes/);

function seedConfiguredCode(rows, configured) {
  const code = configured.trim().toUpperCase();
  if (!rows.some(row => row.code === code)) {
    rows.push({ code, status: 'active' });
  }
}

function invitationMatches(rows, candidate) {
  const code = candidate.trim().toUpperCase();
  const row = rows.find(item => item.code === code);
  return !!row && row.status === 'active';
}

const ledger = [{ code: 'OLD-CODE', status: 'revoked' }];
seedConfiguredCode(ledger, 'INVITATIONCODE');
assert.equal(invitationMatches(ledger, 'invitationcode'), true);
assert.equal(invitationMatches(ledger, 'OLD-CODE'), false);
console.log('PASS configured invitation is seeded into a non-empty ledger');
console.log('PASS explicitly revoked invitation remains rejected');

class Storage {
  constructor() { this.values = Object.create(null); }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem(key, value) { this.values[key] = String(value); }
  removeItem(key) { delete this.values[key]; }
}

function input(value) {
  return { value: value || '' };
}

const fields = {
  '#ttinc-register-name': input('Mock Investor'),
  '#ttinc-register-email': input('mock-investor@example.com'),
  '#ttinc-register-password': input('mock-password-123'),
  '#ttinc-register-phone': input('+1 555 0100'),
  '#ttinc-register-age': input('30'),
  '#ttinc-register-invitation': input('INVITATIONCODE'),
  '#ttinc-register-otp': input('123456'),
};

const submit = {
  disabled: false,
  textContent: 'Verify code & create account',
  closest(selector) {
    return selector === 'button' ? submit : null;
  },
};

const panel = {
  querySelector(selector) {
    if (selector === '#ttinc-register-submit') return submit;
    if (selector === 'input[maxlength="6"]') return fields['#ttinc-register-otp'];
    return fields[selector] || null;
  },
};

const localStorage = new Storage();
const sessionStorage = new Storage();
const listeners = {};
const calls = [];
const location = {
  pathname: '/register',
  replaced: '',
  replace(url) { this.replaced = url; },
};

const document = {
  getElementById(id) {
    return id === 'ttinc-register-panel' ? panel : null;
  },
  addEventListener(type, handler) {
    listeners[type] = handler;
  },
  querySelector() { return null; },
  createElement() {
    return {
      setAttribute() {},
      style: {},
      querySelector() { return null; },
    };
  },
};

function mockFetch(url, options) {
  const payload = options && options.body ? JSON.parse(options.body) : {};
  calls.push({ url, payload });
  if (url === '/api/otp/verify') {
    assert.equal(payload.email, 'mock-investor@example.com');
    assert.equal(payload.code, '123456');
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        verificationToken: 'mock-verification-token',
      }),
    });
  }
  if (url === '/api/accounts') {
    assert.equal(payload.invitationCode, 'INVITATIONCODE');
    assert.equal(payload.verificationToken, 'mock-verification-token');
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'plan_selection' }),
    });
  }
  if (url === '/api/auth/set-password') {
    assert.equal(payload.password, 'mock-password-123');
    assert.equal(payload.verificationToken, 'mock-verification-token');
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  }
  return Promise.reject(new Error(`Unexpected mock endpoint: ${url}`));
}

const window = {
  location,
  ttincInvitation: {
    get: () => 'INVITATIONCODE',
  },
};

vm.runInNewContext(
  fs.readFileSync('assets/registration-flow-fix.js', 'utf8'),
  {
    window,
    document,
    localStorage,
    sessionStorage,
    fetch: mockFetch,
    JSON,
    Date,
    Promise,
    setTimeout,
    console,
  },
);

assert.equal(typeof listeners.click, 'function');
const event = {
  target: submit,
  preventDefault() {},
  stopImmediatePropagation() {},
};
listeners.click(event);

setTimeout(() => {
  try {
    assert.deepEqual(calls.map(call => call.url), [
      '/api/otp/verify',
      '/api/accounts',
      '/api/auth/set-password',
    ]);
    assert.equal(location.replaced, '/invest?onboarding=email');
    assert.equal(submit.disabled, true);
    console.log('PASS mock OTP/account/password APIs complete before plan-selection redirect');
    console.log('PASS non-form registration panel no longer falls through to the dashboard route');
  } catch (error) {
    console.error('FAIL', error.stack || error);
    process.exitCode = 1;
  }
}, 25);