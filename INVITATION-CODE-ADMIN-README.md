# Invitation-code administration

The admin dashboard now includes **Invitation access**. It manages the
database-backed invitation ledger used by new email and social signups.

## What each action does

- **Generate code** creates another active code. Existing active codes keep working.
- **Rotate active codes** revokes every active code and creates one new active code.
- **Revoke** disables one code immediately. Existing accounts are not changed.
- **Reinstate** makes a revoked code active again.

The first database connection imports the existing `TT_INVITATION_CODE` value
as an active `environment` code when the invitation table is empty. After the
ledger has been seeded, the database is the source of truth and all dashboard
changes take effect without editing `.htaccess`.

## cPanel setup

1. Upload the ZIP and extract it directly into `public_html`.
2. Set the required database and admin environment variables from
   `README-RESEND.md`.
3. Keep `TT_INVITATION_CODE` set to a temporary first-boot code, or replace the
   placeholder in `DATABASE-MIGRATION-20260928.sql` and run that migration in
   phpMyAdmin.
4. Open `/admin`, sign in, open **Invitation access**, and rotate the initial
   code before sharing invitation links.
5. Share links in the form `https://your-domain.example/CODE`.

The application API also exposes the protected admin contract:

- `GET /api/admin/invitation-codes`
- `POST /api/admin/invitation-codes` with `{ "action": "generate" }`
- `POST /api/admin/invitation-codes` with `{ "action": "rotate" }`
- `PATCH /api/admin/invitation-codes/:id` with `{ "status": "revoked" }` or `{ "status": "active" }`

These routes require the existing admin session or `x-admin-token`.