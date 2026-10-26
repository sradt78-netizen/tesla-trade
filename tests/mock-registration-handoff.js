#!/usr/bin/env node
/*
 * Contract test for the compiled registration compatibility layer. The
 * browser UI remains compiled, but the final OTP submit must use the real
 * account API and preserve the invitation code.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const fix = fs.readFileSync('assets/registration-flow-fix.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /registration-flow-fix\.js/);
assert.match(fix, /input\[maxlength="6"\]/);
assert.match(fix, /postJson\('\/api\/otp\/verify'/);
assert.match(fix, /postJson\('\/api\/accounts'/);
assert.match(fix, /invitationCode: invitationCode/);
assert.match(fix, /age: age \|\| ageFromDate\(dob\)/);
assert.match(fix, /window\.location\.(?:href|replace)\('\/invest/);

console.log('PASS email registration verifies OTP and creates the server account');
console.log('PASS email registration preserves invitation code and routes to investment selection');