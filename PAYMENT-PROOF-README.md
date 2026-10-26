# Payment proof uploads

Investors must attach a JPG, PNG, WEBP, GIF, or PDF (maximum 10MB) when they
confirm any deposit. The server rejects investor deposit submissions that do
not include a valid receipt. The proof is stored outside direct public access,
linked to the investment record, and shown to authenticated admins through the
**Investments → Proof → View proof** action.

Store shoppers who choose a payment method are sent to a receipt-upload page
after the order request is created. Their receipt is stored privately against
the shop order and appears in the authenticated admin panel under
**Shop receipts → View receipt**. Financing quote requests do not request a
payment receipt because they are not payment submissions.

The upload also sends the file to the configured Telegram chat as a document
with the investor, amount, method, and payment reference in the caption.

## Deployment notes

- The database migration runs automatically through `api/db.php` and adds the
  `payment_proof_*` columns to existing installations.
- Configure Telegram in **Admin → Settings → Telegram Settings**, or provide
  `TT_TELEGRAM_BOT_TOKEN` and `TT_TELEGRAM_CHAT_ID` in the server environment.
- Ensure PHP/cPanel accepts uploads up to 10MB (`upload_max_filesize` and
  `post_max_size`). A smaller host limit will return a clear upload error.
- Proof files are saved under `uploads/payment-proofs/`; the application
  creates an Apache deny rule there and serves files only through the
  authenticated `api/payment-proof.php` endpoint.
- Store receipts are saved under `store/uploads/payment-proofs/`; the
  storefront creates a deny rule there and serves files only through the
  authenticated `store/api/payment-proof.php` endpoint.
- The storefront database migration adds receipt columns to `ev_orders`
  automatically. Existing databases do not need to be dropped or recreated.