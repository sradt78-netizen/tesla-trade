# Resend email setup

This project sends all transactional and marketing email through the Resend API.
The four onboarding notifications always use the verified sender
`no-reply@teslawealths.org`, regardless of editable admin-panel email settings:

- OTP verification and OTP resend
- Welcome email immediately after registration
- Pending-payment email after a payment confirmation is submitted
- Admin pending-payment alert
- Activation email after admin approval
- Registration, deposit, withdrawal, KYC, and support emails
- Admin test emails
- Marketing campaigns from the admin panel

## Server setup

1. Configure the required cPanel/PHP environment variables before opening the
   site. You can use the commented `SetEnv` template in `.htaccess`, cPanel's
   **MultiPHP INI Editor**, **Application Manager**, or the hosting provider's
   equivalent server-environment setting. The ZIP includes variable names and
   placeholders only; replace them privately and never publish real values:

   ```text
   TT_DB_HOST=localhost
   TT_DB_NAME=your_database_name
   TT_DB_USER=your_database_user
   TT_DB_PASS=your_database_password
   TT_ADMIN_PASSWORD=choose-a-long-unique-password
   TT_ADMIN_TOKEN=generate-a-long-random-admin-token
   ```

   Optional fallbacks can also be configured as environment variables:

   ```text
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

   Do not put real passwords, tokens, database credentials, bank details, or
   wallet addresses in `api/config.php`, `.htaccess`, JavaScript, HTML, or a
   committed text file. Payment settings can instead be saved from the
   authenticated admin panel.

2. Verify `no-reply@teslawealths.org` (or the `teslawealths.org` domain) in Resend.
3. Configure the server environment variable:

   `RESEND_API_KEY=re_...`

   The PHP application reads this value at runtime. Do not put the API key in
   `api/config.php`, `.htaccess`, JavaScript, HTML, or a committed text file.
4. Upload this folder to the PHP host and make sure PHP cURL is enabled.
5. Open the admin panel, go to Settings, and confirm:
   - Sender name: `Tesla Trade Inc`
    - Resend sender email: `no-reply@teslawealths.org`
   - Admin notification email: `admin@teslawealths.org`
6. Use **Send Test Email** before sending a campaign.

The `.htaccess` file contains a commented `SetEnv` template for
`RESEND_API_KEY`. Uncomment it and replace the placeholder privately, or set
the same variable through cPanel. Payment submission itself does not depend on
Resend; the confirmation is saved first, while email notification is
best-effort.

If the sender address is not verified in Resend, Resend will reject the request.
Onboarding emails are recorded by event key so a successful welcome,
pending-payment, admin-alert, or activation message is sent only once. Failed
delivery can be retried without duplicating a successful notification.
OTP requests now fail safely when delivery fails and do not invalidate the
previous code until a new email is accepted by Resend. The OTP is never
returned in the API response.

## Credential rotation

The previous project snapshot contained credentials in `api/config.php`. Rotate
the database password, admin password/token, Telegram bot token, and any other
operational values that were used by that snapshot before using this export.

## Marketing audience

The custom broadcast campaign targets every distinct investor email in the
`investments` table, regardless of investment status. Existing throttle logs
still prevent accidental repeat sends unless **Force Send** is selected.