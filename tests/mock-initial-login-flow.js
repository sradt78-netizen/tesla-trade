#!/usr/bin/env node
/*
 * Regression test for a first login on a browser with no cached investment ID.
 *
 * The compiled overview reads ttinc_investment_id only once during its first
 * effect. The route bridge must therefore look the investment up by email,
 * persist the ID and reload before React renders the overview.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

class Storage {
  constructor(values) { this.values = Object.assign({}, values || {}); }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem(key, value) { this.values[key] = String(value); }
  removeItem(key) { delete this.values[key]; }
}

function makeContext(base, pathname) {
  const localStorage = new Storage({
    ttinc_auth: JSON.stringify({ email: 'first-login@example.com', name: 'First Login' }),
  });
  const sessionStorage = new Storage();
  const location = {
    pathname,
    href: `${base}${pathname}`,
    reloads: 0,
    reload() { this.reloads += 1; },
  };
  const history = {
    pushState() {},
    replaceState() {},
  };
  const window = {
    location,
    history,
    localStorage,
    sessionStorage,
    addEventListener() {},
    setTimeout() { return 1; },
    setInterval() { return 1; },
  };

  return {
    window,
    location,
    localStorage,
    document: {},
    fetch: (url, options) => fetch(new URL(url, base), options),
    URL,
    setTimeout: window.setTimeout,
    setInterval: window.setInterval,
    PopStateEvent: function PopStateEvent() {},
    console,
  };
}

async function run() {
  let lookups = 0;
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/investments?email=')) {
      lookups += 1;
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify([{
        id: 'mock-first-login-investment',
        status: 'active',
        planName: 'Explorer',
        total: 1250,
        totalCurrentValue: 1312.5,
      }]));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = fs.readFileSync('assets/dashboard-route-fix.js', 'utf8');

  const overview = makeContext(base, '/overview');
  vm.runInNewContext(source, overview);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(lookups, 1);
  assert.equal(
    overview.localStorage.getItem('ttinc_investment_id'),
    'mock-first-login-investment'
  );
  const overviewMeta = JSON.parse(overview.localStorage.getItem('ttinc_inv_meta'));
  assert.equal(overviewMeta.total, 1250);
  assert.equal(overviewMeta.totalCurrentValue, 1312.5);
  assert.equal(overview.location.reloads, 1, 'overview must reload after recovering the ID');

  const dashboard = makeContext(base, '/dashboard');
  vm.runInNewContext(source, dashboard);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(lookups, 2);
  assert.equal(
    dashboard.localStorage.getItem('ttinc_investment_id'),
    'mock-first-login-investment'
  );
  assert.equal(dashboard.location.reloads, 1, 'dashboard must reload after recovering the ID');

  server.close();
  console.log('PASS first-login overview recovers investment ID before balance render');
  console.log('PASS first-login portfolio route recovers investment ID before dashboard render');
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});