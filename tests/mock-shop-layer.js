#!/usr/bin/env node
/*
 * Regression smoke test for the persistent Shop launcher.
 * The API is mocked locally; no production host, database, or credentials
 * are contacted.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

const html = fs.readFileSync('index.html', 'utf8');
const MAX_LAYER = 2147483647;

// The launcher must beat the high-z-index landing sections in this snapshot.
assert.match(html, /#ts-float-shop\s*\{\s*z-index:\s*2147483647\s*!important;/);
assert.match(html, /z-index:2147483647;background:#e31937;color:#fff/);
assert.match(html, /window\.location\.href\s*=\s*'\/store\/'/);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && url.pathname === '/api/payment-settings') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      settings: { usdt: { address: 'MOCK-USDT-ADDRESS' } },
    }));
  }

  if (req.method === 'POST' && url.pathname === '/api/vehicle-orders') {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      assert.equal(body.vehicleId, 'model_x');
      assert.equal(body.paymentMethod, 'usdt');
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        paymentReference: 'MOCK-ORDER-001',
        total: 81990,
      }));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ success: false }));
});

function request(base, method, path, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = http.request(new URL(path, base), {
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
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let result = await request(base, 'GET', '/api/payment-settings');
  assert.equal(result.status, 200);
  assert.equal(result.body.settings.usdt.address, 'MOCK-USDT-ADDRESS');

  result = await request(base, 'POST', '/api/vehicle-orders', {
    vehicleId: 'model_x',
    paymentMethod: 'usdt',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.paymentReference, 'MOCK-ORDER-001');

  console.log(`PASS Shop launcher uses z-index ${MAX_LAYER} above page layers`);
  console.log('PASS Shop payment-settings and vehicle-order mock API contract');
  server.close();
}

main().catch(error => {
  console.error('FAIL', error.stack || error);
  server.close(() => { process.exitCode = 1; });
});