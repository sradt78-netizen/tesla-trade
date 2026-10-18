-- Trace Fund / Tesla Trade Inc
-- Existing-database migration for the current deposit-match policy.
--
-- Select the correct database in phpMyAdmin/cPanel before running this file.
-- It is intentionally limited to the columns introduced by this update.
-- Existing accounts remain ineligible (0); the application marks accounts
-- created after this update as eligible (1) during signup.

SELECT DATABASE() AS selected_database;

SET @schema_name = DATABASE();

SET @has_column = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'investor_accounts'
    AND column_name = 'deposit_match_eligible'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE investor_accounts ADD COLUMN deposit_match_eligible TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''investor_accounts.deposit_match_eligible already exists'' AS migration_status'
);
PREPARE migration_statement FROM @sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @has_column = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'investments'
    AND column_name = 'deposit_purpose'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE investments ADD COLUMN deposit_purpose VARCHAR(50) NOT NULL DEFAULT ''investment''',
  'SELECT ''investments.deposit_purpose already exists'' AS migration_status'
);
PREPARE migration_statement FROM @sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @has_column = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'investments'
    AND column_name = 'deposit_parent_id'
);
SET @sql = IF(
  @has_column = 0,
  'ALTER TABLE investments ADD COLUMN deposit_parent_id VARCHAR(36) DEFAULT NULL',
  'SELECT ''investments.deposit_parent_id already exists'' AS migration_status'
);
PREPARE migration_statement FROM @sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Sanity checks: these should return the new columns and should not modify
-- any investor balance or create any bonus transaction.
SELECT table_name, column_name, column_type, column_default
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND (
    (table_name = 'investor_accounts' AND column_name = 'deposit_match_eligible')
    OR (table_name = 'investments' AND column_name IN ('deposit_purpose', 'deposit_parent_id'))
  )
ORDER BY table_name, column_name;

-- Optional one-account test enablement:
-- UPDATE investor_accounts
-- SET deposit_match_eligible = 1
-- WHERE email = 'your-new-test-email@example.com';
--
-- Do not run the optional UPDATE for every existing account unless you
-- intentionally want existing customers included in the new-user promotion.