<?php
require_once __DIR__ . '/config.php';

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

function tt_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    session_set_cookie_params([
        'lifetime' => 86400,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function get_db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (DB_NAME === '' || DB_USER === '' || DB_PASS === '') {
        throw new RuntimeException(
            'Database is not configured. Set TT_DB_HOST, TT_DB_NAME, TT_DB_USER, and TT_DB_PASS ' .
            'as active SetEnv lines in the Hestia document-root .htaccess.'
        );
    }
    if (!extension_loaded('pdo_mysql')) {
        throw new RuntimeException(
            'PDO MySQL is not enabled for this PHP version. Enable the pdo_mysql extension in Hestia.'
        );
    }
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    // Create tables on first connection
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS otps (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            email      VARCHAR(255) NOT NULL,
            code       VARCHAR(6)   NOT NULL,
            expires_at DATETIME     NOT NULL,
            used       TINYINT(1)   DEFAULT 0,
            name       VARCHAR(255) NOT NULL DEFAULT '',
            verification_token VARCHAR(64) DEFAULT NULL,
            verified_at DATETIME DEFAULT NULL,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS investor_credentials (
            email       VARCHAR(255) PRIMARY KEY,
            password_hash VARCHAR(255) NOT NULL,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS investor_accounts (
            email      VARCHAR(255) PRIMARY KEY,
            name       VARCHAR(255) NOT NULL,
            phone      VARCHAR(50) NOT NULL DEFAULT '',
            age        INT NOT NULL DEFAULT 0,
            onboarding_status VARCHAR(50) NOT NULL DEFAULT 'registered',
            deposit_match_eligible TINYINT(1) NOT NULL DEFAULT 0,
            welcome_bonus_sent TINYINT(1) NOT NULL DEFAULT 0,
            welcome_bonus_sent_at DATETIME DEFAULT NULL,
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            activated_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS investments (
            id                  VARCHAR(36)   PRIMARY KEY,
            tx_id               VARCHAR(36)   NOT NULL,
            user_id             VARCHAR(255)  NOT NULL,
            user_name           VARCHAR(255)  NOT NULL,
            user_email          VARCHAR(255)  NOT NULL,
            portfolio           VARCHAR(255)  NOT NULL,
            total               DECIMAL(15,2) NOT NULL DEFAULT 0,
            method              VARCHAR(50)   NOT NULL,
            status              VARCHAR(50)   NOT NULL DEFAULT 'pending',
            earnings            DECIMAL(15,2) DEFAULT 0,
            total_current_value DECIMAL(15,2) DEFAULT 0,
            roi_percent         DECIMAL(10,2) DEFAULT NULL,
            profit_min          DECIMAL(10,2) DEFAULT 0.5,
            loss_min            DECIMAL(10,2) DEFAULT 0.3,
            trading_status      VARCHAR(20)   NOT NULL DEFAULT 'idle',
            trading_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
            trading_current_value DECIMAL(15,2) NOT NULL DEFAULT 0,
            trading_started_at  DATETIME      DEFAULT NULL,
            trading_updated_at  DATETIME      DEFAULT NULL,
            can_withdraw        TINYINT(1)    DEFAULT 0,
            kyc_status          VARCHAR(50)   DEFAULT 'none',
            referral_code       VARCHAR(16)   DEFAULT NULL,
            first_deposit_emailed TINYINT(1)  DEFAULT 0,
            payment_confirmed   TINYINT(1)    NOT NULL DEFAULT 0,
            payment_reference   VARCHAR(255)  DEFAULT NULL,
            payment_proof_path  VARCHAR(500)  DEFAULT NULL,
            payment_proof_name  VARCHAR(255)  DEFAULT NULL,
            payment_proof_mime  VARCHAR(100)  DEFAULT NULL,
            payment_proof_size  INT UNSIGNED  DEFAULT NULL,
            payment_proof_uploaded_at DATETIME DEFAULT NULL,
            pending_approval_at DATETIME      DEFAULT NULL,
            activated_at        DATETIME      DEFAULT NULL,
             deposit_purpose     VARCHAR(50)   NOT NULL DEFAULT 'investment',
             deposit_parent_id  VARCHAR(36)   DEFAULT NULL,
            created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_email (user_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS withdrawals (
            id            VARCHAR(36)   PRIMARY KEY,
            investment_id VARCHAR(36)   NOT NULL,
            user_id       VARCHAR(36)   NOT NULL,
            user_name     VARCHAR(255)  NOT NULL,
            amount        DECIMAL(15,2) NOT NULL,
            method        VARCHAR(50)   NOT NULL,
            wallet_address VARCHAR(255) DEFAULT '',
            status        VARCHAR(50)   NOT NULL DEFAULT 'pending',
            created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS account_transactions (
            id             VARCHAR(36)   PRIMARY KEY,
            investment_id  VARCHAR(36)   NOT NULL,
            user_email     VARCHAR(255)  NOT NULL,
            type           VARCHAR(20)   NOT NULL,
            amount         DECIMAL(15,2) NOT NULL,
            method         VARCHAR(100)  NOT NULL DEFAULT '',
            status         VARCHAR(50)   NOT NULL DEFAULT 'pending',
            reference_id   VARCHAR(255)  DEFAULT NULL,
            note           VARCHAR(255)  DEFAULT NULL,
            created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_account_transactions_email (user_email),
            INDEX idx_account_transactions_reference (reference_id),
            INDEX idx_account_transactions_investment (investment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS app_settings (
            key_name   VARCHAR(100) PRIMARY KEY,
            value_data TEXT         NOT NULL,
            updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

        CREATE TABLE IF NOT EXISTS referral_codes (
            email      VARCHAR(255) PRIMARY KEY,
            code       VARCHAR(16)  NOT NULL UNIQUE,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS referral_earnings (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            referrer_email VARCHAR(255)  NOT NULL,
            referred_email VARCHAR(255)  NOT NULL,
            investment_id  VARCHAR(36)   NOT NULL,
            deposit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
            commission     DECIMAL(15,2) NOT NULL DEFAULT 0,
            note           VARCHAR(255)  DEFAULT NULL,
            created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_referrer (referrer_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS referral_bonuses (
            id               VARCHAR(36)   PRIMARY KEY,
            referred_email   VARCHAR(255)  NOT NULL,
            referrer_email   VARCHAR(255)  NOT NULL,
            investment_id    VARCHAR(36)   NOT NULL,
            bonus_amount     DECIMAL(15,2) NOT NULL DEFAULT 100,
            maturity_days    INT           NOT NULL DEFAULT 30,
            matured_at       DATETIME      NOT NULL,
            credited_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
            withdrawn        TINYINT(1)    DEFAULT 0,
            INDEX idx_referred (referred_email),
            INDEX idx_investment (investment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS kyc_submissions (
            id              VARCHAR(36)   PRIMARY KEY,
            investment_id   VARCHAR(36)   NOT NULL,
            user_email      VARCHAR(255)  NOT NULL,
            user_name       VARCHAR(255)  NOT NULL,
            full_name       VARCHAR(255)  NOT NULL DEFAULT '',
            date_of_birth   VARCHAR(20)   NOT NULL DEFAULT '',
            nationality     VARCHAR(100)  NOT NULL DEFAULT '',
            address         TEXT          NOT NULL,
            id_type         VARCHAR(50)   NOT NULL DEFAULT '',
            id_number       VARCHAR(100)  NOT NULL DEFAULT '',
            id_doc_path     VARCHAR(500)  NOT NULL DEFAULT '',
            selfie_path     VARCHAR(500)  NOT NULL DEFAULT '',
            video_path      VARCHAR(500)  NOT NULL DEFAULT '',
            status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
            admin_note      TEXT          DEFAULT NULL,
            created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_email (user_email),
            INDEX idx_investment (investment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS user_profiles (
            email      VARCHAR(255) PRIMARY KEY,
            phone      VARCHAR(50)  NOT NULL DEFAULT '',
            country    VARCHAR(100) NOT NULL DEFAULT '',
            address    TEXT         NOT NULL,
            updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS marketing_emails_log (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            email      VARCHAR(255) NOT NULL,
            email_type VARCHAR(100) NOT NULL,
            sent_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_type (email_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS onboarding_email_events (
            event_key     VARCHAR(255) PRIMARY KEY,
            email_type    VARCHAR(100) NOT NULL,
            recipient     VARCHAR(255) NOT NULL,
            investment_id VARCHAR(36) DEFAULT NULL,
            status        VARCHAR(20) NOT NULL DEFAULT 'sending',
            sent_at       DATETIME DEFAULT NULL,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_recipient (recipient),
            INDEX idx_investment (investment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id           VARCHAR(36)  PRIMARY KEY,
            user_email   VARCHAR(255) NOT NULL DEFAULT '',
            user_name    VARCHAR(255) NOT NULL DEFAULT 'Visitor',
            status       VARCHAR(20)  NOT NULL DEFAULT 'open',
            unread_admin INT          NOT NULL DEFAULT 0,
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (user_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS chat_messages (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(36)  NOT NULL,
            sender     VARCHAR(10)  NOT NULL,
            message    TEXT         NOT NULL,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_session (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS connected_wallets (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            user_email   VARCHAR(255) NOT NULL,
            wallet_name  VARCHAR(100) NOT NULL,
            connected_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user (user_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS vehicle_orders (
            id                    VARCHAR(36) PRIMARY KEY,
            customer_name         VARCHAR(255) NOT NULL,
            customer_email        VARCHAR(255) NOT NULL,
            customer_phone        VARCHAR(50) NOT NULL DEFAULT '',
            vehicle_id            VARCHAR(50) NOT NULL,
            vehicle_name          VARCHAR(100) NOT NULL,
            vehicle_color         VARCHAR(100) NOT NULL,
            vehicle_total         DECIMAL(15,2) NOT NULL,
            payment_type          VARCHAR(20) NOT NULL DEFAULT 'full',
            installment_months    INT NOT NULL DEFAULT 1,
            installment_amount    DECIMAL(15,2) NOT NULL,
            payment_method        VARCHAR(50) NOT NULL,
            status                VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
            payment_reference     VARCHAR(255) DEFAULT NULL,
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_vehicle_orders_email (customer_email),
            INDEX idx_vehicle_orders_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS financing_applications (
            id                    VARCHAR(36) PRIMARY KEY,
            customer_name         VARCHAR(255) NOT NULL,
            customer_email        VARCHAR(255) NOT NULL,
            customer_phone        VARCHAR(50) NOT NULL DEFAULT '',
            date_of_birth         DATE NOT NULL,
            street_address        VARCHAR(255) NOT NULL DEFAULT '',
            city                  VARCHAR(100) NOT NULL DEFAULT '',
            state_region          VARCHAR(100) NOT NULL DEFAULT '',
            postal_code           VARCHAR(30) NOT NULL DEFAULT '',
            country               VARCHAR(100) NOT NULL DEFAULT '',
            employment_status     VARCHAR(50) NOT NULL DEFAULT '',
            annual_income         DECIMAL(15,2) NOT NULL DEFAULT 0,
            housing_status        VARCHAR(50) NOT NULL DEFAULT '',
            monthly_housing       DECIMAL(15,2) NOT NULL DEFAULT 0,
            vehicle_id            VARCHAR(50) NOT NULL,
            vehicle_name          VARCHAR(100) NOT NULL,
            vehicle_color         VARCHAR(100) NOT NULL,
            vehicle_total         DECIMAL(15,2) NOT NULL,
            down_payment          DECIMAL(15,2) NOT NULL DEFAULT 0,
            term_months           INT NOT NULL DEFAULT 60,
            credit_consent        TINYINT(1) NOT NULL DEFAULT 0,
            status                VARCHAR(20) NOT NULL DEFAULT 'pending',
            admin_note            TEXT DEFAULT NULL,
            created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_financing_email (customer_email),
            INDEX idx_financing_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // Migrations for existing installs
    $migrations = [
        "ALTER TABLE otps ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE otps ADD COLUMN verification_token VARCHAR(64) DEFAULT NULL",
        "ALTER TABLE otps ADD COLUMN verified_at DATETIME DEFAULT NULL",
        "ALTER TABLE investor_accounts ADD COLUMN phone VARCHAR(50) NOT NULL DEFAULT ''",
        "ALTER TABLE investor_accounts ADD COLUMN age INT NOT NULL DEFAULT 0",
        "ALTER TABLE investments ADD COLUMN first_deposit_emailed TINYINT(1) DEFAULT 0",
        "ALTER TABLE withdrawals ADD COLUMN wallet_address VARCHAR(255) DEFAULT ''",
        "ALTER TABLE kyc_submissions ADD COLUMN id_doc_path VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE investments ADD COLUMN plan_id VARCHAR(50) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN plan_name VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN projected_roi DECIMAL(10,2) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_confirmed TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE investments ADD COLUMN payment_reference VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_proof_path VARCHAR(500) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_proof_name VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_proof_mime VARCHAR(100) DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_proof_size INT UNSIGNED DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_proof_uploaded_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN payment_submitted_at DATETIME DEFAULT NULL",
         "ALTER TABLE investments ADD COLUMN deposit_purpose VARCHAR(50) NOT NULL DEFAULT 'investment'",
         "ALTER TABLE investments ADD COLUMN deposit_parent_id VARCHAR(36) DEFAULT NULL",
        "ALTER TABLE investor_accounts ADD COLUMN onboarding_status VARCHAR(50) NOT NULL DEFAULT 'registered'",
        "ALTER TABLE investor_accounts ADD COLUMN deposit_match_eligible TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE investor_accounts ADD COLUMN welcome_bonus_sent TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE investor_accounts ADD COLUMN welcome_bonus_sent_at DATETIME DEFAULT NULL",
        "ALTER TABLE investor_accounts ADD COLUMN registered_at DATETIME DEFAULT NULL",
        "ALTER TABLE investor_accounts ADD COLUMN activated_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN pending_approval_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN activated_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN trading_status VARCHAR(20) NOT NULL DEFAULT 'idle'",
        "ALTER TABLE investments ADD COLUMN trading_amount DECIMAL(15,2) NOT NULL DEFAULT 0",
        "ALTER TABLE investments ADD COLUMN trading_current_value DECIMAL(15,2) NOT NULL DEFAULT 0",
        "ALTER TABLE investments ADD COLUMN trading_started_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments ADD COLUMN trading_updated_at DATETIME DEFAULT NULL",
        "ALTER TABLE investments MODIFY COLUMN user_id VARCHAR(255) NOT NULL",
        "ALTER TABLE investments MODIFY COLUMN portfolio VARCHAR(255) NOT NULL",
    ];
    foreach ($migrations as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // ADD COLUMN is idempotent for an existing installation.
            // Other migration errors must remain visible so the app cannot
            // continue against an incomplete schema.
            $mysqlCode = (int)($e->errorInfo[1] ?? 0);
            if ($mysqlCode !== 1060) {
                error_log('Tesla Trade database migration failed: ' . $sql . ' — ' . $e->getMessage());
                throw $e;
            }
        }
    }

    // Preserve the existing deployment-level invitation code when the ledger
    // is first created. If an older ledger already has rows, still add the
    // configured code when it is absent. Do not reactivate an existing
    // revoked code: an explicit admin revocation remains authoritative.
    $seedCode = strtoupper(trim((string)INVITATION_CODE));
    if ($seedCode !== '' && preg_match('/^[A-Z0-9][A-Z0-9_-]{3,63}$/', $seedCode)) {
        $seedCheck = $pdo->prepare(
            'SELECT id FROM invitation_codes WHERE code=? LIMIT 1'
        );
        $seedCheck->execute([$seedCode]);
        if (!$seedCheck->fetch()) {
            $seed = $pdo->prepare(
                "INSERT INTO invitation_codes (code, status, source) VALUES (?, 'active', 'environment')"
            );
            $seed->execute([$seedCode]);
        }
    }

    return $pdo;
}

/**
 * Convert a PDO/MySQL failure into a safe diagnostic label. Never expose the
 * driver message because it can contain deployment-specific connection data.
 */
function tt_db_failure_category(Throwable $error): string {
    $mysqlCode = 0;
    if ($error instanceof PDOException && is_array($error->errorInfo ?? null)) {
        $mysqlCode = (int)($error->errorInfo[1] ?? 0);
    }
    if ($mysqlCode === 0) {
        $mysqlCode = (int)$error->getCode();
    }

    return match ($mysqlCode) {
        1044, 1045 => 'mysql_access_denied',
        1049 => 'unknown_database',
        2002, 2003 => 'mysql_server_unreachable',
        2006 => 'mysql_server_gone_away',
        default => $mysqlCode > 0 ? 'mysql_error_' . $mysqlCode : 'mysql_connection_failed',
    };
}

function tt_normalize_invitation_code(string $code): string {
    return strtoupper(trim($code));
}

function tt_valid_invitation_code_format(string $code): bool {
    return (bool)preg_match('/^[A-Z0-9][A-Z0-9_-]{3,63}$/', tt_normalize_invitation_code($code));
}

/**
 * Returns null when the database is unavailable so callers can retain the
 * deployment-level fallback behavior on a fresh or misconfigured install.
 */
function tt_db_invitation_code_matches(string $candidate): ?bool {
    try {
        $db = get_db();
        $st = $db->prepare(
            "SELECT status FROM invitation_codes WHERE code=? LIMIT 1"
        );
        $st->execute([tt_normalize_invitation_code($candidate)]);
        $row = $st->fetch();
        return $row ? $row['status'] === 'active' : false;
    } catch (Throwable $e) {
        error_log('Tesla Trade invitation-code lookup failed: ' . $e->getMessage());
        return null;
    }
}

function tt_invitation_codes(PDO $db): array {
    return $db->query(
        'SELECT id, code, status, source, rotated_from_id, created_at, revoked_at, reinstated_at
         FROM invitation_codes
         ORDER BY CASE WHEN status="active" THEN 0 ELSE 1 END, created_at DESC, id DESC'
    )->fetchAll();
}

function tt_random_invitation_code(PDO $db): string {
    do {
        $code = 'TT-' . strtoupper(bin2hex(random_bytes(6)));
        $st = $db->prepare('SELECT 1 FROM invitation_codes WHERE code=? LIMIT 1');
        $st->execute([$code]);
    } while ($st->fetch());
    return $code;
}

function tt_create_invitation_code(PDO $db, ?string $requestedCode = null, string $source = 'admin', ?int $rotatedFromId = null): array {
    $code = tt_normalize_invitation_code((string)($requestedCode ?? ''));
    if ($code === '') {
        $code = tt_random_invitation_code($db);
    }
    if (!tt_valid_invitation_code_format($code)) {
        throw new InvalidArgumentException('Invitation code must be 4–64 characters using letters, numbers, hyphens, or underscores.');
    }

    $st = $db->prepare(
        'INSERT INTO invitation_codes (code, status, source, rotated_from_id) VALUES (?, "active", ?, ?)'
    );
    $st->execute([$code, $source, $rotatedFromId]);
    $id = (int)$db->lastInsertId();
    $row = $db->prepare(
        'SELECT id, code, status, source, rotated_from_id, created_at, revoked_at, reinstated_at
         FROM invitation_codes WHERE id=?'
    );
    $row->execute([$id]);
    return (array)$row->fetch();
}

function tt_rotate_invitation_codes(PDO $db): array {
    $db->beginTransaction();
    try {
        $active = $db->query(
            "SELECT id FROM invitation_codes WHERE status='active' ORDER BY created_at ASC, id ASC"
        )->fetchAll(PDO::FETCH_COLUMN);
        $db->exec("UPDATE invitation_codes SET status='revoked', revoked_at=NOW() WHERE status='active'");
        $newCode = tt_create_invitation_code(
            $db,
            null,
            'rotation',
            $active ? (int)$active[count($active) - 1] : null
        );
        $db->commit();
        return $newCode;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function tt_set_invitation_code_status(PDO $db, int $id, string $status): array {
    if (!in_array($status, ['active', 'revoked'], true)) {
        throw new InvalidArgumentException('Invalid invitation code status.');
    }
    $st = $db->prepare(
        'UPDATE invitation_codes
         SET status=?, revoked_at=?, reinstated_at=?
         WHERE id=?'
    );
    $st->execute([
        $status,
        $status === 'revoked' ? date('Y-m-d H:i:s') : null,
        $status === 'active' ? date('Y-m-d H:i:s') : null,
        $id,
    ]);
    if ($st->rowCount() === 0) {
        $check = $db->prepare('SELECT id FROM invitation_codes WHERE id=?');
        $check->execute([$id]);
        if (!$check->fetch()) throw new RuntimeException('Invitation code not found.');
    }
    $row = $db->prepare(
        'SELECT id, code, status, source, rotated_from_id, created_at, revoked_at, reinstated_at
         FROM invitation_codes WHERE id=?'
    );
    $row->execute([$id]);
    return (array)$row->fetch();
}

function mark_otp_verified(PDO $db, array $row, string $email): string {
    $token = bin2hex(random_bytes(32));
    $db->prepare(
        'UPDATE otps SET used=1, verification_token=?, verified_at=NOW() WHERE id=?'
    )->execute([$token, $row['id']]);
    tt_start_session();
    $_SESSION['otp_verified_email'] = $email;
    $_SESSION['otp_verified_token'] = $token;
    establish_investor_session($email);
    return $token;
}

function otp_verification_is_valid(PDO $db, string $email, string $token): bool {
    if (!$token || session_status() !== PHP_SESSION_ACTIVE) return false;
    if (($_SESSION['otp_verified_email'] ?? '') !== $email) return false;
    if (!hash_equals((string)($_SESSION['otp_verified_token'] ?? ''), $token)) return false;
    $st = $db->prepare(
        'SELECT id FROM otps
         WHERE email=? AND verification_token=? AND used=1
           AND verified_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY verified_at DESC LIMIT 1'
    );
    $st->execute([$email, $token]);
    return (bool)$st->fetch();
}

function establish_investor_session(string $email): void {
    tt_start_session();
    $_SESSION['investor_email'] = $email;
}

function clear_otp_verification(): void {
    tt_start_session();
    unset($_SESSION['otp_verified_email'], $_SESSION['otp_verified_token']);
}

function require_investor_session(string $email): void {
    if (session_status() !== PHP_SESSION_ACTIVE ||
        !hash_equals((string)($_SESSION['investor_email'] ?? ''), $email)) {
        json_out(['error' => 'Investor session required. Please sign in again.'], 401);
    }
}

function require_active_investor(string $email): void {
    require_investor_session($email);
    $db = get_db();
    $st = $db->prepare(
        "SELECT id FROM investments WHERE LOWER(user_email)=? AND status='active' LIMIT 1"
    );
    $st->execute([strtolower($email)]);
    if (!$st->fetch()) {
        json_out([
            'error' => 'Your dashboard is locked until your payment is approved and your investment is active.',
            'onboardingRequired' => true,
        ], 403);
    }
}

function uuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0,0xffff), mt_rand(0,0xffff),
        mt_rand(0,0xffff),
        mt_rand(0,0x0fff)|0x4000,
        mt_rand(0,0x3fff)|0x8000,
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff)
    );
}

/**
 * Keep deposits and withdrawals in one durable, user-visible ledger.
 * Amounts are stored as positive values; `type` determines their meaning.
 */
function record_account_transaction(
    PDO $db,
    string $investmentId,
    string $email,
    string $type,
    float $amount,
    string $method,
    string $status,
    ?string $referenceId = null,
    ?string $note = null
): void {
    $db->prepare(
        'INSERT INTO account_transactions
         (id, investment_id, user_email, type, amount, method, status, reference_id, note)
         VALUES (?,?,?,?,?,?,?,?,?)'
    )->execute([
        uuid(),
        $investmentId,
        // db.php is loaded directly by admin.php, so keep this normalization
        // self-contained instead of depending on api/index.php helpers.
        strtolower(trim($email)),
        $type,
        round($amount, 2),
        $method,
        $status,
        $referenceId,
        $note,
    ]);
}

/**
 * Make an approved deposit visible as the investor's current balance.
 *
 * Older records and the initial payment insert can legitimately have a
 * zero/stale total_current_value because the value is populated later by
 * ROI updates. Until ROI is configured, the funded principal is the current
 * value. If ROI already exists, only repair an empty current value and keep
 * the configured value otherwise.
 */
function sync_approved_investment_balance(PDO $db, string $investmentId): void {
    $db->prepare(
        'UPDATE investments
         SET earnings = CASE
               WHEN roi_percent IS NULL THEN 0
               WHEN total_current_value IS NULL OR total_current_value <= 0
                 THEN ROUND(total * (roi_percent / 100), 2)
               ELSE earnings
             END,
             total_current_value = CASE
               WHEN roi_percent IS NULL THEN total
               WHEN total_current_value IS NULL OR total_current_value <= 0
                 THEN ROUND(total * (1 + roi_percent / 100), 2)
               ELSE total_current_value
             END
         WHERE id=?'
    )->execute([$investmentId]);
}

/**
 * Return the account's canonical active investment.
 *
 * A returning investor can have several investment rows: the first row is
 * the dashboard wallet and later approved deposits are linked to it through
 * deposit_parent_id. Prefer the unlinked/oldest active row so a new deposit
 * can never replace the wallet selected by the dashboard.
 */
function find_primary_active_investment_id(PDO $db, string $email): ?string {
    $st = $db->prepare(
        "SELECT id
         FROM investments
         WHERE LOWER(user_email)=? AND status='active'
         ORDER BY
           CASE WHEN deposit_parent_id IS NULL OR deposit_parent_id='' THEN 0 ELSE 1 END,
           created_at ASC
         LIMIT 1"
    );
    $st->execute([strtolower(trim($email))]);
    $id = $st->fetchColumn();
    return $id ? (string)$id : null;
}

/**
 * Post an approved returning-investor deposit into the existing wallet.
 *
 * The deposit remains its own investment/transaction row for auditability,
 * while the canonical wallet receives the approved value. This preserves the
 * investor's old balance and makes the new approval available immediately.
 * The parent link also prevents the same deposit from being counted twice.
 */
function merge_approved_deposit_into_primary(PDO $db, string $investmentId): ?string {
    $st = $db->prepare('SELECT * FROM investments WHERE id=? LIMIT 1');
    $st->execute([$investmentId]);
    $deposit = $st->fetch();
    if (!$deposit || ($deposit['status'] ?? '') !== 'active') return null;
    if (!empty($deposit['deposit_parent_id'])) {
        return (string)$deposit['deposit_parent_id'];
    }

    $primaryId = find_primary_active_investment_id($db, (string)$deposit['user_email']);
    if (!$primaryId || $primaryId === $investmentId) return null;

    $primaryStmt = $db->prepare('SELECT * FROM investments WHERE id=? LIMIT 1');
    $primaryStmt->execute([$primaryId]);
    $primary = $primaryStmt->fetch();
    if (!$primary) return null;

    $primaryTotal = (float)($primary['total'] ?? 0);
    $primaryCurrent = (float)($primary['total_current_value'] ?? 0);
    if ($primaryCurrent <= 0) $primaryCurrent = $primaryTotal;

    $depositTotal = (float)($deposit['total'] ?? 0);
    $depositCurrent = (float)($deposit['total_current_value'] ?? 0);
    if ($depositCurrent <= 0) $depositCurrent = $depositTotal;

    $newTotal = round($primaryTotal + $depositTotal, 2);
    $newCurrent = round($primaryCurrent + $depositCurrent, 2);
    $newEarnings = round($newCurrent - $newTotal, 2);

    $db->beginTransaction();
    try {
        $db->prepare(
            'UPDATE investments
             SET total=?, total_current_value=?, earnings=?, updated_at=NOW()
             WHERE id=?'
        )->execute([$newTotal, $newCurrent, $newEarnings, $primaryId]);
        $db->prepare(
            'UPDATE investments SET deposit_parent_id=? WHERE id=? AND deposit_parent_id IS NULL'
        )->execute([$primaryId, $investmentId]);
        $db->commit();
        return $primaryId;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

/**
 * Credit a 100% match for each of a new user's first two approved deposits.
 *
 * This lives in the shared database layer because both the JSON admin API and
 * the legacy server-rendered admin panel can approve an investment.
 */
function credit_deposit_match_bonus(PDO $db, array $inv): float {
    $depositAmount = round((float)($inv['total'] ?? 0), 2);
    $email = strtolower(trim((string)($inv['user_email'] ?? '')));
    $investmentId = trim((string)($inv['id'] ?? ''));
    $txId = trim((string)($inv['tx_id'] ?? ''));
    if ($depositAmount <= 0 || !$email || !$investmentId || !$txId) return 0.00;
    if (($inv['deposit_purpose'] ?? 'investment') !== 'investment') return 0.00;

    $reference = 'deposit_match:' . $investmentId;
    $db->beginTransaction();
    try {
        // Serialize bonus approvals for this account. This makes a repeated
        // or concurrent admin approval wait for the first transaction, then
        // observe its ledger row instead of creating a duplicate bonus.
        $eligibleStmt = $db->prepare(
            'SELECT deposit_match_eligible FROM investor_accounts WHERE email=? LIMIT 1 FOR UPDATE'
        );
        $eligibleStmt->execute([$email]);
        if ((int)$eligibleStmt->fetchColumn() !== 1) {
            $db->commit();
            return 0.00;
        }

        $existing = $db->prepare(
            "SELECT id FROM account_transactions
             WHERE type='bonus' AND reference_id=? LIMIT 1"
        );
        $existing->execute([$reference]);
        if ($existing->fetch()) {
            $db->commit();
            return 0.00;
        }

        $countStmt = $db->prepare(
            "SELECT COUNT(DISTINCT t.reference_id)
             FROM account_transactions t
             INNER JOIN investments d ON d.id=t.investment_id
             WHERE LOWER(t.user_email)=?
               AND t.type='deposit'
               AND t.status='processed'
               AND COALESCE(d.deposit_purpose, 'investment')='investment'"
        );
        $countStmt->execute([$email]);
        $approvedDepositCount = (int)$countStmt->fetchColumn();
        if ($approvedDepositCount < 1 || $approvedDepositCount > 2) {
            $db->commit();
            return 0.00;
        }

        record_account_transaction(
            $db,
            $investmentId,
            $email,
            'bonus',
            $depositAmount,
            'deposit_match',
            'processed',
            $reference,
            '100% deposit match bonus — approved deposit ' . $approvedDepositCount . ' of 2'
        );
        $db->prepare(
            'UPDATE investments
             SET total_current_value = ROUND(COALESCE(NULLIF(total_current_value, 0), total) + ?, 2),
                 earnings = ROUND((COALESCE(NULLIF(total_current_value, 0), total) + ?) - total, 2)
             WHERE id=?'
        )->execute([$depositAmount, $depositAmount, $investmentId]);

        $db->commit();
        return $depositAmount;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function get_setting(string $key, $default = null) {
    try {
        $db  = get_db();
        $st  = $db->prepare('SELECT value_data FROM app_settings WHERE key_name=?');
        $st->execute([$key]);
        $row = $st->fetch();
        return $row ? json_decode($row['value_data'], true) : $default;
    } catch (Throwable $e) { return $default; }
}

function set_setting(string $key, $value): void {
    $db = get_db();
    $st = $db->prepare('INSERT INTO app_settings (key_name, value_data) VALUES (?,?)
                        ON DUPLICATE KEY UPDATE value_data=VALUES(value_data)');
    $st->execute([$key, json_encode($value)]);
}

function get_referral_settings(): array {
    $s = get_setting('referral_settings', []);
    return [
        'bonus_amount'   => isset($s['bonus_amount'])   ? (float)$s['bonus_amount']  : (float)REFERRAL_BONUS_AMOUNT,
        'maturity_days'  => isset($s['maturity_days'])  ? (int)$s['maturity_days']   : (int)REFERRAL_MATURITY_DAYS,
    ];
}

/** Get or create a referral code for a given email */
function get_or_create_referral_code(string $email): string {
    $db = get_db();
    $st = $db->prepare('SELECT code FROM referral_codes WHERE email=?');
    $st->execute([$email]);
    $row = $st->fetch();
    if ($row) return $row['code'];

    do {
        $code = strtoupper(substr(md5($email . microtime() . mt_rand()), 0, 8));
        $chk  = $db->prepare('SELECT 1 FROM referral_codes WHERE code=?');
        $chk->execute([$code]);
    } while ($chk->fetch());

    $db->prepare('INSERT INTO referral_codes (email, code) VALUES (?,?)')->execute([$email, $code]);
    return $code;
}

/**
 * Credit $100 referral bonus to the referred user and 20% commission to referrer.
 * Called when any deposit is made (initial or additional).
 */
function credit_referral_commission(string $referred_email, string $investment_id, float $deposit_amount, string $note = ''): void {
    try {
        $db = get_db();

        $st = $db->prepare('SELECT referral_code FROM investments WHERE id=?');
        $st->execute([$investment_id]);
        $inv = $st->fetch();
        if (!$inv || empty($inv['referral_code'])) return;

        $ref_code = $inv['referral_code'];

        $st2 = $db->prepare('SELECT email FROM referral_codes WHERE code=?');
        $st2->execute([$ref_code]);
        $ref_row = $st2->fetch();
        if (!$ref_row) return;

        $referrer_email = $ref_row['email'];
        if ($referrer_email === $referred_email) return; // No self-referrals

        $commission = round($deposit_amount * 0.20, 2);
        if ($commission <= 0) return;

        // Log the commission
        $db->prepare(
            'INSERT INTO referral_earnings (referrer_email, referred_email, investment_id, deposit_amount, commission, note)
             VALUES (?,?,?,?,?,?)'
        )->execute([$referrer_email, $referred_email, $investment_id, $deposit_amount, $commission, $note]);

        // Auto-credit commission into the referrer's active investment
        $stRef = $db->prepare(
            "SELECT id, total, roi_percent FROM investments WHERE user_email=? AND status='active' ORDER BY created_at ASC LIMIT 1"
        );
        $stRef->execute([$referrer_email]);
        $refInv = $stRef->fetch();
        if ($refInv) {
            $new_total = round((float)$refInv['total'] + $commission, 2);
            if ($refInv['roi_percent'] !== null) {
                $roi      = (float)$refInv['roi_percent'];
                $new_tcv  = round($new_total * (1 + $roi / 100), 2);
                $new_earn = round($new_tcv - $new_total, 2);
                $db->prepare('UPDATE investments SET total=?,total_current_value=?,earnings=? WHERE id=?')
                   ->execute([$new_total, $new_tcv, $new_earn, $refInv['id']]);
            } else {
                $db->prepare('UPDATE investments SET total=?,total_current_value=? WHERE id=?')
                   ->execute([$new_total, $new_total, $refInv['id']]);
            }
        }
    } catch (Throwable $e) { /* non-fatal */ }
}

/**
 * Credit the referral BONUS ($100) to the referred user on their FIRST deposit.
 * The bonus has a maturity period before withdrawal is allowed.
 */
function credit_referral_bonus_to_referred(string $referred_email, string $investment_id): void {
    try {
        $db = get_db();

        // Only credit once per investment
        $stCheck = $db->prepare('SELECT id FROM referral_bonuses WHERE investment_id=?');
        $stCheck->execute([$investment_id]);
        if ($stCheck->fetch()) return;

        $st = $db->prepare('SELECT referral_code FROM investments WHERE id=?');
        $st->execute([$investment_id]);
        $inv = $st->fetch();
        if (!$inv || empty($inv['referral_code'])) return;

        $ref_code = $inv['referral_code'];
        $st2 = $db->prepare('SELECT email FROM referral_codes WHERE code=?');
        $st2->execute([$ref_code]);
        $ref_row = $st2->fetch();
        if (!$ref_row) return;

        $referrer_email = $ref_row['email'];
        if ($referrer_email === $referred_email) return;

        $rs           = get_referral_settings();
        $bonus_amount = $rs['bonus_amount'];
        $maturity_days= $rs['maturity_days'];

        $bonusId    = uuid();
        $matured_at = date('Y-m-d H:i:s', strtotime("+{$maturity_days} days"));

        $db->prepare(
            'INSERT INTO referral_bonuses (id, referred_email, referrer_email, investment_id, bonus_amount, maturity_days, matured_at)
             VALUES (?,?,?,?,?,?,?)'
        )->execute([$bonusId, $referred_email, $referrer_email, $investment_id, $bonus_amount, $maturity_days, $matured_at]);

    } catch (Throwable $e) { /* non-fatal */ }
}

/** Log a marketing email so we don't spam the same person */
function log_marketing_email(string $email, string $email_type): void {
    try {
        $db = get_db();
        $db->prepare('INSERT INTO marketing_emails_log (email, email_type) VALUES (?,?)')->execute([$email, $email_type]);
    } catch (Throwable $e) {}
}

/** Check if marketing email of given type was sent to this email in the last N days */
function marketing_email_sent_recently(string $email, string $email_type, int $days = 7): bool {
    try {
        $db = get_db();
        $st = $db->prepare(
            "SELECT id FROM marketing_emails_log WHERE email=? AND email_type=? AND sent_at > DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 1"
        );
        $st->execute([$email, $email_type, $days]);
        return (bool)$st->fetch();
    } catch (Throwable $e) { return false; }
}
