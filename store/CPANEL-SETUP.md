# EV Explorer cPanel setup

This build is independent of Shopify. The browser app is static and the two PHP endpoints save order requests and finance inquiries to MySQL.

## 1. Upload the built site

Upload the contents of `dist/public` to the domain or subdomain document root after running the frontend build. Keep the `api/` folder at the same level as `index.html`.

## 2. Create the tables

Create a MySQL database and user in cPanel, then run `api/schema.sql` in phpMyAdmin.

## 3. Configure the PHP connection

The shop now reuses the main site's database environment automatically. Set
`TT_DB_HOST`, `TT_DB_NAME`, `TT_DB_USER`, and `TT_DB_PASS` on the cPanel host,
the same way as the main `/api/` endpoints. If the shop must use a separate
database, copy `store/api/config.example.php` to `store/api/config.php` and
replace the placeholders with that database's details. Keep this file outside
the public document root if your host allows it. The included `.htaccess`
blocks direct access to both config files and the schema.

## 4. Update the catalog

Replace `catalog.json` with your approved distributor catalog. Each product can include:

```json
{
  "id": "local-product-id",
  "name": "Approved product name",
  "category": "Vehicles",
  "description": "Approved description",
  "price": 0,
  "currency": "USD",
  "priceLabel": "Request current quote",
  "available": true,
  "sourceUrl": "https://your-approved-reference.example/product"
}
```

Do not publish stale prices, inventory, product images, financing terms, or claims. The current file contains reference listings and must be replaced with the distributor-approved data for your market.

## 5. Real order behavior

- `api/order.php` receives the selected products and adult customer details.
- `api/finance-inquiry.php` receives calculator inputs and adult contact details.
- `api/payment-proof.php` receives the required receipt for every storefront
  payment-method checkout and serves it only to the authenticated admin.
- If the shared database is used, the two `ev_*` storefront tables are created
  automatically on the first request. Running `store/api/schema.sql` manually
  remains supported.
- Both endpoints use prepared PDO statements and never accept card, bank, or lender credentials.
- Your team can process the saved records using the existing control-panel workflow.

The calculator is an estimate and the finance form is an inquiry. Final prices, taxes, eligibility, APR, disclosures, approval, payment, and delivery remain with the licensed distributor and approved lender.