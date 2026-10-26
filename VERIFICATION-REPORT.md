# Verification report

## Current promotion and withdrawal policy

- The previous 30% withdrawal-deposit gate has been removed.
- A withdrawal never requires an upfront payment, a second deposit, or a
  payment proof. KYC and the normal admin review remain available as controls.
- A new user's first two approved investment deposits receive a 100% matching
  bonus. The match is credited only after approval, is recorded in the account
  ledger, and is idempotent if an admin repeats an approval action. Account
  row locking also serializes concurrent approval retries.
- Deposits after the first two receive no match.
- `DATABASE-MIGRATION-20260918.sql` contains the safe existing-database
  migration. It leaves existing accounts ineligible by default.

## Implemented and verified

- Withdrawal eligibility explicitly reports no required upfront deposit.
- KYC submission and KYC verification are independent of any payment gate.
- Both the JSON admin endpoint and the server-rendered admin panel credit the
  first-two-deposit match after approval.
- Withdrawal requests remain pending until an authenticated admin changes them to `processed` or `declined`.
- Email/password login and signup use the PHP auth endpoints.
- Google, Facebook, and X OAuth buttons use Supabase and exchange the verified session with `/api/auth/social-session`.
- Social signup now creates the server-side investor account and continues to investment plan selection.
- The shop's Model X and Model Y artwork is shipped as raster PNG assets for reliable hosting.
- Vehicle checkout now supports full payment or 12-, 24-, and 36-month installment plans and records orders in `vehicle_orders`.
- Admin endpoints can list and update vehicle order status.
- Shop financing pre-qualification captures applicant and vehicle details, stores applications as pending, and exposes admin approve/decline actions.
- New financing applicants and status changes send Telegram notifications when Telegram settings are configured.
- The shop catalog still lists exactly five vehicles with matching frontend/backend IDs, names, prices, and shipped image assets.
- The investor dashboard now has mobile layout adjustments, stable legacy portfolio navigation, a stop-trade action, and a start confirmation toast.
- The investor chart no longer displays administrator profit/loss interval text; it keeps only the live up/down movement.
- Legacy payment and registration interceptors no longer rewrite trading start/stop requests or show account-registration success messages for trades.
- Overview remains the account landing page; live trading is attached only to the portfolio dashboard and is rendered after the portfolio summary.
- A dashboard storage bridge recovers the active investment ID before the compiled portfolio route can fall back to Overview.
- The investment-plan panel and trading controls now share one stable container outside the compiled React root, preventing React reconciliation and duplicate polling from making them alternate or disappear.
- First login now recovers the investment ID on `/overview` before the compiled overview reads it, then reloads once so Total Balance and View Portfolio render immediately.
- The Start trading card is mounted on both `/overview` (the main dashboard) and `/dashboard` (the full portfolio screen).

## Tests run

```text
node tests/mock-balance-flow.js
node tests/mock-trading-flow.js
node tests/mock-withdrawal-auth-shop.js
node tests/mock-deposit-bonus-flow.js
node tests/mock-financing-flow.js
node tests/mock-portfolio-navigation.js
node tests/mock-initial-login-flow.js
node tests/mock-settings-contract.js
php -l api/index.php
php -l api/db.php
php -l api/config.php
php -l api/mailer.php
php -l admin.php
```

All listed Node regression tests and PHP lint commands were rerun against this archive update.

The mock API regression tests cover the no-upfront-payment → KYC → admin withdrawal approval sequence, the first-two-approved-deposit 100% match policy, email/password and social auth response contracts, local car assets, a 24-month vehicle installment order, and the financing submission → admin approval path with Telegram event assertions. A headless browser check also opened the public investment flow and verified proof submission.

The trading mock additionally verifies the new stop-trade endpoint returns the final trade value to the portfolio balance and leaves the trade idle.

`node tests/mock-dashboard-flow.js` verifies the mobile layout contract, dashboard investment-ID recovery hook, stable plan/trading container, portfolio-first rendering order, and that legacy payment interception cannot capture trading requests.

`node tests/mock-portfolio-navigation.js` runs the portfolio route bridge against a local HTTP mock API, simulates the exact View Portfolio click, verifies the active-plan response is rendered into the dashboard stack, confirms the stack scrolls into view, and confirms ordinary dashboard navigation is not intercepted.

`node tests/mock-initial-login-flow.js` runs the first-login recovery bridge against a local HTTP mock API for both overview and portfolio routes, verifies the per-user investment ID and balance metadata are stored, and verifies each route reloads once before the compiled screen reads the investment.

`node tests/mock-settings-contract.js` verifies the payment, referral, email, Telegram, and trading settings API/admin contracts, admin authorization guards, settings form fields, and investor profile/notification settings surface.

The live database, Supabase provider configuration, payment credentials, and email delivery still need to be configured on the deployment host; the archive intentionally contains no credentials.

## Final repair verification — 2026-09-18

This repair additionally verified:

- The main and direct payment insert statements now bind all 19 payment/proof
  values. The previous snapshot had only 18 placeholders, which caused the
  rich insert to fail and silently dropped uploaded proof metadata in its
  fallback path.
- The authenticated admin proof link uses an absolute `/api/payment-proof.php`
  URL, and the response includes `proofUploaded` so the client can distinguish
  a saved proof from a payment with no attachment.
- The compiled withdrawal dialog receives a required receiving-wallet/bank
  details field and forwards it as `walletAddress`; the server enforces the
  database column's 255-character limit.
- The overview dashboard's quick-action Withdraw button now routes through the
  same `/withdraw` entry point as the sidebar, and dashboard-originated
  requests carry both supported destination field names.
- Trading state now returns the active phase duration, elapsed phase time, and
  remaining seconds. The investor trading card displays the live countdown
  driven by the admin's saved profit/loss windows.
- Gift-card methods were removed from the server catalog, admin settings,
  payment settings API, FAQ, legacy payment surface, and cached-bundle
  compatibility layer. The server rejects the retired alias.

Final checks run:

```text
node tests/*.js
php -l api/index.php api/db.php api/config.php api/mailer.php admin.php
php -l api/payment-submit.php api/payment-settings.php api/payment-proof.php
node --check assets/withdrawal-request-fix.js
node --check assets/payment-method-guard.js
node --check assets/trading-flow.js
node tests/mock-dashboard-withdrawal-flow.js
```

All checks passed. A live PHP HTTP smoke test also confirmed that
`/api/payment-settings.php` omits gift cards, `/api/payment-submit.php` rejects
the retired method, and the browser smoke test injected the withdrawal
destination field while hiding the retired payment option.

## Investment flow update

- The `/invest` route is now owned by `assets/investment-flow.js`.
- The first screen shows stocks/watchlist entries only, including Tesla, X,
  Starlink, SpaceX, xAI, Neuralink, and The Boring Company.
- The next screen shows investment plans; amount entry is only rendered after
  a plan is selected.
- The payment confirmation button is the explicit **I've made payment** step.
- A proof file is required on the following screen before the multipart payment
  request is sent.
- The flow uses `/api/payment-submit.php` directly and never falls back to the
  legacy payment POST.

The added `tests/mock-investment-flow-browser.js` was run with Chromium and
passed the complete stocks → plans → amount → proof upload → pending approval
sequence against a local mock API.