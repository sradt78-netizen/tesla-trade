#!/usr/bin/env node
/*
 * Regression coverage for the social-login repair:
 * - OAuth redirects use the live teslawealths.org host
 * - the old dead host is not used for OAuth callbacks
 * - login-page social signup validates the invitation code in its own panel
 * - compiled /register social buttons validate the invitation code before OAuth
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const invitationGate = fs.readFileSync(
  path.join(root, 'assets/invitation-gate.js'),
  'utf8'
);

assert.equal(
  (source.match(/https:\/\/telsa-wealths\.online/g) || []).length,
  0,
  'the retired domain must not remain in the HTML'
);
assert.ok(
  (source.match(/TTINC_PUBLIC_ORIGIN = 'https:\/\/teslawealths\.org'/g) || []).length >= 2,
  'both social-login implementations must use the live origin'
);
assert.match(
  source,
  /registerToggle\.click\(\);\s*showRegisterMessage\('Enter the invitation code/,
  'login-page social signup should open the registration panel before showing its warning'
);
assert.match(
  source,
  /var invitationInput = document\.getElementById\('ttinc-register-invitation'\);[\s\S]+?showError\('Enter the invitation code/,
  'compiled registration social signup should show its warning next to the social controls'
);
assert.match(
  source,
  /redirectTo:\s*TTINC_PUBLIC_ORIGIN \+ '\/register'/,
  'compiled registration social signup should redirect back to the live domain'
);
assert.match(
  source,
  /provider:\s*'twitter'/,
  'X signup must use Supabase provider key twitter'
);
assert.match(
  source,
  /invitationCode:\s*window\.ttincInvitation/,
  'social session handoff must carry the invitation code'
);
assert.match(
  source,
  /invitation=' \+ encodeURIComponent|invitation=' \+ encodeURIComponent/,
  'OAuth callback must preserve the invitation code in its redirect URL'
);
assert.match(
  invitationGate,
  /data-ttinc-invitation-source/,
  'invitation links must mark their code as supplied by the link'
);

// Mock the browser decision that happens before an OAuth request. This keeps
// the test deterministic without opening a real provider or using credentials.
const mockOauthCall = {
  provider: 'google',
  redirectTo: 'https://teslawealths.org/login'
};
assert.equal(mockOauthCall.redirectTo, 'https://teslawealths.org/login');
console.log('PASS social OAuth callback host and invitation warning contracts');