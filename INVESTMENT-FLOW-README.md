# Investment flow update

The investor flow now has one authoritative sequence:

1. **Invest → stocks/watchlist**: Tesla, X, Starlink, SpaceX, xAI, Neuralink,
   and The Boring Company are shown without asking for an amount.
2. **Next → investment plans**: Explorer, Pioneer, Visionary, Pioneer Plus,
   and Dogecoin Reserve Fund.
3. **Select a plan → amount and payment method**: the amount field is limited
   to the selected plan's server-compatible range.
4. **I've made payment → proof upload**: a proof file is required before the
   submission can be sent.

Proof uploads accept JPG, PNG, WEBP, GIF, and PDF files up to 10MB. The final
browser request goes directly to `/api/payment-submit.php`; it does not fall
back to the older investment endpoint, so the proof cannot be silently
skipped by a legacy button.

## Verification

The new browser-level mock test uses Chromium and a local mock API:

```bash
node tests/mock-investment-flow-browser.js
```

It checks stock rendering, the absence of an amount on the stock screen,
Pioneer plan ranges, the transition from amount to proof after the payment
confirmation button, multipart proof upload, and the pending-approval success
state. The archive's existing Node regression tests and PHP lint checks should
also be run before deployment.