#!/usr/bin/env node
/*
 * Browser regression coverage for the visitor-facing routes that previously
 * failed before a user could interact with them:
 *   - / stays on the public homepage
 *   - /kyc stays on the KYC form when opened directly
 *   - the shop's delivery form contains a real country select
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function htmlWithProbe(source, probe) {
  if (source.includes('</body>')) return source.replace('</body>', `${probe}</body>`);
  return `${source}${probe}`;
}

function withMockInvestor(source) {
  return source.replace(
    '<script type="module"',
    '<script>localStorage.setItem("ttinc_auth", JSON.stringify({email:"investor@example.com",name:"Mock Investor"}));localStorage.setItem("ttinc_investment_id","mock-investment");</script><script type="module"'
  );
}

function routePage(requestPath) {
  if (requestPath === '/' || requestPath === '/index.html' || requestPath === '/login') {
    const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    return htmlWithProbe(source, `
      <script>
        setTimeout(function () {
          document.title = 'PUBLIC_ROUTE:' + location.pathname + '|HOME:' +
            (document.querySelector('h1') ? 'present' : 'missing');
        }, 1800);
      </script>
    `);
  }

  if (requestPath === '/portfolio' || requestPath === '/dashboard') {
    const source = withMockInvestor(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    return htmlWithProbe(source, `
      <script>
        setTimeout(function () {
          var root = document.getElementById('root');
          document.title = 'PORTFOLIO_ROUTE:' + location.pathname + '|HOLDINGS:' +
            ((root && (root.textContent || '').indexOf('Holdings') !== -1) ? 'present' : 'missing') +
            '|SCROLL:' + window.scrollY;
        }, 4200);
      </script>
    `);
  }

  if (requestPath === '/kyc') {
    const source = fs.readFileSync(path.join(root, 'kyc.php'), 'utf8');
    return htmlWithProbe(source, `
      <script>
        setTimeout(function () {
          document.title = 'KYC_ROUTE:' + location.pathname + '|FORM:' +
            (document.getElementById('kycForm') ? 'present' : 'missing');
        }, 1200);
      </script>
    `);
  }

  if (requestPath === '/store/' || requestPath === '/store/index.html') {
    const source = fs.readFileSync(path.join(root, 'store/index.html'), 'utf8');
    return htmlWithProbe(source, `
      <script>
        setTimeout(function () {
          var cash = document.querySelector('[data-mode="cash"]');
          if (cash) cash.click();
          setTimeout(function () {
            var order = document.querySelector('[data-action="order-now"]');
            if (order) order.click();
            setTimeout(function () {
              var country = document.getElementById('delivery-country');
              document.title = 'STORE_ROUTE:' + location.pathname + '|COUNTRY:' +
                (country ? 'present:' + country.options.length : 'missing');
            }, 250);
          }, 250);
        }, 1800);
      </script>
    `);
  }

  return null;
}

function contentType(filePath) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.php': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }[path.extname(filePath)] || 'application/octet-stream';
}

async function run() {
  const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
    const page = routePage(requestPath);
    if (page) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page);
      return;
    }

    if (requestPath === '/api/investments/mock-investment') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: 'mock-investment',
        status: 'active',
        total: 2500,
        totalCurrentValue: 2750,
        planName: 'Mock plan',
        portfolio: [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: 2500 }],
        earnings: { tsla: 2750 }
      }));
      return;
    }
    if (requestPath === '/api/investments' && request.url.includes('?')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([{
        id: 'mock-investment',
        status: 'active',
        total: 2500,
        totalCurrentValue: 2750,
        planName: 'Mock plan'
      }]));
      return;
    }
    if (requestPath.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify([]));
      return;
    }

    let relative = requestPath.replace(/^\/+/, '');
    if (relative === '') relative = 'index.html';
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

  async function chromiumTitle(url) {
    return new Promise((resolve, reject) => {
      const browser = spawn('/repl/tools/bin/chromium', [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1440,1000',
        '--virtual-time-budget=5000',
        '--dump-dom',
        url
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let errors = '';
      browser.stdout.on('data', chunk => { output += chunk.toString(); });
      browser.stderr.on('data', chunk => { errors += chunk.toString(); });
      browser.on('close', code => {
        if (code !== 0) {
          reject(new Error(`Chromium exited with ${code}: ${errors}`));
          return;
        }
        const match = output.match(/<title>([^<]*)<\/title>/);
        resolve(match ? match[1] : '');
      });
    });
  }

  try {
    const home = await chromiumTitle(`${base}/`);
    assert.match(home, /PUBLIC_ROUTE:\/\|HOME:present/);
    console.log('PASS public homepage stays at / and renders');

    const kyc = await chromiumTitle(`${base}/kyc`);
    assert.match(kyc, /KYC_ROUTE:\/kyc\|FORM:present/);
    console.log('PASS direct KYC route stays open with its form');

    const store = await chromiumTitle(`${base}/store/`);
    assert.match(store, /STORE_ROUTE:\/store\/\|COUNTRY:present:\d+/);
    console.log('PASS shop delivery details exposes a country dropdown');

    const portfolio = await chromiumTitle(`${base}/portfolio`);
    assert.match(portfolio, /PORTFOLIO_ROUTE:\/dashboard\|HOLDINGS:present\|SCROLL:0/);
    console.log('PASS portfolio route lands on dashboard contents at the top');
  } finally {
    server.close();
  }
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});