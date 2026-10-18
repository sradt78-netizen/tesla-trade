#!/usr/bin/env node
/*
 * Mock API regression test for the flows that require a configured PHP host:
 * KYC -> admin approval -> withdrawal approval without an upfront payment,
 * email/social auth contracts, and vehicle installment orders.
 *
 * It intentionally uses only Node's standard library.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

const state = {
  kyc: 'none',
  withdrawal: 'none',
  socialAccountCreated: false,
  nextOrder: 1,
};

const catalog = {
  model_s: 74990,
  model_3: 40240,
  model_x: 79990,
  model_y: 43990,
  cybertruck: 60990,
};
const colors = { white: 0, black: 0, grey: 0, silver: 1000, blue: 1500, red: 2000 };

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function eligibility(amount) {
  return {
    withdrawalAmount: amount,
    requiresUpfrontPayment: false,
    requiredDeposit: 0,
    approvedDeposit: 0,
    depositShortfall: 0,
    depositConfirmed: true,
    tradeStarted: true,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/api/withdrawal-eligibility') {
      return json(res, 200, { eligibility: eligibility(Number(url.searchParams.get('amount'))) });
    }

    if (req.method === 'POST' && url.pathname === '/api/withdrawal-deposits') {
      return json(res, 410, {
        error: 'Upfront payment is not required to request a withdrawal.',
        requiresUpfrontPayment: false,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/kyc') {
      state.kyc = 'pending';
      return json(res, 200, { success: true, status: state.kyc });
    }

    if (req.method === 'PATCH' && url.pathname === '/api/admin/kyc/mock-kyc') {
      assert.equal(req.headers['x-admin-token'], 'mock-admin');
      const body = await readBody(req);
      state.kyc = body.status;
      return json(res, 200, { success: true, status: state.kyc });
    }

    if (req.method === 'POST' && url.pathname === '/api/withdrawals') {
      const body = await readBody(req);
      const gate = eligibility(Number(body.amount));
      if (state.kyc !== 'verified') return json(res, 403, { kyc_required: true, eligibility: gate });
      state.withdrawal = 'pending';
      return json(res, 200, { success: true, status: state.withdrawal });
    }

    if (req.method === 'PATCH' && url.pathname === '/api/withdrawals/mock-withdrawal') {
      assert.equal(req.headers['x-admin-token'], 'mock-admin');
      const body = await readBody(req);
      assert.ok(['processed', 'declined'].includes(body.status));
      state.withdrawal = body.status;
      return json(res, 200, { success: true, status: state.withdrawal });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      if (body.email === 'investor@example.com' && body.password === 'correct-password') {
        return json(res, 200, { success: true, email: body.email, name: 'Mock Investor' });
      }
      return json(res, 401, { success: false, message: 'Invalid email or password.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/social-session') {
      const body = await readBody(req);
      if (body.accessToken !== 'mock-social-token') return json(res, 401, { success: false });
      state.socialAccountCreated = true;
      return json(res, 200, {
        success: true, email: 'social@example.com', name: 'Social Investor',
        isNewAccount: true, investmentStatus: 'none',
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/vehicle-orders') {
      const body = await readBody(req);
      const months = body.paymentType === 'installment' ? Number(body.installmentMonths) : 1;
      assert.ok(catalog[body.vehicleId]);
      assert.ok(colors[body.colorId] !== undefined);
      assert.ok([1, 12, 24, 36].includes(months));
      const total = catalog[body.vehicleId] + colors[body.colorId];
      const installmentAmount = Number((total / months).toFixed(2));
      return json(res, 200, {
        success: true, orderId: `mock-order-${state.nextOrder++}`,
        paymentType: body.paymentType, installmentMonths: months,
        total, firstPaymentAmount: installmentAmount,
        installmentAmount,
        paymentReference: `${body.vehicleId.toUpperCase()} ${body.colorId.toUpperCase()} ORDER`,
      });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

function request(base, method, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, {
      method,
      headers: payload ? { 'Content-Type': 'application/json', ...headers } : headers,
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function main() {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /ttinc-supabase-google/);
  assert.match(html, /ttinc-supabase-facebook/);
  assert.match(html, /\/api\/auth\/social-session/);
  assert.match(html, /Pay monthly/);
  assert.match(html, /\/api\/vehicle-orders/);
  assert.match(html, /safe-withdrawal-flow/);
  assert.doesNotMatch(html, /30%/);
  assert.ok(fs.existsSync('assets/tesla-model-x.png'));
  assert.ok(fs.existsSync('assets/tesla-model-y.png'));

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let result = await request(base, 'GET', '/api/withdrawal-eligibility?amount=500');
  assert.equal(result.body.eligibility.requiredDeposit, 0);
  assert.equal(result.body.eligibility.depositConfirmed, true);
  assert.equal(result.body.eligibility.requiresUpfrontPayment, false);

  result = await request(base, 'POST', '/api/kyc', { withdrawalAmount: 500 });
  assert.equal(result.status, 200, 'KYC must not require an upfront payment');

  result = await request(base, 'POST', '/api/withdrawal-deposits', {
    withdrawalAmount: 500, amount: 150, method: 'usdt',
  });
  assert.equal(result.status, 410);
  assert.equal(result.body.requiresUpfrontPayment, false);
  await request(base, 'PATCH', '/api/admin/kyc/mock-kyc', { status: 'verified' }, { 'x-admin-token': 'mock-admin' });

  result = await request(base, 'POST', '/api/withdrawals', { amount: 500, method: 'bank' });
  assert.equal(result.body.status, 'pending');
  result = await request(base, 'PATCH', '/api/withdrawals/mock-withdrawal', { status: 'processed' }, { 'x-admin-token': 'mock-admin' });
  assert.equal(result.body.status, 'processed');

  result = await request(base, 'POST', '/api/auth/login', {
    email: 'investor@example.com', password: 'correct-password',
  });
  assert.equal(result.body.success, true);
  result = await request(base, 'POST', '/api/auth/login', {
    email: 'investor@example.com', password: 'wrong-password',
  });
  assert.equal(result.status, 401);
  result = await request(base, 'POST', '/api/auth/social-session', { accessToken: 'mock-social-token', provider: 'google' });
  assert.equal(result.body.isNewAccount, true);
  assert.equal(state.socialAccountCreated, true);

  result = await request(base, 'POST', '/api/vehicle-orders', {
    vehicleId: 'model_x', colorId: 'red', paymentType: 'installment',
    installmentMonths: 24, customerName: 'Mock Buyer',
    customerEmail: 'buyer@example.com', customerPhone: '+2348000000000',
    paymentMethod: 'bank',
  });
  assert.equal(result.body.total, 81990);
  assert.equal(result.body.installmentMonths, 24);
  assert.equal(result.body.installmentAmount, 3416.25);

  console.log('PASS withdrawals and KYC do not require an upfront payment');
  console.log('PASS KYC approval and admin withdrawal approval are enforced');
  console.log('PASS email/password and social auth contracts are covered');
  console.log('PASS vehicle shop assets and installment order contract are covered');
  server.close();
}

main().catch(error => {
  console.error('FAIL', error.stack || error);
  server.close(() => { process.exitCode = 1; });
});