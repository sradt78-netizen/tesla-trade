# Payment approval balance fix

This package keeps the existing design and payment flow while fixing the
payment approval-to-dashboard balance path.

The fix now:

- Synchronizes `total_current_value` and `earnings` when an admin approves a
  pending investment, in both the PHP admin page and API approval paths.
- Exposes `availableBalance` alongside the existing camelCase investment fields.
- Re-reads balances after SPA navigation, compares the first server response
  with the currently rendered balance, and refreshes only when it changed.
- Keeps the account transaction ledger in `processed` status after approval.

Upload the package contents over the existing site files. Do not delete or
reset the database. After uploading, approve one pending payment and confirm
the investor's dashboard shows the payment amount under Total Balance and
Available Balance, with the deposit marked processed in Transactions.

## Local regression check

The archive includes a dependency-free mock API test. From the extracted
directory, run:

```bash
node tests/mock-balance-flow.js
```

It verifies payment submission, admin approval, balance serialization,
transaction history, and the first dashboard refresh after client-side
navigation.