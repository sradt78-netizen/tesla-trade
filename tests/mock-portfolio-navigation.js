#!/usr/bin/env node
/*
 * Mock-API regression test for the View Portfolio entry point.
 *
 * It executes the browser route bridge in a small DOM harness, serves the
 * investment lookup from a local mock API, and verifies that the first
 * portfolio surface is brought into view without touching settings routes.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const path = require('node:path');

class Storage {
  constructor(values) { this.values = Object.assign({}, values || {}); }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
  setItem(key, value) { this.values[key] = String(value); }
  removeItem(key) { delete this.values[key]; }
}

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.innerHTML = '';
    this.textContent = '';
    this.offsetTop = 640;
    this.scrollCalls = [];
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  querySelector(selector) {
    const ids = Array.from(selector.matchAll(/#([A-Za-z0-9_-]+)/g)).map(match => match[1]);
    if (!ids.length) return null;
    return this.find(node => ids.includes(node.id));
  }
  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }
  scrollIntoView(options) { this.scrollCalls.push(options); }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    }
  }
}

async function run() {
  const apiRequests = [];
  const server = http.createServer((request, response) => {
    apiRequests.push(request.url);
    if (request.url.startsWith('/api/investments?email=')) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify([{
        id: 'mock-investment-portfolio',
        status: 'active',
        planName: 'Explorer',
        total: 1000,
        totalCurrentValue: 1050,
        roiPercent: 5,
        planCycle: '30 days',
      }]));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = new Element('body');
  const documentListeners = {};
  const intervalCallbacks = [];
  const location = {
    pathname: '/settings',
    href: `${base}/settings`,
    replace(next) {
      this.pathname = new URL(next, this.href).pathname;
      this.href = new URL(next, this.href).href;
      this.replaced = next;
    },
  };
  const document = {
    body,
    addEventListener(name, callback) {
      (documentListeners[name] ||= []).push(callback);
    },
    createElement(tagName) {
      const element = new Element(tagName);
      Object.defineProperty(element, 'id', {
        get() { return this.attributes.id || ''; },
        set(value) { this.attributes.id = String(value); },
      });
      return element;
    },
    getElementById(id) {
      if (body.id === id) return body;
      return body.find(element => element.id === id);
    },
  };
  const window = {
    location,
    sessionStorage: new Storage(),
    // Simulate the real failure: a previous session left an ID that no
    // longer matches the active investment returned by the API.
    localStorage: new Storage({
      ttinc_auth: JSON.stringify({ email: 'investor@example.com' }),
      ttinc_investment_id: 'stale-investment-id',
    }),
    addEventListener() {},
    setTimeout(callback) { callback(); return 1; },
    setInterval(callback) { intervalCallbacks.push(callback); return intervalCallbacks.length; },
    scrollTo() {},
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'portfolio-route-fix.js'), 'utf8');
  assert.match(source, /ttinc_portfolio_entry_pending/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.match(source, /view portfolio/);

  vm.runInNewContext(source, {
    window,
    location,
    document,
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
    fetch: (url, options) => fetch(new URL(url, base), options),
    URL,
    setTimeout: window.setTimeout,
    setInterval: window.setInterval,
    PopStateEvent: function PopStateEvent() {},
    console,
  });

  const link = {
    textContent: 'View Portfolio',
    getAttribute(name) { return name === 'href' ? '/dashboard' : null; },
  };
  const click = {
    target: { closest() { return link; } },
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  documentListeners.click[0](click);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(click.prevented, true);
  assert.equal(location.replaced, '/dashboard');
  assert.equal(window.sessionStorage.getItem('ttinc_portfolio_entry_pending'), '1');
  assert.equal(
    window.localStorage.getItem('ttinc_investment_id'),
    'mock-investment-portfolio',
    'View Portfolio should replace a stale cached investment ID before navigation'
  );

  // The real page's polling loop notices the route transition.
  intervalCallbacks.find(Boolean)();
  await new Promise(resolve => setTimeout(resolve, 50));

  const stack = document.getElementById('ttinc-dashboard-addon-stack');
  assert.ok(stack, 'portfolio add-on stack should be created on dashboard');
  assert.ok(document.getElementById('ttinc-portfolio-focus'), 'mock investment should render a portfolio focus card');

  // The trading module mounts in the same stable stack, but View Portfolio
  // must stay at the top of the compiled portfolio screen rather than
  // jumping down to this add-on stack.
  const trading = document.createElement('section');
  trading.id = 'ttinc-trading-flow';
  stack.appendChild(trading);
  intervalCallbacks.find(Boolean)();
  assert.equal(stack.scrollCalls.length, 0);
  assert.equal(window.sessionStorage.getItem('ttinc_portfolio_entry_pending'), null);
  assert.deepEqual(apiRequests, [
    '/api/investments?email=investor%40example.com',
    '/api/investments?email=investor%40example.com',
  ]);

  const ordinaryDashboardLink = {
    textContent: 'Dashboard',
    getAttribute(name) { return name === 'href' ? '/dashboard' : null; },
  };
  const ordinaryDashboardClick = {
    target: { closest() { return ordinaryDashboardLink; } },
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  documentListeners.click[0](ordinaryDashboardClick);
  assert.equal(ordinaryDashboardClick.prevented, false, 'ordinary dashboard navigation must remain unchanged');
  assert.equal(window.sessionStorage.getItem('ttinc_portfolio_entry_pending'), null);

  server.close();
  console.log('Mock portfolio API passed: View Portfolio routing, active-plan lookup, stable stack, and top-of-page navigation.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});