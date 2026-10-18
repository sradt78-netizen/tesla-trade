#!/usr/bin/env node
/*
 * Mock API regression test for the shop financing workflow.
 * Uses only Node's standard library so it can run before PHP/MySQL credentials
 * are installed on the deployment host.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const catalog = {
  model_s: { name: 'Tesla Model S', base: 74990 },
  model_3: { name: 'Tesla Model 3', base: 40240 },
  model_x: { name: 'Tesla Model X', base: 79990 },
  model_y: { name: 'Tesla Model Y', base: 43990 },
  cybertruck: { name: 'Tesla Cybertruck', base: 60990 },
};
const colors = {
  white: { name: 'Pearl White', adj: 0 },
  black: { name: 'Solid Black', adj: 0 },
  grey: { name: 'Stealth Grey', adj: 0 },
  silver: { name: 'Quicksilver', adj: 1000 },
  blue: { name: 'Deep Blue', adj: 1500 },
  red: { name: 'Ultra Red', adj: 2000 },
};
const applications = [];
const telegramMessages = [];
let nextId = 1;

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function validApplication(body) {
  const vehicle = catalog[body.vehicleId];
  const color = colors[body.colorId];
  const dob = new Date(`${body.dateOfBirth}T00:00:00Z`);
  const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (!vehicle || !color) return 'Choose a valid vehicle and color';
  if (!body.customerName || !body.customerEmail.includes('@') || !body.customerPhone) return 'Name, email, and phone are required';
  if (!body.dateOfBirth || !Number.isFinite(age) || age < 18 || age > 100) return 'Applicants must provide a valid date of birth and be at least 18';
  if (!body.streetAddress || !body.city || !body.stateRegion || !body.postalCode || !body.country) return 'Complete residential address is required';
  if (!['employed', 'self_employed', 'retired', 'student', 'other'].includes(body.employmentStatus)) return 'Choose valid employment and housing details';
  if (!['rent', 'own', 'living_with_family', 'other'].includes(body.housingStatus)) return 'Choose valid employment and housing details';
  if (Number(body.annualIncome) < 0 || Number(body.monthlyHousing) < 0 || Number(body.downPayment) < 0) return 'Income, housing, and down payment values cannot be negative';
  if (![36, 48, 60, 72].includes(Number(body.termMonths))) return 'Choose a 36, 48, 60, or 72 month term';
  if (!body.creditConsent) return 'Consent is required before submitting a financing application';
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const admin = req.headers['x-admin-token'] === 'mock-admin';

    if (req.method === 'POST' && url.pathname === '/api/financing-applications') {
      const body = await readBody(req);
      const error = validApplication(body);
      if (error) return json(res, 400, { error });
      const total = catalog[body.vehicleId].base + colors[body.colorId].adj;
      const application = {
        id: `mock-finance-${nextId++}`,
        ...body,
        vehicleName: catalog[body.vehicleId].name,
        vehicleColor: colors[body.colorId].name,
        vehicleTotal: total,
        status: 'pending',
      };
      applications.unshift(application);
      telegramMessages.push({ event: 'new-applicant', id: application.id });
      return json(res, 200, {
        success: true,
        applicationId: application.id,
        status: application.status,
        vehicle: application.vehicleName,
        total,
        termMonths: Number(body.termMonths),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/financing-applications') {
      if (!admin) return json(res, 401, { error: 'Unauthorized' });
      return json(res, 200, applications);
    }

    const match = url.pathname.match(/^\/api\/admin\/financing-applications\/([^/]+)$/);
    if (match && req.method === 'PATCH') {
      if (!admin) return json(res, 401, { error: 'Unauthorized' });
      const application = applications.find(item => item.id === match[1]);
      if (!application) return json(res, 404, { error: 'Financing application not found' });
      const body = await readBody(req);
      if (!['approved', 'declined'].includes(body.status)) return json(res, 400, { error: 'Financing status must be approved or declined' });
      if (application.status !== 'pending') return json(res, 409, { error: 'Only pending financing applications can be reviewed' });
      application.status = body.status;
      application.adminNote = body.adminNote || '';
      telegramMessages.push({ event: 'status', id: application.id, status: application.status });
      return json(res, 200, { success: true, status: application.status, applicationId: application.id });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

function request(base, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, base);
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (token) headers['x-admin-token'] = token;
    const req = http.request(url, { method, headers }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const [id, car] of Object.entries(catalog)) {
    assert.match(html, new RegExp(`id: ['"]${id}['"]`));
    assert.match(html, new RegExp(car.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /ts-finance-form-wrap/);
  assert.match(html, /\/api\/financing-applications/);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const incomplete = await request(base, 'POST', '/api/financing-applications', {
    vehicleId: 'cybertruck', colorId: 'white', customerName: 'Test Applicant',
    customerEmail: 'test@example.com', customerPhone: '+15555550123',
  });
  assert.equal(incomplete.status, 400);

  const submitted = await request(base, 'POST', '/api/financing-applications', {
    vehicleId: 'cybertruck', colorId: 'silver', customerName: 'Test Applicant',
    customerEmail: 'test@example.com', customerPhone: '+15555550123',
    dateOfBirth: '1990-04-10', streetAddress: '1 Test Street', city: 'Austin',
    stateRegion: 'TX', postalCode: '78701', country: 'US', employmentStatus: 'employed',
    annualIncome: 120000, housingStatus: 'rent', monthlyHousing: 2200,
    downPayment: 10000, termMonths: 60, creditConsent: true,
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.vehicle, 'Tesla Cybertruck');
  assert.equal(submitted.body.total, 61990);
  assert.equal(submitted.body.status, 'pending');

  const unauthorized = await request(base, 'GET', '/api/admin/financing-applications');
  assert.equal(unauthorized.status, 401);
  const queue = await request(base, 'GET', '/api/admin/financing-applications', null, 'mock-admin');
  assert.equal(queue.status, 200);
  assert.equal(queue.body.length, 1);
  assert.equal(queue.body[0].status, 'pending');

  const approved = await request(base, 'PATCH', `/api/admin/financing-applications/${submitted.body.applicationId}`, { status: 'approved' }, 'mock-admin');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');
  const duplicateReview = await request(base, 'PATCH', `/api/admin/financing-applications/${submitted.body.applicationId}`, { status: 'declined' }, 'mock-admin');
  assert.equal(duplicateReview.status, 409);
  assert.deepEqual(telegramMessages.map(message => message.event), ['new-applicant', 'status']);

  server.close();
  console.log('Mock financing API passed: validation, catalog integrity, admin queue, approval, duplicate-review guard, and Telegram events.');
}

run().catch(error => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});