TESLA TRADE COMPLETE STANDALONE UPLOAD

This single ZIP contains the complete Tesla Trade site and shop.

Upload steps:
1. Back up the old public_html folder if needed.
2. Delete the old files inside public_html on the new cPanel.
3. Upload this ZIP into public_html.
4. Extract the ZIP directly inside public_html.
5. Confirm that public_html/index.html exists.

URLs:
- Trade platform: / (opens /overview for signed-in users, otherwise /login)
- Shop: /store/

The authenticated platform sidebar includes a Shop link that opens the current
`/store/` catalog. The old public marketing homepage is no longer the default
entry point, and the old vehicle-only embedded shop is kept only as
compatibility code.

The shop uses the existing main-site payment settings endpoint at /api/payment-settings.php.
Shop order and finance requests reuse the main site's TT_DB_* configuration and
create their quote tables automatically; details are documented in
store/CPANEL-SETUP.md.

Invitation-gated signup:
- New email and social signups require an invitation code.
- The fresh-upload default code is `INVITATIONCODE`; change it before sharing
  links by setting `TT_INVITATION_CODE` in the PHP/Apache environment.
- A link such as `/INVITATIONCODE` opens the signup page and pre-fills the code.
- Users can also enter the code directly in the signup form.
- After the first database connection, use Admin → Invitation access to
  generate, rotate, revoke, and reinstate codes without editing cPanel files.
- See `INVITATION-CODE-ADMIN-README.md` and
  `DATABASE-MIGRATION-20260928.sql` for the database setup details.
Do not upload this ZIP into an extra nested folder.
