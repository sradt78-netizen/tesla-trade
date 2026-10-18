# Trading flow

The investor dashboard now includes a **Start trading** card. An active
investor can choose 10%, 50%, 100%, or a custom dollar amount of the current
available balance. A zero balance is blocked and sends the investor to top up
their account instead.

## Admin controls

Open **Admin → Settings → Trading Timing & Movement** to configure:

- Profit phase interval in seconds
- Loss phase interval in seconds
- Profit movement per phase
- Loss movement per phase

The settings are stored in `app_settings` under `trading_settings`. Existing
databases receive the five `investments` trading columns automatically through
the existing migration path.

## Investor experience

- `POST /api/investments/:id/trading/start` with `{ "amount": 50 }`
- `POST /api/investments/:id/trading/stop`
- `GET /api/investments/:id/trading-state`

The investor dashboard is responsive on small screens, keeps the portfolio
screen stable when opened from legacy `/portfolio` links, and shows the
portfolio summary before the live trading controls. The same Start trading
card is also available on the main `/overview` dashboard. The graph shows
live up/down movement without exposing the administrator's interval settings.
Starting a trade displays a confirmation toast; stopping a trade returns its
final value and P/L to the portfolio balance.

## Admin API contract

- `GET /api/admin/trading-settings`
- `POST /api/admin/trading-settings`

Investor routes use the existing investor session checks. Admin settings use
the existing admin session or `x-admin-token` check.

## Mock API regression test

The dependency-free test covers:

- Initial available-balance state
- Admin timing settings
- Trade allocation and active state
- Profit and loss phases
- Green/up and red/down chart history
- Stop trade and final value returned to the portfolio balance
- Oversized allocation rejection
- Zero-balance top-up response

Run both regression tests from this directory:

```bash
node tests/mock-balance-flow.js
node tests/mock-trading-flow.js
```