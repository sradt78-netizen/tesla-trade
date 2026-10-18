#!/usr/bin/env node
/*
 * Mock API contract test for invitation-code lifecycle management.
 * PHP/MySQL are not required for this test; it exercises the same request
 * shapes used by the protected PHP routes and guards the admin UI contract.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminSource = fs.readFileSync(path.join(root, 'admin.php'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');
const dbSource = fs.readFileSync(path.join(root, 'api/db.php'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'DATABASE-MIGRATION-20260928.sql'), 'utf8');

assert.match(adminSource, /Invitation access/);
assert.match(adminSource, /name="invitation_action" value="generate"/);
assert.match(adminSource, /name="invitation_action" value="rotate"/);
assert.match(adminSource, /name="invitation_action" value="revoke"/);
assert.match(adminSource, /name="invitation_action" value="reinstate"/);
assert.match(apiSource, /invitation-codes/);
assert.match(dbSource, /CREATE TABLE IF NOT EXISTS invitation_codes/);
assert.match(dbSource, /tt_rotate_invitation_codes/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS invitation_codes/);

let nextId = 2;
let serial = 0;
const codes = [{ id: 1, code: 'LEGACY-TEST', status: 'active', source: 'environment' }];

function newCode() {
  serial += 1;
  return {
    id: nextId++,
    code: `TT-MOCK-${String(serial).padStart(4, '0')}`,
    status: 'active',
    source: serial > 1 ? 'rotation' : 'admin'
  };
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/admin/invitation-codes')) {
    return send(response, 404, { error: 'Not found' });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/invitation-codes') {
    return send(response, 200, { codes });
  }

  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const payload = body ? JSON.parse(body) : {};
    if (request.method === 'POST') {
      if (payload.action === 'generate') {
        const code = newCode();
        codes.push(code);
        return send(response, 200, { success: true, action: 'generate', code });
      }
      if (payload.action === 'rotate') {
        codes.forEach(code => {
          if (code.status === 'active') code.status = 'revoked';
        });
        const code = newCode();
        codes.push(code);
        return send(response, 200, { success: true, action: 'rotate', code });
      }
      return send(response, 422, { success: false, error: 'Use generate or rotate.' });
    }

    if (request.method === 'PATCH') {
      const match = url.pathname.match(/\/(\d+)$/);
      const code = codes.find(item => item.id === Number(match && match[1]));
      if (!code || !['active', 'revoked'].includes(payload.status)) {
        return send(response, 422, { success: false, error: 'Invalid code update.' });
      }
      code.status = payload.status;
      return send(response, 200, { success: true, code });
    }

    return send(response, 405, { error: 'Method not allowed' });
  });
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/invitation-codes`;
  try {
    let response = await fetch(base);
    let data = await response.json();
    assert.equal(data.codes.filter(code => code.status === 'active').length, 1);

    response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' })
    });
    data = await response.json();
    assert.equal(data.success, true);
    assert.equal(data.action, 'generate');
    assert.equal(data.code.status, 'active');

    response = await fetch(`${base}/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'revoked' })
    });
    data = await response.json();
    assert.equal(data.code.status, 'revoked');

    response = await fetch(`${base}/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' })
    });
    data = await response.json();
    assert.equal(data.code.status, 'active');

    response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate' })
    });
    data = await response.json();
    assert.equal(data.success, true);
    assert.equal(data.action, 'rotate');

    response = await fetch(base);
    data = await response.json();
    assert.equal(data.codes.filter(code => code.status === 'active').length, 1);
    assert.equal(data.codes.find(code => code.code === data.codes.at(-1).code).status, 'active');
    assert.ok(data.codes.filter(code => code.status === 'revoked').length >= 2);
    console.log('PASS invitation generate/revoke/reinstate/rotate mock API contract');
  } finally {
    server.close();
  }
}

run().catch(error => {
  console.error('FAIL', error.stack || error);
  process.exitCode = 1;
});