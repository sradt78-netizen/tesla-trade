#!/usr/bin/env node
/*
 * End-to-end browser contract for the reported payment handoff.
 *
 * The direct cPanel endpoint intentionally returns 404 once, then the routed
 * mock API accepts the same multipart proof. This proves the UI does not stop
 * at "I've made payment" or strand the investor on a legacy screen.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const asset = fs.readFileSync('assets/investment-flow.js', 'utf8');
let routedPaymentBody = '';

const harness = `<!doctype html>
<html><head><meta charset="utf-8"><title>Investment flow test</title></head>
<body>
<script>
  window.__ttincDisableAutoPendingRedirect = true;
  localStorage.setItem('ttinc_auth', JSON.stringify({email:'investor@example.com',name:'Mock Investor'}));
</script>
<script src="/assets/investment-flow.js"></script>
<script>
(function () {
  function waitFor(selector, timeout) {
    timeout = timeout || 5000;
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        var element = typeof selector === 'function' ? selector() : document.querySelector(selector);
        if (element) return resolve(element);
        if (Date.now() - started > timeout) return reject(new Error('Timed out waiting for ' + selector));
        setTimeout(check, 25);
      }());
    });
  }
  function requireTest(condition, message) {
    if (!condition) throw new Error(message);
  }
  async function run() {
    try {
      await waitFor('#ttinc-authoritative-investment-flow');
      document.querySelector('[data-action="next-stock"]').click();
      await waitFor('[data-plan="starter_ai"]');
      document.querySelector('[data-plan="starter_ai"]').click();
      var amount = await waitFor('#ttif-amount');
      amount.value = '50';
      amount.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('[data-action="made-payment"]').click();
      var proof = await waitFor('#ttif-proof');
      var transfer = new DataTransfer();
      transfer.items.add(new File(['%PDF-1.7 mock payment proof'], 'receipt.pdf', {type:'application/pdf'}));
      proof.files = transfer.files;
      proof.dispatchEvent(new Event('change', {bubbles:true}));
      document.querySelector('[data-action="submit-proof"]').click();
      await waitFor('[data-action="dashboard"]', 7000);
      requireTest(localStorage.getItem('ttinc_payment_status') === 'pending_approval',
        'pending approval status was not persisted');
      requireTest((document.body.textContent || '').indexOf('pending admin approval') !== -1,
        'pending approval confirmation is missing');
      document.title = 'PASS payment proof pending redirect contract';
    } catch (error) {
      document.title = 'FAIL onboarding payment redirect: ' + error.message;
      document.body.setAttribute('data-test-error', error.stack || error.message);
    }
  }
  window.addEventListener('load', function () { setTimeout(run, 100); });
}());
</script>
</body></html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/assets/investment-flow.js') {
    response.writeHead(200, {'Content-Type': 'application/javascript'});
    return response.end(asset);
  }
  if (url.pathname === '/api/stocks') {
    response.writeHead(200, {'Content-Type': 'application/json'});
    return response.end(JSON.stringify({stocks: [{symbol: 'TSLA', name: 'Tesla, Inc.', price: 250}]}));
  }
  if (url.pathname === '/api/payment-settings') {
    response.writeHead(200, {'Content-Type': 'application/json'});
    return response.end(JSON.stringify({usdt: {label: 'USDT (TRC-20)', address: 'mock-wallet'}}));
  }
  if (url.pathname === '/api/payment-submit.php' && request.method === 'POST') {
    response.writeHead(404, {'Content-Type': 'application/json'});
    return response.end(JSON.stringify({success: false, error: 'Direct PHP route unavailable in mock'}));
  }
  if (url.pathname === '/api/investments' && request.method === 'POST') {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      routedPaymentBody = Buffer.concat(chunks).toString('utf8');
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({
        success: true,
        id: 'mock-pending-investment',
        status: 'pending_approval',
        proofUploaded: true
      }));
    });
    return;
  }
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  response.end(harness);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  let finished = false;
  const browser = spawn('/repl/tools/bin/chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--virtual-time-budget=8000', '--dump-dom',
    `http://127.0.0.1:${port}/invest`
  ], {stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  let errors = '';
  browser.stdout.on('data', chunk => { output += chunk.toString(); });
  browser.stderr.on('data', chunk => { errors += chunk.toString(); });
  function finish(code, timedOut) {
    if (finished) return;
    finished = true;
    if (timedOut) browser.kill('SIGKILL');
    server.close();
    try {
      assert.equal(code, 0, errors);
      assert.match(output, /<title>PASS payment proof pending redirect contract<\/title>/);
      assert.ok(routedPaymentBody.includes('growth_ai') || routedPaymentBody.includes('starter_ai'));
      assert.ok(routedPaymentBody.includes('receipt.pdf'));
      assert.match(asset, /go\('\/overview\?payment=pending'\)/);
      console.log('PASS payment confirmation retries routed mock API and redirects to pending approval');
      console.log('PASS pending route preserves proof upload and selected plan in multipart payload');
    } catch (error) {
      console.error(output.slice(-5000));
      console.error(errors.slice(-2000));
      console.error('FAIL', error.message);
      process.exitCode = 1;
    }
  }
  browser.on('close', code => finish(code, false));
  setTimeout(() => finish(-1, true), 20000).unref();
});