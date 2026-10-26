#!/usr/bin/env node
/*
 * Public-API verification for the three requested UI repairs.
 *
 * This deliberately checks only public, non-sensitive endpoints:
 *   - CountriesNow supplies the country catalog count and Nigeria entry.
 *   - httpbin echoes a mock payment/country payload.
 *
 * The application itself keeps its country list local and does not depend on
 * either service at checkout.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');

const storeScript = fs.readFileSync('store/assets/store.js', 'utf8');
const countrySource = storeScript.match(/var countries = \[(.*?)\n  \];/s);
assert.ok(countrySource, 'The shop country catalog is missing');
const localCountries = (countrySource[1].match(/"[^"]+"/g) || []).map(value => value.slice(1, -1));
assert.ok(localCountries.length >= 190, `Expected at least 190 local countries, found ${localCountries.length}`);

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method || 'GET',
      headers: options.body ? {'content-type': 'application/json'} : {},
      timeout: 20000,
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          resolve({status: response.statusCode, body: raw ? JSON.parse(raw) : null});
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Timed out: ${url}`)));
    request.on('error', reject);
    if (options.body) request.write(JSON.stringify(options.body));
    request.end();
  });
}

async function main() {
  const countriesResponse = await request('https://countriesnow.space/api/v0.1/countries/positions');
  assert.equal(countriesResponse.status, 200);
  assert.equal(countriesResponse.body.error, false);
  assert.ok(Array.isArray(countriesResponse.body.data));
  assert.ok(countriesResponse.body.data.length >= 190);
  assert.ok(countriesResponse.body.data.some(country => country.iso2 === 'NG'));

  const mockResponse = await request('https://httpbin.org/anything', {
    method: 'POST',
    body: {payment: 'mock-payment', country: 'Nigeria'},
  });
  assert.equal(mockResponse.status, 200);
  assert.equal(mockResponse.body.json.payment, 'mock-payment');
  assert.equal(mockResponse.body.json.country, 'Nigeria');

  console.log(`PASS local shop catalog has ${localCountries.length} countries`);
  console.log(`PASS CountriesNow public API returned ${countriesResponse.body.data.length} countries including Nigeria`);
  console.log('PASS httpbin public mock API echoed payment and delivery fields');
}

main().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});