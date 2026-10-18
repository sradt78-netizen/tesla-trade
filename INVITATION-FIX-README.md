# Invitation verification fix

This build addresses the invitation/signup failure observed on
`teslawealths.org`.

## Production changes

- `api/db.php`
  - Seeds `TT_INVITATION_CODE` whenever that code is absent, even if the
    invitation ledger already contains older rows.
  - Does not reactivate a code that an administrator explicitly revoked.
- `assets/invitation-gate.js`
  - Stops a stalled invitation API request after 12 seconds and shows a
    retryable error instead of leaving the gate on “Checking your invitation”.
  - Remembers an accepted code across tabs and browser restarts, revalidates it
    automatically, and lets a browser with a saved verified account continue
    without being sent back to the invitation prompt.
- `assets/registration-flow-fix.js`
  - Handles the current registration panel, which is not inside a form.
  - Preserves the invitation code and OTP verification token.
  - Completes account creation and password setup before routing to
    `/invest?onboarding=email`, preventing the old dashboard fall-through.
- `index.html`
  - Bumps the two asset query strings so browsers fetch the patched scripts.

## Deployment

Replace the matching files in the existing deployment and keep the current
server environment values, especially `TT_INVITATION_CODE` and the database
credentials. Do not replace the database or upload the runtime secrets from
the archive.

The configured invitation is added as an active code only when it is absent.
If the same code already exists with a revoked status, that revocation is
preserved.

## Mock verification

From this directory:

```sh
node tests/mock-invitation-verification-flow.js
node tests/mock-authenticated-invitation-bypass.js
node tests/mock-registration-handoff.js
node tests/mock-initial-login-flow.js
```
