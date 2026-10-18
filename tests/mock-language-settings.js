#!/usr/bin/env node
'use strict';

/*
 * Regression test for the language picker:
 * - a manual French selection writes the Google locale cookie;
 * - a manual return to English clears all translation state;
 * - no geo-language request can race the English selection.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.classList = {
      values: new Set(),
      contains: name => this.classList.values.has(name),
      add: (...names) => names.forEach(name => this.classList.values.add(name)),
      remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : force;
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
    this.listeners = {};
    this.options = [];
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) {
    if (selector === 'select') return this.select || null;
    if (selector === '.trace-language-control') {
      return this.children.find(child => child.className === 'trace-language-control') || null;
    }
    return null;
  }
  set innerHTML(value) {
    this._innerHTML = value;
    if (this.tagName === 'LABEL') {
      this.select = new Element('select');
    }
  }
  get innerHTML() { return this._innerHTML || ''; }
}

function run(cookieValue, manualValue) {
  const body = new Element('body');
  const head = new Element('head');
  const disclosure = new Element('div');
  disclosure.className = 'trace-disclosure';
  const html = new Element('html');
  html.dataset = {};
  const select = null;
  let cookie = cookieValue;
  let reloads = 0;

  const document = {
    readyState: 'complete',
    body,
    head,
    documentElement: html,
    querySelector(selector) {
      if (selector === '.trace-disclosure') return disclosure;
      if (selector === 'footer') return null;
      if (selector.indexOf('script[') === 0) return null;
      return null;
    },
    createElement(tagName) {
      return new Element(tagName);
    },
    getElementById() { return null; },
    get cookie() { return cookie; },
    set cookie(value) {
      if (value.indexOf('googtrans=;') === 0) {
        cookie = '';
      } else if (value.indexOf('googtrans=') === 0) {
        cookie = value.split(';')[0];
      }
    },
  };

  const storage = {
    values: manualValue ? { traceFundManualLocale: manualValue } : {},
    getItem(key) { return this.values[key] || null; },
    setItem(key, value) { this.values[key] = String(value); },
    removeItem(key) { delete this.values[key]; },
  };
  const window = {
    location: { pathname: '/', hostname: 'example.com', reload() { reloads += 1; } },
    history: { pushState() {}, replaceState() {} },
    sessionStorage: storage,
    addEventListener() {},
  };

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'trace-fund-experience.js'),
    'utf8',
  );
  vm.runInNewContext(source, {
    window,
    document,
    navigator: { language: 'en-US', languages: ['en-US'] },
    sessionStorage: storage,
    localStorage: storage,
    console,
  });

  const control = disclosure.children.find(child => child.className === 'trace-language-control');
  assert.ok(control, 'language picker should be present');
  return {
    select: control.select,
    cookie: () => cookie,
    reloads: () => reloads,
    html,
  };
}

const french = run('', '');
french.select.value = 'fr';
french.select.listeners.change();
assert.equal(french.cookie(), 'googtrans=%2Fen%2Ffr');
assert.equal(french.reloads(), 1);

const english = run('googtrans=/en/fr', 'true');
english.select.value = 'en';
english.select.listeners.change();
assert.equal(english.cookie(), '');
assert.equal(english.reloads(), 1);
assert.equal(english.html.lang, 'en');
assert.equal(fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'trace-fund-experience.js'),
  'utf8',
).includes('ipapi.co'), false, 'geo detection must not race manual language selection');

console.log('Mock language settings passed: locale changes are manual, repeatable, and English clears stale translation state.');