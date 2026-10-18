# Tesla Trade Inc — cPanel deployment checklist

## 1. Upload

1. Back up the current `public_html`.
2. Upload the delivery ZIP to `public_html`.
3. Extract it directly inside `public_html` so `public_html/index.html`,
   `public_html/admin.php`, and `public_html/api/` exist at the top level.
4. Confirm the host is using PHP 8.1 or newer with PDO MySQL and cURL enabled.

## 2. Required server values

Set these in cPanel's PHP environment/Application Manager or the hosting
provider's server environment. Do not paste real values into public files.

```text
TT_DB_HOST=localhost
TT_DB_NAME=your_database_name
TT_DB_USER=your_database_user
TT_DB_PASS=your_database_password
TT_ADMIN_PASSWORD=use-a-long-unique-admin-password
TT_ADMIN_TOKEN=use-a-long-random-admin-api-token
TT_INVITATION_CODE=temporary-first-boot-code
```

The existing `.htaccess` contains commented `SetEnv` placeholders if the host
does not provide another environment-variable editor.

## 3. Database

Select the target database in phpMyAdmin and run:

```text
DATABASE-MIGRATION-20260928.sql
```

The PHP application also creates its full application schema and this
migration's `invitation_codes` table automatically when it first connects.
Manual execution is useful when the cPanel database user is not allowed to
create tables.

The shop shares the main site's database credentials and creates its order
tables automatically. Its additional notes are in `store/CPANEL-SETUP.md`.

## 4. Invitation access

1. Visit `/admin` and sign in.
2. Open **Invitation access**.
3. Rotate the initial code before sending any links.
4. Share a link such as:

```text
https://your-domain.example/TT-EXAMPLE-CODE
```

Generate, revoke, and reinstate actions are recorded in the database. A
rotation revokes all active codes and creates exactly one new active code.

## 5. Payments and notifications

Set only the services the deployment uses:

```text
RESEND_API_KEY=re_your_key
TT_ADMIN_EMAIL=admin@example.com
TT_SENDER_NAME=Tesla Trade Inc
TT_SENDER_EMAIL=no-reply@example.com
TT_TELEGRAM_BOT_TOKEN=...
TT_TELEGRAM_CHAT_ID=...
TT_WALLET_USDT=...
TT_WALLET_ETH=...
TT_WALLET_BTC=...
TT_BANK_NAME=...
TT_BANK_ACCOUNT=...
TT_BANK_ROUTING=...
TT_BANK_SWIFT=...
```

Alternatively, payment instructions can be saved from the authenticated admin
panel. Never publish API keys, passwords, wallet addresses, or bank details in
the ZIP or in client-side JavaScript.

## 6. Smoke checks

- Open `/`, `/store/`, and `/admin`.
- Open `/admin`, sign in, and verify the Invitation access panel.
- Generate a code and test `https://your-domain.example/CODE`.
- Revoke that code and confirm a new signup cannot use it.
- Reinstate it only if needed.
- Submit one mock/test payment proof before accepting real payments.
- Use the admin email and Telegram test controls if those services are enabled.