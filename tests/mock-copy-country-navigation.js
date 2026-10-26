#!/usr/bin/env node
/*
 * Focused browser regression coverage for the three requested repairs:
 *   - shop payment details can be copied
 *   - shop delivery countries render as a large native select
 *   - investment payment details can be copied and the dashboard exposes only
 *     the right-side menu control
 *
 * All application responses are local mocks. No credentials or live payment
 * endpoints are contacted.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const storePage = fs.readFileSync(path.join(root, 'store/index.html'), 'utf8');
const investmentScript = fs.readFileSync(path.join(root, 'assets/investment-flow.js'), 'utf8');
const indexPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const storeScript = fs.readFileSync(path.join(root, 'store/assets/store.js'), 'utf8');

assert.match(storeScript, /function copyPaymentText/);
assert.match(storeScript, /data-copy-payment/);
assert.match(investmentScript, /function copyPaymentText/);
assert.match(investmentScript, /data-copy-value/);
assert.match(indexPage, /#root aside\[class~="w-64"\]/);
assert.match(indexPage, /top: 6px/);

const countrySource = storeScript.match(/var countries = \[(.*?)\n  \];/s);
assert.ok(countrySource, 'The shop country catalog is missing');
const countryCount = (countrySource[1].match(/"[^"]+"/g) || []).length;
assert.ok(countryCount >= 190, `Expected a near-complete sovereign-country list, found ${countryCount}`);

const storeProbe = `
<script>
(function () {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: function (value) {
      window.__copiedPayment = value;
      return Promise.resolve();
    } }
  });
  document.execCommand = function (command) {
    if (command === 'copy') {
      window.__fallbackCopied = true;
      return true;
    }
    return false;
  };
  setTimeout(function () {
    var cash = document.querySelector('[data-mode="cash"]');
    if (cash) cash.click();
    setTimeout(function () {
      var order = document.querySelector('[data-action="order-now"]');
      if (order) order.click();
      setTimeout(function () {
        var country = document.getElementById('delivery-country');
        var copy = document.querySelector('[data-copy-payment]');
        if (country) country.value = 'Nigeria';
        if (country) country.dispatchEvent(new Event('change', {bubbles:true}));
        if (copy) copy.click();
        setTimeout(function () {
          Object.defineProperty(navigator, 'clipboard', {configurable:true, value:undefined});
          if (copy) copy.click();
          setTimeout(function () {
          document.title = 'SHOP_COPY_COUNTRY:' +
            (country && country.options.length >= 190 ? 'PASS' : 'FAIL') + '|' +
            (window.__copiedPayment ? 'COPY_PASS' : 'COPY_FAIL') + '|' +
            (window.__fallbackCopied ? 'FALLBACK_PASS' : 'FALLBACK_FAIL');
          }, 120);
        }, 120);
      }, 450);
    }, 300);
  }, 700);
}());
</script>`;

const investmentPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<script>
localStorage.setItem('ttinc_auth', JSON.stringify({email:'investor@example.com',name:'Mock Investor'}));
</script>
<script>${investmentScript.replace(/<\/script/gi, '<\\\\/script')}</script>
<script>
(function () {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: function (value) {
      window.__copiedPayment = value;
      return Promise.resolve();
    } }
  });
  document.execCommand = function (command) {
    if (command === 'copy') {
      window.__fallbackCopied = true;
      return true;
    }
    return false;
  };
  function waitFor(selector, callback, started) {
    started = started || Date.now();
    var element = document.querySelector(selector);
    if (element) return callback(element);
    if (Date.now() - started > 5000) {
      document.title = 'INVESTMENT_COPY:FAIL:missing:' + selector;
      return;
    }
    setTimeout(function () { waitFor(selector, callback, started); }, 50);
  }
  setTimeout(function () {
    waitFor('[data-action="next-stock"]', function (next) {
      next.click();
      waitFor('[data-plan]', function (plan) {
        plan.click();
        waitFor('#ttif-amount', function (amount) {
          amount.value = '100';
          amount.dispatchEvent(new Event('input', {bubbles:true}));
          waitFor('[data-copy-value]', function (copy) {
            copy.click();
            setTimeout(function () {
              Object.defineProperty(navigator, 'clipboard', {configurable:true, value:undefined});
              copy.click();
              setTimeout(function () {
              document.title = 'INVESTMENT_COPY:' +
                (window.__copiedPayment ? 'PASS' : 'FAIL') + '|' +
                (window.__fallbackCopied ? 'FALLBACK_PASS' : 'FALLBACK_FAIL');
              }, 120);
            }, 120);
          });
        });
      });
    });
  }, 400);
}());
</script></body></html>`;

function sendJson(response, value) {
  response.writeHead(200, {'Content-Type': 'application/json'});
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
  if (requestPath === '/store/' || requestPath === '/store/index.html') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return response.end(storePage.replace('</body>', `${storeProbe}</body>`));
  }
  if (requestPath === '/api/payment-settings.php' || requestPath === '/api/payment-settings') {
    return sendJson(response, {
      bank: {label: 'Bank transfer', bankName: 'Mock Bank', accountNumber: 'ACCT&"123456789'},
      usdt: {label: 'USDT (TRC-20)', network: 'TRC-20', address: 'mock-wallet'}
    });
  }
  if (requestPath === '/api/stocks') {
    return sendJson(response, {stocks: [{symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', price: 250}]});
  }
  if (requestPath === '/store/catalog.json') {
    return sendJson(response, {products: [{id: 'model-y', name: 'Model Y', price: 39990, image: 'model-y-front.jpeg'}]});
  }
  if (requestPath === '/invest') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return response.end(investmentPage);
  }
  const relative = requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  const extension = path.extname(filePath);
  const types = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webm': 'video/webm'
  };
  response.writeHead(200, {'Content-Type': types[extension] || 'application/octet-stream'});
  fs.createReadStream(filePath).pipe(response);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const runs = [
    `http://127.0.0.1:${port}/store/`,
    `http://127.0.0.1:${port}/invest`
  ];
  let index = 0;

  function runBrowser() {
    if (index >= runs.length) {
      server.close();
      console.log(`PASS shop copy control and ${countryCount} delivery countries`);
      console.log('PASS investment copy control against mocked payment settings');
      console.log('PASS dashboard left navigation is hidden and right menu is raised');
      return;
    }
    const chromium = spawn('/repl/tools/bin/chromium', [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--window-size=390,844', '--virtual-time-budget=7000', '--dump-dom', runs[index++]
    ], {stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    let errors = '';
    chromium.stdout.on('data', chunk => { output += chunk.toString(); });
    chromium.stderr.on('data', chunk => { errors += chunk.toString(); });
    chromium.on('close', code => {
      try {
        assert.equal(code, 0, errors);
        if (runs[index - 1].endsWith('/store/')) {
          assert.match(output, /<title>SHOP_COPY_COUNTRY:PASS\|COPY_PASS\|FALLBACK_PASS<\/title>/);
        } else {
          assert.match(output, /<title>INVESTMENT_COPY:PASS\|FALLBACK_PASS<\/title>/);
        }
        runBrowser();
      } catch (error) {
        console.error(output.slice(-5000));
        console.error(errors.slice(-2000));
        console.error('FAIL', error.message);
        server.close();
        process.exitCode = 1;
      }
    });
  }

  runBrowser();
});