#!/usr/bin/env node
/*
 * Mock API regression test for the payment -> admin approval -> dashboard
 * balance flow. It intentionally uses only Node's standard library so it can
 * run on a cPanel export or in a clean checkout without installing packages.
 */
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');

const state = {
  nextId: 1,
  investment: null,
  transactions: [],
};

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
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

function approvedBalance(investment) {
  // Mirrors sync_approved_investment_balance() in api/db.php.
  const total = Number(investment.total);
  const roi = investment.roiPercent;
  const hasCurrent = Number(investment.totalCurrentValue) > 0;
  if (roi === null) {
    investment.totalCurrentValue = total;
    investment.earnings = 0;
  } else if (!hasCurrent) {
    investment.totalCurrentValue = Number((total * (1 + roi / 100)).toFixed(2));
    investment.earnings = Number((total * roi / 100).toFixed(2));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'POST' && url.pathname === '/api/investments') {
      const body = await readBody(req);
      assert.equal(body.paymentConfirmed, true);
      assert.ok(Number(body.total) > 0);

      const id = `mock-investment-${state.nextId++}`;
      state.investment = {
        id,
        userEmail: body.userEmail,
        total: Number(body.total),
        status: 'pending_approval',
        roiPercent: null,
        totalCurrentValue: 0,
        earnings: 0,
        txId: `mock-tx-${id}`,
      };
      state.transactions = [{
        type: 'deposit',
        amount: state.investment.total,
        status: 'pending_approval',
        referenceId: state.investment.txId,
      }];
      return json(res, 200, {
        success: true,
        id,
        txId: state.investment.txId,
        status: state.investment.status,
      });
    }

    const investmentMatch = url.pathname.match(/^\/api\/investments\/([^/]+)$/);
    if (investmentMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      assert.ok(state.investment);
      assert.equal(body.status, 'active');
      assert.equal(state.investment.status, 'pending_approval');

      state.investment.status = 'active';
      approvedBalance(state.investment);
      state.transactions[0].status = 'processed';
      return json(res, 200, {
        ...state.investment,
        availableBalance: state.investment.totalCurrentValue,
      });
    }

    if (investmentMatch && req.method === 'GET') {
      assert.equal(investmentMatch[1], state.investment.id);
      return json(res, 200, {
        ...state.investment,
        availableBalance: state.investment.totalCurrentValue,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/transactions') {
      return json(res, 200, state.transactions);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

function request(base, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: raw ? JSON.parse(raw) : null,
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testBalanceRefreshScript() {
  const script = fs.readFileSync(
    require('node:path').join(__dirname, '..', 'assets', 'balance-sync-fix.js'),
    'utf8'
  );
  let intervalCallback = null;
  let reloads = 0;
  const storage = new Map([
    ['ttinc_auth', JSON.stringify({ email: 'investor@example.test' })],
    ['ttinc_investment_id', state.investment.id],
    ['ttinc_inv_meta', JSON.stringify({
      id: state.investment.id,
      total: 0,
      totalCurrentValue: 0,
    })],
  ]);
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const window = {
    location: { pathname: '/', reload: () => { reloads += 1; } },
    setInterval: callback => { intervalCallback = callback; return 1; },
    clearInterval: () => {},
    addEventListener: () => {},
  };
  const context = {
    window,
    localStorage,
    Number,
    JSON,
    Date,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        total: state.investment.total,
        totalCurrentValue: state.investment.totalCurrentValue,
      }),
    }),
  };
  vm.runInNewContext(script, context);

  // The script loads before the SPA navigates. It must still start polling
  // after the router moves to /dashboard.
  window.location.pathname = '/dashboard';
  intervalCallback();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(reloads, 1, 'dashboard should reload after first stale-to-approved read');
  const meta = JSON.parse(storage.get('ttinc_inv_meta'));
  assert.equal(meta.total, 1250);
  assert.equal(meta.totalCurrentValue, 1250);
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const submitted = await request(base, 'POST', '/api/investments', {
    userEmail: 'investor@example.test',
    portfolio: 'Explorer',
    total: 1250,
    method: 'Wire / SEPA Transfer',
    paymentConfirmed: true,
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.status, 'pending_approval');

  const pending = await request(base, 'GET', `/api/investments/${submitted.body.id}`);
  assert.equal(pending.body.status, 'pending_approval');
  assert.equal(pending.body.totalCurrentValue, 0);
  assert.equal(state.transactions[0].status, 'pending_approval');

  const approved = await request(
    base,
    'PATCH',
    `/api/investments/${submitted.body.id}`,
    { status: 'active' }
  );
  assert.equal(approved.body.status, 'active');
  assert.equal(approved.body.total, 1250);
  assert.equal(approved.body.totalCurrentValue, 1250);
  assert.equal(approved.body.availableBalance, 1250);
  assert.equal(state.transactions[0].status, 'processed');

  const dashboard = await request(base, 'GET', `/api/investments/${submitted.body.id}`);
  assert.equal(dashboard.body.status, 'active');
  assert.equal(dashboard.body.totalCurrentValue, 1250);
  assert.equal(dashboard.body.availableBalance, 1250);

  const history = await request(base, 'GET', '/api/transactions?email=investor@example.test');
  assert.equal(history.body.length, 1);
  assert.deepEqual(history.body[0], {
    type: 'deposit',
    amount: 1250,
    status: 'processed',
    referenceId: submitted.body.txId,
  });

  await testBalanceRefreshScript();
  console.log('PASS payment submission -> admin approval -> dashboard balance');
  console.log('PASS approved deposit ledger status and transaction history');
  console.log('PASS first dashboard refresh after SPA navigation');
  server.close();
}

main().catch(error => {
  console.error('FAIL', error.stack || error);
  server.close(() => process.exitCode = 1);
});