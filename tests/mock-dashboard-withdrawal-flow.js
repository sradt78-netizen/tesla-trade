#!/usr/bin/env node
/*
 * Regression test for the dashboard withdrawal entry point.
 *
 * The sidebar already routes to /withdraw. The overview quick action used to
 * route to /dashboard instead, so this verifies the bridge captures that
 * click and that dashboard-style requests include the receiving destination.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(text = '') {
    this.textContent = text;
    this.value = '';
  }

  closest(selector) {
    return selector === 'button' ? this : null;
  }
}

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'withdrawal-request-fix.js'),
  'utf8',
);

assert.match(source, /routeOverviewWithdrawAction/);
assert.match(source, /window\.location\.href = '\/withdraw'/);
assert.match(source, /payload\.destination = value/);

let pathname = '/overview';
const location = {};
Object.defineProperty(location, 'pathname', {
  get() { return pathname; },
});
Object.defineProperty(location, 'href', {
  get() { return `https://mock.test${pathname}`; },
  set(value) { pathname = new URL(value, `https://mock.test${pathname}`).pathname; },
});

const listeners = {};
const destination = new Element();
destination.value = 'bank: mock account 123';
const document = {
  addEventListener(name, callback) {
    (listeners[name] ||= []).push(callback);
  },
  querySelector(selector) {
    return selector.includes('ttinc-withdraw-details') ? destination : null;
  },
  querySelectorAll() {
    return [];
  },
};

const fetchCalls = [];
function mockFetch(input, init) {
  fetchCalls.push({ input, init });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
}

const window = {
  location,
  fetch: mockFetch,
  setInterval() { return 1; },
};

vm.runInNewContext(source, {
  window,
  document,
  setInterval: window.setInterval,
  console,
});

const click = {
  target: new Element('Withdraw'),
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopPropagation() { this.stopped = true; },
};
listeners.click[0](click);
assert.equal(click.prevented, true);
assert.equal(click.stopped, true);
assert.equal(location.pathname, '/withdraw');

pathname = '/dashboard';
const dashboardClick = {
  target: new Element('Withdraw'),
  prevented: false,
  preventDefault() { this.prevented = true; },
  stopPropagation() {},
};
listeners.click[0](dashboardClick);
assert.equal(dashboardClick.prevented, false, 'dashboard withdrawal modal must remain usable');

pathname = '/dashboard';
window.fetch('/api/withdrawals', {
  method: 'POST',
  body: JSON.stringify({ investmentId: 'mock-investment', amount: 100, method: 'bank' }),
}).then(() => {
  const payload = JSON.parse(fetchCalls[0].init.body);
  assert.equal(payload.walletAddress, destination.value);
  assert.equal(payload.destination, destination.value);
  console.log('Mock dashboard withdrawal flow passed: overview action matches sidebar route and destination contract.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});