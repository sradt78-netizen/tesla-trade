#!/usr/bin/env node
/*
 * Browser-level mock API regression test for the authoritative investment flow.
 * It uses the Chromium binary available on Replit and a dependency-free mock
 * HTTP server. No production database, wallet, or notification service is
 * contacted.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

const asset = fs.readFileSync('assets/investment-flow.js', 'utf8');
let receivedPaymentBody = '';

const harness = `<!doctype html>
<html><head><meta charset="utf-8"><title>Investment flow test</title></head>
<body>
<script>
  localStorage.setItem('ttinc_auth', JSON.stringify({email:'investor@example.com',name:'Mock Investor'}));
  // Keep this browser test on the success screen long enough to inspect the
  // multipart response. The static contract below verifies the real redirect.
  window.__ttincDisableAutoPendingRedirect = true;
</script>
<script src="/assets/investment-flow.js"></script>
<script>
(function () {
  function waitFor(selector, timeout) {
    timeout = timeout || 4000;
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        var element = typeof selector === 'function'
          ? selector()
          : document.querySelector(selector);
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
      var flow = await waitFor('#ttinc-authoritative-investment-flow');
      requireTest(!!document.querySelector('[data-stock="TSLA"]'), 'Tesla stock card is missing');
      requireTest(!!document.querySelector('[data-stock="STARLINK"]'), 'Starlink stock card is missing');
      requireTest(!document.querySelector('#ttif-amount'), 'Amount appeared on the stock step');
      requireTest((flow.textContent || '').indexOf('Next: view plans') !== -1, 'Stock step does not have Next action');

      document.querySelector('[data-action="next-stock"]').click();
      await waitFor('[data-plan="growth_ai"]');
      requireTest(!document.querySelector('#ttif-amount'), 'Amount appeared before a plan was selected');
      requireTest((document.body.textContent || '').indexOf('Pioneer') !== -1, 'Pioneer plan is missing');

      document.querySelector('[data-plan="growth_ai"]').click();
      var amount = await waitFor('#ttif-amount');
      requireTest(Number(amount.min) === 1000 && Number(amount.max) === 10000, 'Pioneer range is incorrect');
      amount.value = '2500';
      amount.dispatchEvent(new Event('input', {bubbles:true}));
      document.querySelector('[data-action="made-payment"]').click();
      var proof = await waitFor('#ttif-proof');
      requireTest((document.body.textContent || '').indexOf('Upload your proof of payment') !== -1, 'Proof step did not open after I have made payment');

      var transfer = new DataTransfer();
      transfer.items.add(new File(['%PDF-1.7 mock payment proof'], 'receipt.pdf', {type:'application/pdf'}));
      proof.files = transfer.files;
      proof.dispatchEvent(new Event('change', {bubbles:true}));
      document.querySelector('[data-action="submit-proof"]').click();
      await waitFor('[data-action="dashboard"]', 5000);
      requireTest((document.body.textContent || '').indexOf('Payment proof received') !== -1, 'Success confirmation is missing');
      document.title = 'PASS investment flow browser test';
    } catch (error) {
      document.title = 'FAIL investment flow browser test: ' + error.message;
      document.body.setAttribute('data-test-error', error.stack || error.message);
    }
  }
  window.addEventListener('load', function () { setTimeout(run, 100); });
}());
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/assets/investment-flow.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript'});
    return res.end(asset);
  }
  if (req.url === '/api/stocks') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({
      stocks: [
        {symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', price: 250},
        {symbol: 'X', name: 'X Corp.', exchange: 'Private', price: 55}
      ]
    }));
  }
  if (req.url === '/api/payment-settings') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({
      usdt: {label: 'USDT (TRC-20)', address: 'mock-wallet'},
      bank: {label: 'Bank transfer', name: 'Mock Bank', account: '123456'}
    }));
  }
  if (req.url === '/api/payment-submit.php' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      receivedPaymentBody = Buffer.concat(chunks).toString('utf8');
      const required = [
        'name="userEmail"',
        'investor@example.com',
        'name="total"',
        '2500.00',
        'name="planId"',
        'growth_ai',
        'name="paymentProof"',
        'receipt.pdf'
      ];
      const valid = required.every(part => receivedPaymentBody.includes(part));
      res.writeHead(valid ? 200 : 400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(valid
        ? {success: true, id: 'mock-investment-id', status: 'pending_approval', proofUploaded: true}
        : {success: false, error: 'Mock API did not receive the complete payment proof payload'}));
    });
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(harness);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const chromium = spawn('/repl/tools/bin/chromium', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--virtual-time-budget=8000',
    '--dump-dom',
    `http://127.0.0.1:${port}/invest`
  ], {stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  let errors = '';
  chromium.stdout.on('data', chunk => { output += chunk.toString(); });
  chromium.stderr.on('data', chunk => { errors += chunk.toString(); });
  chromium.on('close', code => {
    server.close();
    try {
      assert.equal(code, 0, 'Chromium exited with code ' + code + '\n' + errors);
      assert.match(output, /<title>PASS investment flow browser test<\/title>/);
      assert.match(output, /data-action="dashboard"/);
      assert.ok(receivedPaymentBody.includes('growth_ai'), 'Mock API did not receive plan ID');
      console.log('PASS browser flow: stocks → plans → amount → proof upload → pending approval');
      console.log('PASS mock API received multipart proof payload with plan and amount');
    } catch (error) {
      console.error(output.slice(-5000));
      console.error(errors.slice(-2000));
      console.error('FAIL', error.message);
      process.exitCode = 1;
    }
  });
});