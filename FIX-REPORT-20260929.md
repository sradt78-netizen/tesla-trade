# Teslawealths.org repair report

This delivery addresses the reported public-site and cPanel issues.

## Fixed in the code

- Social login and social signup now return to `https://teslawealths.org`
  instead of the retired callback host.
- Social signup checks the invitation code before opening Google, Facebook,
  or X OAuth.
- Missing invitation-code warnings are rendered in the visible registration
  panel beside the signup controls.
- The withdrawal activity notification is forced into a viewport-fixed layer
  above the market-cap section and other page content on desktop and mobile.
- cPanel/Apache environment variables are also read through the
  `REDIRECT_` variants that can appear after an internal rewrite.
- Active Hestia/Apache `SetEnv` lines in the document-root `.htaccess` are
  read directly as a fallback when PHP-FPM does not inherit them.
- The old dead-domain canonical and social-preview URLs were changed to
  `https://teslawealths.org`.
- The plaintext `.admin-password` file is not included in this delivery.
  Configure the admin password through `TT_ADMIN_PASSWORD` instead.

## Required cPanel checks

### 1. Supabase OAuth

In Supabase Authentication settings:

1. Set the Site URL to `https://teslawealths.org`.
2. Add these Redirect URLs:
   - `https://teslawealths.org/login`
   - `https://teslawealths.org/register`
3. Enable each provider you want to show: Google, Facebook, and/or X.
4. Confirm the provider's own console also allows the Supabase callback URL
   shown in its Supabase provider settings.

The app's public Supabase values are still supplied by:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

### 2. Database-backed admin panel

Set these in cPanel's PHP environment/Application Manager. On hosts running
Nginx or PHP-FPM, do not rely only on `.htaccess` `SetEnv` lines.

```text
TT_DB_HOST=localhost
TT_DB_NAME=the_cpanel_prefixed_database_name
TT_DB_USER=the_cpanel_prefixed_database_user
TT_DB_PASS=the_database_password
TT_ADMIN_PASSWORD=the_admin_password
TT_ADMIN_TOKEN=a_long_random_admin_api_token
```

The database user must be assigned to the selected database with permission
to create or alter tables, or the schema/migrations must be imported by an
account that has that permission. Also confirm PHP 8.1+ and the PDO MySQL
extension are enabled.

After changing PHP environment values, restart/reload the cPanel
Application Manager application or PHP-FPM process. Then sign in to `/admin`
and open **Invitation access**. Generate or rotate an invitation code there.

For Hestia, the same values can be placed as active `SetEnv` directives in
the document-root `.htaccess`. Replace the placeholders in the existing
commented section; do not leave the placeholder lines active.

## Mock verification completed

The included Node mock/browser suite passed all existing tests plus the new
social-login regression test. It covers:

- desktop-width withdrawal notification positioning and z-index;
- mobile layout and route smoke tests;
- invitation URL, invitation administration, and social signup contracts;
- mocked payment, investment, withdrawal, KYC, trading, and shop flows;
- public API mock responses and compiled JavaScript syntax.

The live public site was also checked without using an authenticated account:
the current page and Supabase public configuration load, `/admin` resolves,
and the current live HTML still contains the retired OAuth callback host. The
new archive must be uploaded before the live social-login repair can take
effect.