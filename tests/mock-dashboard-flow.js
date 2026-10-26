#!/usr/bin/env node
/*
 * Static regression checks for the dashboard bridge.
 * This complements mock-trading-flow.js by protecting the browser-side
 * routing and fetch interception contracts that caused the reported bugs.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('index.html', 'utf8');
const sharedStyles = fs.readFileSync('assets/trace-fund-experience.css', 'utf8');
const trading = fs.readFileSync('assets/trading-flow.js', 'utf8');
const routeFix = fs.readFileSync('assets/dashboard-route-fix.js', 'utf8');
const portfolio = fs.readFileSync('assets/portfolio-route-fix.js', 'utf8');
const bundle = fs.readFileSync('assets/index-DbpOAvwP.js', 'utf8');

assert.match(page, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
assert.match(page, /@media \(max-width: 767px\)/);
assert.match(page, /isLegacyInvestmentPost = investmentRoute === '\/api\/investments'/);
assert.equal(
  page.includes("urlText.indexOf('/api/investments') !== -1 && opts && opts.method === 'POST'"),
  false
);
assert.match(page, /dashboard-route-fix\.js\?v=20260919-first-login/);
assert.match(page, /portfolio-route-fix\.js\?v=20260920-language-portfolio-fix/);
assert.match(bundle, /View Portfolio/);
assert.match(bundle, /href:"\/dashboard"/);
assert.match(trading, /location\.pathname === '\/dashboard' \|\| location\.pathname === '\/overview'/);
assert.match(trading, /Start trading/);
assert.match(trading, /ttinc-dashboard-addon-stack/);
assert.match(trading, /host\.appendChild\(shell\)/);
assert.match(trading, /\/api\/investments\/' \+ encodeURIComponent\(lastInvestmentId\) \+ '\/trading\/stop'/);
assert.doesNotMatch(trading, /Profit every .*Loss every/);
assert.match(routeFix, /\/api\/investments\?email=/);
assert.match(portfolio, /ttinc-dashboard-addon-stack/);
assert.match(portfolio, /view portfolio/);
assert.doesNotMatch(portfolio, /scrollIntoView/);
assert.doesNotMatch(portfolio, /setInterval\(loadPlan, 1400\)/);
assert.match(page, /property="og:image" content="https:\/\/teslawealths\.org\/assets\/social-share-logo\.png"/);
assert.match(page, /name="twitter:card" content="summary_large_image"/);
assert.match(page, /grid-cols-3/);
assert.match(page, /Admin investors view/);
assert.doesNotMatch(page, /ttinc-add-plan|>Add plan</);
assert.match(sharedStyles, /#ttinc-portfolio-plans/);
assert.match(sharedStyles, /overflow-x:\s*auto\s*!important/);
assert.match(fs.readFileSync('assets/trace-fund-experience.js', 'utf8'), /relocateDisclosure/);

console.log('PASS mobile dashboard layout contract');
console.log('PASS trading requests bypass legacy payment interception');
console.log('PASS dashboard keeps portfolio content ahead of trading controls');
console.log('PASS dashboard investment-ID recovery contract');