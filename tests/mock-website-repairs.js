#!/usr/bin/env node
/*
 * Focused regression coverage for the final delivery repairs:
 * - the public calculator CTA and amount layout
 * - clearly labeled first-party review presentation with no external badge
 * - invitation-code signup gate and invitation-link routing
 * - desktop chat wrapping and vehicle-shop dashboard return path
 * - chat bubble is visible in the initial viewport above fixed layers
 * - one footer language control
 * - footer route availability
 * - mobile shop overflow and sticky purchase bar coverage
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const storeSource = fs.readFileSync(path.join(root, 'store/index.html'), 'utf8');
const storeScript = fs.readFileSync(path.join(root, 'store/assets/store.js'), 'utf8');
const storeCss = fs.readFileSync(path.join(root, 'store/assets/store.css'), 'utf8');
const experienceCss = fs.readFileSync(path.join(root, 'assets/trace-fund-experience.css'), 'utf8');
const invitationGate = fs.readFileSync(path.join(root, 'assets/invitation-gate.js'), 'utf8');
const apiConfig = fs.readFileSync(path.join(root, 'api/config.php'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');

function withProbe(source, probe) {
  if (source.includes('</head>')) return source.replace('</head>', `${probe}</head>`);
  return source.replace('</body>', `${probe}</body>`);
}

function htmlProbe(titleExpression) {
  return `<script>
    (function () {
      function mark() { document.title = ${titleExpression}; }
      mark();
      setInterval(mark, 100);
    }());
  </script>`;
}

function contentType(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.php': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };
  return types[path.extname(filePath)] || 'application/octet-stream';
}

function runChromium(url, width, height) {
  return new Promise((resolve, reject) => {
    const browser = spawn('/repl/tools/bin/chromium', [
      '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      `--window-size=${width},${height}`, '--virtual-time-budget=4000',
      '--dump-dom', url
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
  assert.match(indexSource, /id="ttinc-calc-deposit"[^>]+href="\/register"/);
  assert.match(indexSource, /Trustpilot/);
  assert.match(indexSource, /12,000\+ reviews/);
  assert.doesNotMatch(indexSource, /11,749 reviews|4\.6\/5/);
  assert.match(indexSource, /id="ttinc-site-footer"/);
  assert.equal((indexSource.match(/class="trace-onsite-review-stars"/g) || []).length, 1);
  assert.equal((indexSource.match(/<i>★<\/i>/g) || []).length, 5);
  assert.match(indexSource, /\.ttinc-amount-input\s*\{/);
  assert.match(indexSource, /ttinc-register-invitation/);
  assert.match(indexSource, /invitationCode/);
  assert.match(indexSource, /ttinc-chat-topbar-left[\s\S]+min-width: 0/);
  assert.match(indexSource, /overflow-wrap: anywhere/);
  assert.match(indexSource, /#ttinc-chat-bubble\s*\{[\s\S]+z-index:\s*2147483646/);
  assert.match(indexSource, /#ttinc-chat-bubble\s*\{[\s\S]+display:\s*flex/);
  assert.match(indexSource, /assets\/invitation-gate\.js/);
  assert.match(invitationGate, /location\.replace\('\/register\?invitation=/);
  assert.match(invitationGate, /api\/auth\/social-session/);
  assert.match(apiConfig, /TT_INVITATION_CODE/);
  assert.match(apiSource, /tt_invitation_code_matches/);
  assert.match(experienceCss, /\.trace-language-control/);
  assert.match(
    fs.readFileSync(path.join(root, 'assets', 'trace-fund-experience.js'), 'utf8'),
    /window\.google && window\.google\.translate[\s\S]+traceFundGoogleTranslateInit/,
  );

  for (const file of ['contact.php', 'privacy.php', 'terms.php', 'press.php', 'faq.php', 'about.php']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
  assert.match(storeScript, /config-footer-links/);
  assert.match(storeScript, /href="\.\.\/overview">Investment dashboard/);
  assert.match(storeScript, /href="\.\.\/overview">Back to investment dashboard/);
  assert.match(storeCss, /\.dashboard-link/);
  assert.match(storeCss, /overflow-x: hidden/);
  console.log('PASS static delivery contracts');

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const requestPath = requestUrl.pathname;
    const languageMock = requestPath === '/' && requestUrl.searchParams.get('traceLanguageMock') === '1';
    if (requestPath === '/' || requestPath === '/invitationcode' || requestPath === '/register') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const probe = languageMock
        ? `<script>
          (function () {
            // Mock the Google Translate API before the site's experience
            // script runs. The constructor changes a real page node so this
            // test proves initialization, not just cookie bookkeeping.
            window.google = { translate: { TranslateElement: function () {
              document.documentElement.setAttribute('data-mock-google-translate', 'ready');
              var target = document.querySelector('.ttinc-slide-eyebrow');
              if (target) target.textContent = 'Programme de capital IA';
            } } };
            function mark() {
              var target = document.querySelector('.ttinc-slide-eyebrow');
              document.title = 'LANGUAGE_BROWSER:started=' +
                (sessionStorage.getItem('mock-language-selection-started') === 'true') +
                '|cookie=' + (document.cookie.indexOf('googtrans=') !== -1) +
                '|google=' + (document.documentElement.getAttribute('data-mock-google-translate') || 'none') +
                '|changed=' + !!(target && target.textContent === 'Programme de capital IA');
            }
            setInterval(function () {
              var select = document.querySelector('.trace-language-control select');
              if (select && !sessionStorage.getItem('mock-language-selection-started')) {
                sessionStorage.setItem('mock-language-selection-started', 'true');
                select.value = 'fr';
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
              mark();
            }, 25);
          }());
        </script>`
        : requestPath === '/'
        ? htmlProbe(`'PUBLIC_REPAIRS:footer=' + !!document.querySelector('#ttinc-site-footer') +
          '|lang=' + document.querySelectorAll('.trace-language-control').length +
          '|onsiteReviews=' + !!document.querySelector('.trace-onsite-review-cta') +
          '|tiles=' + document.querySelectorAll('.trace-onsite-review-stars i').length +
          '|footerLang=' + !!document.querySelector('#ttinc-site-footer .trace-language-control') +
          '|calc=' + (function(){var e=document.getElementById('ttinc-camount');if(!e)return false;var r=e.getBoundingClientRect();return r.left >= 0 && r.right <= window.innerWidth + 1;})() +
          '|overflow=' + (document.documentElement.scrollWidth <= window.innerWidth + 1) +
          '|chat=' + (function(){var e=document.getElementById('ttinc-chat-bubble');if(!e)return 'missing';var r=e.getBoundingClientRect(),s=getComputedStyle(e),x=Math.max(1,Math.min(window.innerWidth-1,(r.left+r.right)/2)),y=Math.max(1,Math.min(window.innerHeight-1,(r.top+r.bottom)/2));return s.display + ':' + (r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth) + ':' + (document.elementFromPoint(x,y) === e);})()`)
        : htmlProbe(`'INVITE_ROUTE:path=' + location.pathname +
          '|code=' + (localStorage.getItem('ttinc_invitation_code') || '')`);
      response.end(withProbe(indexSource, probe));
      return;
    }
    if (requestPath === '/store/' || requestPath === '/store/index.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(withProbe(storeSource,
        htmlProbe(`'STORE_REPAIRS:overflow=' +
          (document.documentElement.scrollWidth <= window.innerWidth + 1) +
          '|footer=' + !!document.querySelector('.config-footer-links') +
          '|dashboard=' + !!document.querySelector('.dashboard-link[href="../overview"]')`)));
      return;
    }
    if (requestPath.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('[]');
      return;
    }
    let relative = requestPath.replace(/^\/+/, '') || 'index.html';
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
    for (const route of ['/contact.php', '/privacy.php', '/terms.php', '/press.php', '/faq.php', '/about.php']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, `${route} should resolve`);
    }
    const home = await runChromium(`${base}/`, 390, 844);
    assert.match(home, /PUBLIC_REPAIRS:footer=true\|lang=1\|onsiteReviews=true\|tiles=5\|footerLang=true\|calc=true\|overflow=true\|chat=flex:true:true/);
    console.log('PASS public page has one footer language control, visible chat, and no mobile overflow');

    const language = await runChromium(`${base}/?traceLanguageMock=1`, 390, 844);
    assert.match(language, /LANGUAGE_BROWSER:started=true\|cookie=true\|google=ready\|changed=true/);
    console.log('PASS browser language selection reloads and initializes the mocked Google Translate widget');

    const invitation = await runChromium(`${base}/invitationcode`, 390, 844);
    assert.match(invitation, /INVITE_ROUTE:path=\/register\|code=INVITATIONCODE/);
    console.log('PASS invitation URL redirects to signup and prefills the code');

    const store = await runChromium(`${base}/store/`, 390, 844);
    assert.match(store, /STORE_REPAIRS:overflow=true\|footer=true\|dashboard=true/);
    console.log('PASS shop stays within the mobile viewport and exposes footer links');
  } finally {
    server.close();
  }
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});