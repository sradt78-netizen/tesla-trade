#!/usr/bin/env node
/*
 * Browser-level responsive smoke test for the compiled investor dashboard.
 * The API response is mocked locally; no production database or credentials
 * are contacted.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dashboardPage = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/assets/index-DBGdQJ0n.css">
  <link rel="stylesheet" href="/assets/trace-fund-experience.css">
</head>
<body>
  <div id="root"></div>
  <script>
    localStorage.setItem('ttinc_auth', JSON.stringify({
      email: 'investor@example.com',
      name: 'Mock Investor'
    }));
    localStorage.setItem('ttinc_investment_id', 'mock-investment');
  </script>
  <script type="module" src="/assets/index-DbpOAvwP.js"></script>
  <script src="/assets/trace-fund-experience.js"></script>
`;
const mobileHarness = `
<script>
(function () {
  var originalFetch = window.fetch.bind(window);
  window.fetch = function (input, options) {
    var url = typeof input === 'string' ? input : input.url;
    if (url.indexOf('/api/investments/mock-investment') !== -1) {
      return Promise.resolve(new Response(JSON.stringify({
        status: 'active',
        id: 'mock-investment',
        txId: 'MOCK-123',
        total: 2500,
        totalCurrentValue: 2750,
        canWithdraw: true,
        portfolio: [
          { id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: 2500 }
        ],
        earnings: { tsla: 2750 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (url.indexOf('/api/investments?') !== -1) {
      return Promise.resolve(new Response(JSON.stringify([{
        id: 'mock-investment',
        status: 'active',
        total: 2500,
        totalCurrentValue: 2750,
        planName: 'Mock plan'
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return originalFetch(input, options);
  };

  function fail(message) {
    document.title = 'FAIL dashboard mobile browser test: ' + message;
    document.body.setAttribute('data-test-error', message);
  }

  function run() {
    try {
      var root = document.getElementById('root');
      var text = root ? (root.textContent || '') : '';
      var mobileHeader = Array.prototype.find.call(
        root.querySelectorAll('[class~="md:hidden"]'),
        function (element) {
          return (element.textContent || '').indexOf('TESLA') !== -1;
        }
      );
      var table = root.querySelector('table');
      var tableScroller = table && table.parentElement;
      if (window.innerWidth >= 768) throw new Error('Expected a mobile viewport, got ' + window.innerWidth);
      if (document.documentElement.dataset.traceFundDashboard !== 'true') {
        throw new Error('Dashboard mode marker was not enabled');
      }
      if (!mobileHeader || getComputedStyle(mobileHeader).display === 'none') {
        throw new Error('Mobile dashboard header is not visible');
      }
      if (text.indexOf('Holdings') === -1 || !table) {
        throw new Error('Dashboard holdings did not render');
      }
      if (!tableScroller || getComputedStyle(tableScroller).overflowX === 'visible') {
        throw new Error('Holdings table is not contained in a horizontal scroller');
      }
      if (table.getBoundingClientRect().width < 500) {
        throw new Error('Holdings table was collapsed instead of remaining readable');
      }
      document.title = 'PASS dashboard mobile browser test';
    } catch (error) {
      fail(error.message);
    }
  }

  setTimeout(function () {
    var started = Date.now();
    (function waitForDashboard() {
      if ((document.getElementById('root').textContent || '').indexOf('Holdings') !== -1) {
        run();
      } else if (Date.now() - started > 7000) {
        fail('Timed out waiting for dashboard content');
      } else {
        setTimeout(waitForDashboard, 50);
      }
    }());
  }, 100);
}());
</script>`;
const completeDashboardPage = dashboardPage + mobileHarness + '</body></html>';

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
  if (requestPath === '/api/investments' && req.url.indexOf('?') !== -1) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify([{
      id: 'mock-investment',
      status: 'active',
      total: 2500,
      totalCurrentValue: 2750,
      planName: 'Mock plan'
    }]));
  }
  if (requestPath === '/api/investments/mock-investment') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'active',
      id: 'mock-investment',
      txId: 'MOCK-123',
      total: 2500,
      totalCurrentValue: 2750,
      canWithdraw: true,
      portfolio: [
        { id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: 2500 }
      ],
      earnings: { tsla: 2750 }
    }));
  }
  const relative = requestPath === '/' || requestPath === '/dashboard'
    ? 'index.html'
    : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);

  if (requestPath === '/dashboard' || requestPath === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(completeDashboardPage);
  }

  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const extension = path.extname(filePath);
  const contentTypes = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };
  res.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const chromium = spawn('/repl/tools/bin/chromium', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=375,812',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=10000',
    '--dump-dom',
    `http://127.0.0.1:${port}/dashboard`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let output = '';
  let errors = '';
  chromium.stdout.on('data', chunk => { output += chunk.toString(); });
  chromium.stderr.on('data', chunk => { errors += chunk.toString(); });
  chromium.on('close', code => {
    server.close();
    try {
      assert.equal(code, 0, 'Chromium exited with code ' + code + '\n' + errors);
      assert.match(output, /<title>PASS dashboard mobile browser test<\/title>/);
      assert.doesNotMatch(output, /data-test-error=/);
      console.log('PASS narrow mobile dashboard: mobile header visible');
      console.log('PASS narrow mobile dashboard: holdings table rendered in contained horizontal scroller');
    } catch (error) {
      console.error(output.slice(-5000));
      console.error(errors.slice(-2000));
      console.error('FAIL', error.message);
      process.exitCode = 1;
    }
  });
});