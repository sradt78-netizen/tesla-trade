-- Tesla Trade Inc
-- Invitation-code lifecycle migration.
--
-- Select the correct database in phpMyAdmin/cPanel before running this file.
-- The application also creates this table automatically on its first
-- connection, so this migration is provided for explicit/manual setup.

CREATE TABLE IF NOT EXISTS invitation_codes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(64) NOT NULL UNIQUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  source          VARCHAR(30) NOT NULL DEFAULT 'admin',
  rotated_from_id INT DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at      DATETIME DEFAULT NULL,
  reinstated_at   DATETIME DEFAULT NULL,
  INDEX idx_invitation_status (status),
  INDEX idx_invitation_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional: import the current deployment value as the initial active code.
-- Replace the placeholder before running, or let api/db.php seed TT_INVITATION_CODE
-- automatically on the first database connection.
-- INSERT INTO invitation_codes (code, status, source)
-- VALUES ('REPLACE_WITH_CURRENT_INVITATION_CODE', 'active', 'environment');

SELECT id, code, status, source, created_at, revoked_at, reinstated_at
FROM invitation_codes
ORDER BY created_at DESC, id DESC;