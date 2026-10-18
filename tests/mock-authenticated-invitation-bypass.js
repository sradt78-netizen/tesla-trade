#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Storage {
  constructor(values) { this.values = Object.assign({}, values || {}); }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem(key, value) { this.values[key] = String(value); }
  removeItem(key) { delete this.values[key]; }
}

function makeGate({ local = {}, session = {}, verifyResponse } = {}) {
  const htmlClasses = new Set();
  let gate = null;
  let verifyCalls = 0;
  const localStorage = new Storage(local);
  const sessionStorage = new Storage(session);

  const form = { addEventListener() {}, querySelector() { return button; } };
  const input = { value: '', focus() {} };
  const button = { disabled: false, textContent: 'CONTINUE' };
  const gateNode = {
    id: 'ttinc-invitation-gate',
    setAttribute() {},
    set innerHTML(value) { this.html = value; },
    querySelector(selector) { return selector === 'form' ? form : input; },
    remove() { gate = null; },
  };

  const document = {
    readyState: 'complete',
    createElement() { return gateNode; },
    documentElement: {
      classList: {
        add(value) { htmlClasses.add(value); },
        remove(value) { htmlClasses.delete(value); },
        contains(value) { return htmlClasses.has(value); },
      },
    },
    body: { appendChild(node) { gate = node; } },
    getElementById(id) {
      if (id === 'ttinc-invitation-gate') return gate;
      return null;
    },
    querySelector() { return null; },
    addEventListener() {},
  };

  const window = {
    location: { pathname: '/dashboard', search: '' },
    localStorage,
    sessionStorage,
    AbortController,
    fetch: async () => {
      verifyCalls += 1;
      return {
        ok: verifyResponse?.ok ?? true,
        status: verifyResponse?.status ?? 200,
        json: async () => verifyResponse?.payload ?? { valid: true },
      };
    },
  };

  function MutationObserver() {
    this.observe = () => {};
  }

  vm.runInNewContext(
    fs.readFileSync('assets/invitation-gate.js', 'utf8'),
    {
      window,
      document,
      localStorage,
      sessionStorage,
      URLSearchParams,
      MutationObserver,
      setTimeout,
      clearTimeout,
      setInterval() { return 1; },
      Promise,
      AbortController,
      console,
    },
  );

  return { htmlClasses, localStorage, sessionStorage, get verifyCalls() { return verifyCalls; }, get gate() { return gate; } };
}

async function run() {
  const signedIn = makeGate({
    local: { ttinc_auth: JSON.stringify({ email: 'returning@example.com', name: 'Returning User' }) },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(signedIn.htmlClasses.has('ttinc-invitation-locked'), false);
  assert.equal(signedIn.verifyCalls, 0, 'saved verified accounts must not be asked to re-enter a code');

  const invited = makeGate({
    local: { ttinc_invitation_code: 'MOCK-CODE-22' },
    verifyResponse: { ok: true, status: 200, payload: { valid: true } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(invited.htmlClasses.has('ttinc-invitation-locked'), false);
  assert.equal(invited.localStorage.getItem('ttinc_invitation_code'), 'MOCK-CODE-22');
  assert.equal(invited.verifyCalls, 1, 'a saved invitation is rechecked without asking the user to type it again');

  const revoked = makeGate({
    local: { ttinc_invitation_code: 'REVOKED-0001' },
    verifyResponse: { ok: true, status: 200, payload: { valid: false, error: 'Code revoked' } },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(revoked.localStorage.getItem('ttinc_invitation_code'), null);
  assert.equal(revoked.htmlClasses.has('ttinc-invitation-locked'), true);

  console.log('PASS a saved verified account bypasses the invitation prompt');
  console.log('PASS accepted invitation survives reloads and is revalidated silently');
  console.log('PASS a revoked invitation is cleared and still requires access');
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});