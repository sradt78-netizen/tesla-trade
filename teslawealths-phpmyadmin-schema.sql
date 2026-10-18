-- Teslawealths.org / Tesla Trade Inc
-- Consolidated MySQL/MariaDB schema for the investment platform and storefront.
--
-- IMPORTANT:
-- 1. Select the target database in phpMyAdmin before importing this file.
-- 2. This script creates tables only; it does not drop or delete existing data.
-- 3. The application normally uses the same database for the main site and
--    store. If store/api/config.php points to another database, run the
--    storefront section in that separate database instead.
-- 4. Do not put passwords, API keys, wallet secrets, or payment credentials
--    in this file. Those belong in the cPanel environment configuration.

SET NAMES utf8mb4;

-- ============================================================
-- Main investment platform
-- ============================================================

CREATE TABLE IF NOT EXISTS otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL DEFAULT '',
  verification_token VARCHAR(64) DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otps_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investor_credentials (
  email VARCHAR(255) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investor_accounts (
  email VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL DEFAULT '',
  age INT NOT NULL DEFAULT 0,
  onboarding_status VARCHAR(50) NOT NULL DEFAULT 'registered',
  deposit_match_eligible TINYINT(1) NOT NULL DEFAULT 0,
  welcome_bonus_sent TINYINT(1) NOT NULL DEFAULT 0,
  welcome_bonus_sent_at DATETIME DEFAULT NULL,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  activated_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investments (
  id VARCHAR(36) PRIMARY KEY,
  tx_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  portfolio VARCHAR(255) NOT NULL,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  method VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  earnings DECIMAL(15,2) DEFAULT 0,
  total_current_value DECIMAL(15,2) DEFAULT 0,
  roi_percent DECIMAL(10,2) DEFAULT NULL,
  profit_min DECIMAL(10,2) DEFAULT 0.5,
  loss_min DECIMAL(10,2) DEFAULT 0.3,
  trading_status VARCHAR(20) NOT NULL DEFAULT 'idle',
  trading_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  trading_current_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  trading_started_at DATETIME DEFAULT NULL,
  trading_updated_at DATETIME DEFAULT NULL,
  can_withdraw TINYINT(1) NOT NULL DEFAULT 0,
  kyc_status VARCHAR(50) DEFAULT 'none',
  referral_code VARCHAR(16) DEFAULT NULL,
  plan_id VARCHAR(50) DEFAULT NULL,
  plan_name VARCHAR(100) DEFAULT NULL,
  projected_roi DECIMAL(10,2) DEFAULT NULL,
  first_deposit_emailed TINYINT(1) NOT NULL DEFAULT 0,
  payment_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  payment_reference VARCHAR(255) DEFAULT NULL,
  payment_proof_path VARCHAR(500) DEFAULT NULL,
  payment_proof_name VARCHAR(255) DEFAULT NULL,
  payment_proof_mime VARCHAR(100) DEFAULT NULL,
  payment_proof_size INT UNSIGNED DEFAULT NULL,
  payment_proof_uploaded_at DATETIME DEFAULT NULL,
  payment_submitted_at DATETIME DEFAULT NULL,
  pending_approval_at DATETIME DEFAULT NULL,
  activated_at DATETIME DEFAULT NULL,
  deposit_purpose VARCHAR(50) NOT NULL DEFAULT 'investment',
  deposit_parent_id VARCHAR(36) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_investments_user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS withdrawals (
  id VARCHAR(36) PRIMARY KEY,
  investment_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  wallet_address VARCHAR(255) DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_transactions (
  id VARCHAR(36) PRIMARY KEY,
  investment_id VARCHAR(36) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  method VARCHAR(100) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  reference_id VARCHAR(255) DEFAULT NULL,
  note VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_transactions_email (user_email),
  INDEX idx_account_transactions_reference (reference_id),
  INDEX idx_account_transactions_investment (investment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  key_name VARCHAR(100) PRIMARY KEY,
  value_data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitation_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  source VARCHAR(30) NOT NULL DEFAULT 'admin',
  rotated_from_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME DEFAULT NULL,
  reinstated_at DATETIME DEFAULT NULL,
  INDEX idx_invitation_status (status),
  INDEX idx_invitation_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_codes (
  email VARCHAR(255) PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_earnings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_email VARCHAR(255) NOT NULL,
  referred_email VARCHAR(255) NOT NULL,
  investment_id VARCHAR(36) NOT NULL,
  deposit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  commission DECIMAL(15,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referral_earnings_referrer (referrer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_bonuses (
  id VARCHAR(36) PRIMARY KEY,
  referred_email VARCHAR(255) NOT NULL,
  referrer_email VARCHAR(255) NOT NULL,
  investment_id VARCHAR(36) NOT NULL,
  bonus_amount DECIMAL(15,2) NOT NULL DEFAULT 100,
  maturity_days INT NOT NULL DEFAULT 30,
  matured_at DATETIME NOT NULL,
  credited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  withdrawn TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_referral_bonuses_referred (referred_email),
  INDEX idx_referral_bonuses_investment (investment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id VARCHAR(36) PRIMARY KEY,
  investment_id VARCHAR(36) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  date_of_birth VARCHAR(20) NOT NULL DEFAULT '',
  nationality VARCHAR(100) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  id_type VARCHAR(50) NOT NULL DEFAULT '',
  id_number VARCHAR(100) NOT NULL DEFAULT '',
  id_doc_path VARCHAR(500) NOT NULL DEFAULT '',
  selfie_path VARCHAR(500) NOT NULL DEFAULT '',
  video_path VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kyc_user_email (user_email),
  INDEX idx_kyc_investment (investment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  email VARCHAR(255) PRIMARY KEY,
  phone VARCHAR(50) NOT NULL DEFAULT '',
  country VARCHAR(100) NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_emails_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  email_type VARCHAR(100) NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_marketing_email (email),
  INDEX idx_marketing_type (email_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS onboarding_email_events (
  event_key VARCHAR(255) PRIMARY KEY,
  email_type VARCHAR(100) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  investment_id VARCHAR(36) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sending',
  sent_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_onboarding_recipient (recipient),
  INDEX idx_onboarding_investment (investment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL DEFAULT '',
  user_name VARCHAR(255) NOT NULL DEFAULT 'Visitor',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  unread_admin INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chat_sessions_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  sender VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_messages_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS connected_wallets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  wallet_name VARCHAR(100) NOT NULL,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_connected_wallet_user (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_orders (
  id VARCHAR(36) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL DEFAULT '',
  vehicle_id VARCHAR(50) NOT NULL,
  vehicle_name VARCHAR(100) NOT NULL,
  vehicle_color VARCHAR(100) NOT NULL,
  vehicle_total DECIMAL(15,2) NOT NULL,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'full',
  installment_months INT NOT NULL DEFAULT 1,
  installment_amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  payment_reference VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicle_orders_email (customer_email),
  INDEX idx_vehicle_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financing_applications (
  id VARCHAR(36) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL DEFAULT '',
  date_of_birth DATE NOT NULL,
  street_address VARCHAR(255) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL DEFAULT '',
  state_region VARCHAR(100) NOT NULL DEFAULT '',
  postal_code VARCHAR(30) NOT NULL DEFAULT '',
  country VARCHAR(100) NOT NULL DEFAULT '',
  employment_status VARCHAR(50) NOT NULL DEFAULT '',
  annual_income DECIMAL(15,2) NOT NULL DEFAULT 0,
  housing_status VARCHAR(50) NOT NULL DEFAULT '',
  monthly_housing DECIMAL(15,2) NOT NULL DEFAULT 0,
  vehicle_id VARCHAR(50) NOT NULL,
  vehicle_name VARCHAR(100) NOT NULL,
  vehicle_color VARCHAR(100) NOT NULL,
  vehicle_total DECIMAL(15,2) NOT NULL,
  down_payment DECIMAL(15,2) NOT NULL DEFAULT 0,
  term_months INT NOT NULL DEFAULT 60,
  credit_consent TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_financing_applications_email (customer_email),
  INDEX idx_financing_applications_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Storefront
-- ============================================================

CREATE TABLE IF NOT EXISTS ev_orders (
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

CREATE TABLE IF NOT EXISTS ev_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  listed_price DECIMAL(12,2) NULL,
  currency VARCHAR(8) NULL,
  PRIMARY KEY (id),
  INDEX idx_ev_order_items_order (order_id),
  CONSTRAINT fk_ev_order_items_order
    FOREIGN KEY (order_id) REFERENCES ev_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ev_finance_inquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(190) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  vehicle_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  down_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
  term_months SMALLINT UNSIGNED NOT NULL,
  apr DECIMAL(6,3) NOT NULL DEFAULT 0,
  estimated_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  consented_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ev_finance_status_created (status, created_at),
  INDEX idx_ev_finance_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Optional post-import checks
-- ============================================================

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'otps',
    'investor_credentials',
    'investor_accounts',
    'investments',
    'withdrawals',
    'account_transactions',
    'app_settings',
    'invitation_codes',
    'referral_codes',
    'referral_earnings',
    'referral_bonuses',
    'kyc_submissions',
    'user_profiles',
    'marketing_emails_log',
    'onboarding_email_events',
    'chat_sessions',
    'chat_messages',
    'connected_wallets',
    'vehicle_orders',
    'financing_applications',
    'ev_orders',
    'ev_order_items',
    'ev_finance_inquiries'
  )
ORDER BY TABLE_NAME;