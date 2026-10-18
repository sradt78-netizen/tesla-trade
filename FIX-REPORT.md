# Trace Fund Fix Report

## Fixed

- Language selection is now manual and repeatable.
- Browser/geolocation language detection no longer races a manual switch.
- Switching back to English clears host-only and domain-scoped Google Translate cookies.
- Google Translate initialization is guarded so it cannot initialize twice on one page.
- View Portfolio resolves the user's investment before navigating to the dashboard.
- Dashboard navigation resets scroll position and disables browser scroll restoration for that entry.
- The existing portfolio route bridge and API fallback remain in place.

## Verification completed

- Language picker regression test passed.
- View Portfolio mock API regression test passed.
- JavaScript syntax checks passed for all project scripts and tests.
- PHP syntax checks passed for all PHP files.
- Headless Chromium smoke test passed against a local cPanel-style server with a mock investment API:
  - language picker present;
  - French selection persisted;
  - English selection returned to English with no `googtrans` cookie;
  - View Portfolio opened `/dashboard`;
  - portfolio card rendered;
  - no dashboard loader remained;
  - scroll position was `0`.

## Final shop and investment repair addendum

- Shop payment details now support a routed `/api/payment-settings` endpoint
  with a direct `payment-settings.php` fallback for cPanel deployments.
- Shop payment details retain individual copy buttons and now include a
  **Copy all payment details** action for the selected method.
- Shop delivery details use the native country dropdown with 196 country
  choices, including Nigeria and the United States.
- Investment payment methods retain copy controls with a clipboard API path
  and a legacy `document.execCommand` fallback.
- The investment dashboard hides the left rail/mobile left drawer and keeps
  the single right-side hamburger at `top: 6px`.

Final focused checks:

```text
PASS shop copy control and 196 delivery countries
PASS investment copy control against mocked payment settings
PASS dashboard left navigation is hidden and right menu is raised
PASS CountriesNow public API returned 242 countries including Nigeria
PASS httpbin public mock API echoed payment and delivery fields
```

## cPanel deployment

Upload the files from this archive over the existing site, then hard-refresh the browser or clear the site's old cookies once. Keep the real `.htaccess` values server-side and replace every credential that was pasted into chat before going live.