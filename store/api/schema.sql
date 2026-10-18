-- Tesla Trade storefront database
-- Run this file once in the store database before enabling checkout.
-- The storefront keeps the selected payment method in ev_orders.customer_note;
-- it does not create or approve investment deposits.

CREATE TABLE ev_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  delivery_location VARCHAR(180) NOT NULL,
  customer_note TEXT NULL,
  payment_method VARCHAR(100) NULL,
  payment_upload_token CHAR(64) NULL,
  payment_proof_path VARCHAR(500) NULL,
  payment_proof_name VARCHAR(255) NULL,
  payment_proof_mime VARCHAR(120) NULL,
  payment_proof_size INT UNSIGNED NULL,
  payment_proof_uploaded_at DATETIME NULL,
  payment_reference VARCHAR(190) NULL,
  consented_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ev_orders_status_created (status, created_at),
  INDEX idx_ev_orders_email (customer_email),
  INDEX idx_ev_orders_payment_token (payment_upload_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ev_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  listed_price DECIMAL(12, 2) NULL,
  currency VARCHAR(8) NULL,
  PRIMARY KEY (id),
  INDEX idx_ev_order_items_order (order_id),
  CONSTRAINT fk_ev_order_items_order FOREIGN KEY (order_id) REFERENCES ev_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ev_finance_inquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  vehicle_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  down_payment DECIMAL(12, 2) NOT NULL DEFAULT 0,
  term_months SMALLINT UNSIGNED NOT NULL,
  apr DECIMAL(6, 3) NOT NULL DEFAULT 0,
  estimated_monthly DECIMAL(12, 2) NOT NULL DEFAULT 0,
  consented_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ev_finance_status_created (status, created_at),
  INDEX idx_ev_finance_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;