#!/usr/bin/env node
/*
 * Regression coverage for the public floating withdrawal notification.
 *
 * This serves the real site shell while replacing the public API calls with
 * deterministic mock responses. The browser assertion checks the notification
 * after its normal four-second delay and verifies that it remains viewport
 * fixed, above the page sections, and inside the viewport.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const experienceCss = fs.readFileSync(path.join(root, 'assets/trace-fund-experience.css'), 'utf8');
const notificationLayer = fs.readFileSync(path.join(root, 'assets/withdrawal-notification-layer.js'), 'utf8');

assert.match(notificationLayer, /ttinc-withdrawal-notification/);
assert.match(experienceCss, /\.ttinc-withdrawal-notification\s*\{[\s\S]+z-index:\s*2147483647/);
assert.match(indexSource, /Trustpilot/);
assert.match(indexSource, /12,000\+ reviews/);

function contentType(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };
  return types[path.extname(filePath)] || 'application/octet-stream';
}

function withMockApi(source) {
  const mock = `<script>
    (function () {
      const realFetch = window.fetch.bind(window);
      window.__mockApiCalls = [];
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const route = url.split('?')[0];
        if (route === '/api/stocks') {
          window.__mockApiCalls.push('stocks');
          return Promise.resolve(new Response(JSON.stringify({
            stocks: [{ symbol: 'TSLA', price: 247.5, prevClose: 245, change: 2.5, changePct: 1.02, high: 249, low: 244 }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (route === '/api/withdrawals') {
          window.__mockApiCalls.push('withdrawals');
          return Promise.resolve(new Response(JSON.stringify([
            { id: 'mock-withdrawal-1', status: 'approved', amount: 179941 }
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch(input, init);
      };
      Promise.all([
        window.fetch('/api/stocks'),
        window.fetch('/api/withdrawals')
      ]).then(function (responses) {
        return Promise.all(responses.map(function (response) { return response.json(); }));
      }).then(function () {
        window.__mockApiReady = true;
      });
    }());
  </script>`;
  return source.replace('</head>', `${mock}</head>`);
}

function runChromium(url) {
  return new Promise((resolve, reject) => {
    const browser = spawn('/repl/tools/bin/chromium', [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=1440,900', '--virtual-time-budget=7000', '--dump-dom', url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    browser.stdout.on('data', chunk => { output += chunk.toString(); });
    browser.stderr.on('data', chunk => { errors += chunk.toString(); });
    browser.on('close', code => {
      if (code !== 0) return reject(new Error(`Chromium exited with ${code}: ${errors}`));
      const match = output.match(/<title>([^<]*)<\/title>/);
      resolve(match ? match[1] : '');
    });
  });
}

async function run() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname === '/') {
     const probe = `<script>
        (function () {
          function mark() {
            const el = document.querySelector('.ttinc-withdrawal-notification');
            const trustpilot = document.querySelector('.trace-onsite-review-cta');
            if (!el) {
              document.title = 'WITHDRAWAL_LAYER:waiting';
              return;
            }
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            document.title = 'WITHDRAWAL_LAYER:position=' + style.position +
               '|z=' + style.zIndex +
              '|visible=' + (rect.left >= 0 && rect.right <= innerWidth + 1 &&
                rect.top >= 0 && rect.bottom <= innerHeight + 1) +
              '|api=' + !!window.__mockApiReady +
              '|trustpilot=' + !!trustpilot +
              '|reviews=' + (trustpilot ? /12,000\\+ reviews/.test(trustpilot.textContent) : false);
          }
          mark();
          setInterval(mark, 50);
        }());
      </script>`;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(withMockApi(indexSource).replace('</head>', `${probe}</head>`));
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(requestUrl.pathname === '/api/stocks'
        ? JSON.stringify({ stocks: [{ symbol: 'TSLA', price: 247.5 }] })
        : '[]');
      return;
    }

    const relative = requestUrl.pathname.replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const title = await runChromium(`${base}/`);
    assert.match(title, /WITHDRAWAL_LAYER:position=fixed\|z=2147483647\|visible=true\|api=true\|trustpilot=true\|reviews=true/);
    console.log('PASS mocked API page keeps withdrawal notification fixed above page content and shows 12,000+ reviews');
  } finally {
    server.close();
  }
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});