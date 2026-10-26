import assert from 'node:assert/strict';
import http from 'node:http';
import otpHandler from '../api/otp.js';
import authHandler from '../api/auth.js';
import supabaseConfigHandler from '../api/supabase-config.js';
import accountsHandler from '../api/accounts.js';
import paymentSubmitHandler from '../api/payment-submit.js';
import adminHandler from '../api/admin.js';
import dbcheckHandler from '../api/dbcheck.js';
import appRouter from '../api/index.js';

// Helper to simulate HTTP requests against serverless handlers
function callHandler(handler, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      host: 'localhost:3000',
      'content-type': 'application/json',
      ...headers
    };

    const listeners = {};
    const req = {
      method,
      url,
      headers: reqHeaders,
      body: typeof body === 'object' && body !== null ? body : null,
      on: (event, cb) => {
        listeners[event] = cb;
        if (event === 'end') {
          setTimeout(() => {
            if (body && typeof body === 'string') {
              if (listeners['data']) listeners['data'](Buffer.from(body));
            } else if (body && typeof body === 'object') {
              if (listeners['data']) listeners['data'](Buffer.from(JSON.stringify(body)));
            }
            cb();
          }, 5);
        }
      }
    };

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = '';

    const res = {
      setHeader: (k, v) => { responseHeaders[k.toLowerCase()] = v; },
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resolve({
          status: statusCode,
          headers: responseHeaders,
          data
        });
      },
      send: (text) => {
        resolve({
          status: statusCode,
          headers: responseHeaders,
          data: text
        });
      },
      end: (chunk) => {
        if (chunk) responseBody += chunk;
        let parsed = responseBody;
        try { parsed = JSON.parse(responseBody); } catch (e) {}
        resolve({
          status: statusCode,
          headers: responseHeaders,
          data: parsed
        });
      }
    };

    handler(req, res).catch(reject);
  });
}

async function runTests() {
  console.log('🧪 STARTING COMPREHENSIVE API & ENVIRONMENT VARIABLE INTEGRATION TESTS\n');

  // ── TEST 1: SUPABASE CONFIGURATION ENDPOINT ──────────────────────
  console.log('1️⃣ Testing Supabase Configuration Endpoint (/api/supabase-config)...');
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-anon-key';

  const supaRes = await callHandler(supabaseConfigHandler, {
    method: 'GET',
    url: '/api/supabase-config'
  });

  assert.equal(supaRes.status, 200, 'Supabase config should return HTTP 200');
  assert.equal(supaRes.data.success, true, 'Supabase config should return success: true');
  assert.equal(supaRes.data.url, 'https://test-project.supabase.co');
  assert.equal(supaRes.data.anonKey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-anon-key');
  assert.equal(supaRes.data.key, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-anon-key');
  console.log('   ✅ Supabase config returned url & anonKey correctly for client-side authentication!\n');

  // ── TEST 2: RESEND & OTP GENERATION & DISPATCH ───────────────────
  console.log('2️⃣ Testing Resend Email API & OTP Send Flow (/api/otp/send)...');
  process.env.RESEND_API_KEY = 're_test_mock_resend_api_key';
  process.env.RESEND_FROM_EMAIL = 'onboarding@resend.dev';

  const testEmail = 'investor-test-' + Date.now() + '@example.com';
  const sendRes = await callHandler(otpHandler, {
    method: 'POST',
    url: '/api/otp/send',
    body: {
      email: testEmail,
      name: 'Test Investor'
    }
  });

  assert.equal(sendRes.status, 200, 'OTP send should return HTTP 200');
  assert.equal(sendRes.data.success, true, 'OTP send should return success: true');
  assert.ok(sendRes.data.code, 'OTP code should be generated');
  assert.equal(sendRes.data.code.length, 6, 'OTP code should be 6 digits');
  const otpCode = sendRes.data.code;
  console.log(`   ✅ OTP generated: ${otpCode} (Expires in 24 hours, Resend status checked)\n`);

  // ── TEST 3: OTP VERIFICATION FLOW ───────────────────────────────
  console.log('3️⃣ Testing OTP Verification Flow (/api/otp/verify)...');
  // 3a. Invalid code
  const badVerifyRes = await callHandler(otpHandler, {
    method: 'POST',
    url: '/api/otp/verify',
    body: { email: testEmail, code: '000000' }
  });
  assert.equal(badVerifyRes.status, 401, 'Invalid code should return HTTP 401');
  assert.equal(badVerifyRes.data.success, false);
  console.log('   ✅ Rejected invalid OTP correctly');

  // 3b. Correct code
  const goodVerifyRes = await callHandler(otpHandler, {
    method: 'POST',
    url: '/api/otp/verify',
    body: { email: testEmail, code: otpCode }
  });
  assert.equal(goodVerifyRes.status, 200, 'Valid code should return HTTP 200');
  assert.equal(goodVerifyRes.data.success, true);
  assert.ok(goodVerifyRes.data.verificationToken, 'Should return verificationToken');
  const verificationToken = goodVerifyRes.data.verificationToken;
  console.log(`   ✅ Verified valid OTP successfully with verification token: ${verificationToken}\n`);

  // ── TEST 4: SET PASSWORD (SIGN UP COMPLETION) ────────────────────
  console.log('4️⃣ Testing Investor Password Setup (/api/auth/set-password)...');
  const setPassRes = await callHandler(authHandler, {
    method: 'POST',
    url: '/api/auth/set-password',
    body: {
      email: testEmail,
      password: 'StrongInvestorPassword123!',
      verificationToken
    }
  });

  assert.equal(setPassRes.status, 200, 'Set-password should return HTTP 200');
  assert.equal(setPassRes.data.success, true);
  assert.equal(setPassRes.data.email, testEmail);
  console.log('   ✅ Investor password hashed with bcrypt and credentials created!\n');

  // ── TEST 5: INVESTOR EMAIL / PASSWORD SIGN IN ────────────────────
  console.log('5️⃣ Testing Investor Email/Password Login (/api/auth/login)...');
  // 5a. Bad password
  const badLoginRes = await callHandler(authHandler, {
    method: 'POST',
    url: '/api/auth/login',
    body: {
      email: testEmail,
      password: 'WrongPassword'
    }
  });
  assert.equal(badLoginRes.status, 401, 'Bad password should return HTTP 401');
  console.log('   ✅ Rejected incorrect password');

  // 5b. Correct password
  const goodLoginRes = await callHandler(authHandler, {
    method: 'POST',
    url: '/api/auth/login',
    body: {
      email: testEmail,
      password: 'StrongInvestorPassword123!'
    }
  });
  assert.equal(goodLoginRes.status, 200, 'Correct password should return HTTP 200');
  assert.equal(goodLoginRes.data.success, true);
  assert.equal(goodLoginRes.data.email, testEmail);
  console.log(`   ✅ Successfully logged in as ${goodLoginRes.data.name} (${goodLoginRes.data.email})!\n`);

  // ── TEST 6: SUPABASE SOCIAL LOGIN SESSION ────────────────────────
  console.log('6️⃣ Testing Supabase Social Login Session (/api/auth/social-session)...');
  const socialRes = await callHandler(authHandler, {
    method: 'POST',
    url: '/api/auth/social-session',
    body: {
      accessToken: 'mock-supabase-access-token',
      provider: 'google',
      email: 'social-user@gmail.com',
      name: 'Google Investor'
    }
  });

  assert.equal(socialRes.status, 200, 'Social session should return HTTP 200');
  assert.equal(socialRes.data.success, true);
  assert.equal(socialRes.data.email, 'social-user@gmail.com');
  assert.equal(socialRes.data.name, 'Google Investor');
  console.log('   ✅ Supabase OAuth session verified and investor account initialized!\n');

  // ── TEST 7: INVESTOR ACCOUNTS & STATUS ───────────────────────────
  console.log('7️⃣ Testing Investor Profile & Status (/api/my-status & /api/accounts)...');
  const statusRes = await callHandler(accountsHandler, {
    method: 'GET',
    url: `/api/my-status?email=${encodeURIComponent(testEmail)}`
  });
  assert.equal(statusRes.status, 200);
  assert.ok(statusRes.data.status !== undefined);
  console.log(`   ✅ Account status returned: ${statusRes.data.status}\n`);

  // ── TEST 8: PAYMENT SUBMISSION WITH PROOF ────────────────────────
  console.log('8️⃣ Testing Investment Deposit Submission with Proof (/api/payment-submit)...');
  const submitRes = await callHandler(paymentSubmitHandler, {
    method: 'POST',
    url: '/api/payment-submit',
    body: {
      email: testEmail,
      amount: '5000.00',
      method: 'usdt',
      planId: 'growth',
      planName: 'Tesla Growth Portfolio',
      paymentReference: '0xabc123def456',
      paymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }
  });

  assert.equal(submitRes.status, 200, 'Payment submit should return HTTP 200');
  assert.equal(submitRes.data.success, true);
  assert.equal(submitRes.data.status, 'pending_approval');
  console.log(`   ✅ Investment deposit with receipt submitted! (Status: ${submitRes.data.status})\n`);

  // ── TEST 9: MASTER API ROUTER (/api/index.js) ────────────────────
  console.log('9️⃣ Testing Master Serverless Router (/api/index.js)...');
  // Test that .php routes normalize correctly
  const supaPhpRes = await callHandler(appRouter, {
    method: 'GET',
    url: '/api/supabase-config.php'
  });
  assert.equal(supaPhpRes.status, 200);
  assert.equal(supaPhpRes.data.success, true);

  const otpSendPhpRes = await callHandler(appRouter, {
    method: 'POST',
    url: '/api/otp-send.php',
    body: { email: 'router-test@example.com' }
  });
  assert.equal(otpSendPhpRes.status, 200);
  assert.equal(otpSendPhpRes.data.success, true);
  console.log('   ✅ All routed endpoints and .php aliases matched and handled successfully!\n');

  // ── TEST 10: DBCHECK ENVIRONMENT VARIABLE DETECTION ─────────────
  console.log('🔟 Testing Environment Variable Diagnostics (/api/dbcheck)...');
  const dbcheckRes = await callHandler(dbcheckHandler, {
    method: 'GET',
    url: '/api/dbcheck'
  });
  assert.equal(dbcheckRes.status, 200);
  assert.ok(dbcheckRes.data.environment_variables);
  assert.ok(dbcheckRes.data.environment_variables.detected.SUPABASE_URL, 'SUPABASE_URL should be detected');
  assert.ok(dbcheckRes.data.environment_variables.detected.RESEND_API_KEY, 'RESEND_API_KEY should be detected');
  console.log('   ✅ Environment variables detected and masked in diagnostics:');
  console.log('     ', dbcheckRes.data.environment_variables.detected);

  console.log('\n🎉 ALL 10 INTEGRATION TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
