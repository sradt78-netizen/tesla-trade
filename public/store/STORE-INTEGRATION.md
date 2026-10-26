# Store addition for the uploaded project

This folder is the independent EV Explorer storefront added to the uploaded project archive.

## Upload location

Copy the contents of this folder to a `store/` directory in the document root. Open `/store/` to use the storefront.

The existing uploaded project files and its existing investment, OTP, payment, withdrawal, and admin flows are not modified by this store. The checkout reads the existing main-site payment settings endpoint (`/api/payment-settings.php`) so the same configured payment categories are offered to store customers. Store order requests remain separate from investment deposits.

## Store files

- `index.html` and `assets/` — the playable storefront UI
- `catalog.json` — replace with your approved distributor catalog
- `api/order.php` — saves adult order requests
- `api/finance-inquiry.php` — saves finance inquiries
- `api/schema.sql` — creates the MySQL tables
- `api/config.example.php` — copy to `api/config.php` and configure privately
- `CPANEL-SETUP.md` — cPanel deployment steps

The selected checkout payment method is saved with the store order. For cash
or other payment-method checkouts, the shopper is taken to a separate receipt
upload step after the order request is created. A JPG, PNG, WEBP, GIF, or PDF
under 10MB is required before the order can be marked `payment_submitted`.
The receipt is private and is available to an authenticated admin from the
Shop receipts panel. Financing inquiries do not request a receipt because no
payment is collected by that flow.

The financing section includes an estimate calculator and a finance inquiry form. It posts to `api/finance-inquiry.php`, which stores the vehicle, down payment, term, APR estimate, monthly estimate, and customer contact details in `ev_finance_inquiries`. Estimates are not lender offers or credit approvals.

The slideshow and finance page link to official Tesla reference pages. Final product names, market pricing, availability, financing terms, disclosures, and payment handling must come from the authorized distributor and approved lender.