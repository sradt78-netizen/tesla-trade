<?php
declare(strict_types=1);

/**
 * Open the storefront database using either the storefront-specific config
 * or the shared cPanel environment configuration used by the main site.
 */
function storefront_add_column(PDO $pdo, string $table, string $column, string $definition): void
{
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $check->execute([$table, $column]);
    if ((int)$check->fetchColumn() === 0) {
        $pdo->exec(
            'ALTER TABLE `' . str_replace('`', '``', $table) . '` ADD COLUMN `' .
            str_replace('`', '``', $column) . '` ' . $definition
        );
    }
}

function storefront_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = null;
    $localConfigPath = __DIR__ . '/config.php';
    if (is_file($localConfigPath)) {
        $loaded = require $localConfigPath;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    if ($config === null) {
        $sharedConfigPath = __DIR__ . '/../../api/config.php';
        if (is_file($sharedConfigPath)) {
            require_once $sharedConfigPath;
        }

        $host = defined('DB_HOST') ? (string)DB_HOST : (string)(getenv('TT_DB_HOST') ?: 'localhost');
        $name = defined('DB_NAME') ? (string)DB_NAME : (string)(getenv('TT_DB_NAME') ?: '');
        $user = defined('DB_USER') ? (string)DB_USER : (string)(getenv('TT_DB_USER') ?: '');
        $pass = defined('DB_PASS') ? (string)DB_PASS : (string)(getenv('TT_DB_PASS') ?: '');

        if ($name === '' || $user === '' || $pass === '') {
            throw new RuntimeException(
                'Storefront database is not configured. Set TT_DB_HOST, TT_DB_NAME, TT_DB_USER, and TT_DB_PASS on the cPanel host.'
            );
        }

        $config = [
            'dsn' => 'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4',
            'username' => $user,
            'password' => $pass,
        ];
    }

    if (
        empty($config['dsn']) ||
        !array_key_exists('username', $config) ||
        !array_key_exists('password', $config)
    ) {
        throw new RuntimeException('Storefront database configuration is incomplete.');
    }

    $pdo = new PDO(
        (string)$config['dsn'],
        (string)$config['username'],
        (string)$config['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS ev_orders (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            customer_name VARCHAR(120) NOT NULL,
            customer_email VARCHAR(190) NOT NULL,
            customer_phone VARCHAR(50) NOT NULL,
            delivery_location VARCHAR(180) NOT NULL,
            customer_note TEXT NULL,
            consented_at DATETIME NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'new',
            created_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_ev_orders_status_created (status, created_at),
            INDEX idx_ev_orders_email (customer_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS ev_order_items (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            order_id BIGINT UNSIGNED NOT NULL,
            product_id VARCHAR(100) NOT NULL,
            product_name VARCHAR(180) NOT NULL,
            quantity INT UNSIGNED NOT NULL,
            listed_price DECIMAL(12, 2) NULL,
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Existing storefront databases are upgraded in place so a cPanel upload
    // does not require dropping orders or manually editing the live schema.
    storefront_add_column($pdo, 'ev_orders', 'payment_method', 'VARCHAR(100) NULL AFTER customer_note');
    storefront_add_column($pdo, 'ev_orders', 'payment_upload_token', 'CHAR(64) NULL AFTER payment_method');
    storefront_add_column($pdo, 'ev_orders', 'payment_proof_path', 'VARCHAR(500) NULL AFTER payment_upload_token');
    storefront_add_column($pdo, 'ev_orders', 'payment_proof_name', 'VARCHAR(255) NULL AFTER payment_proof_path');
    storefront_add_column($pdo, 'ev_orders', 'payment_proof_mime', 'VARCHAR(120) NULL AFTER payment_proof_name');
    storefront_add_column($pdo, 'ev_orders', 'payment_proof_size', 'INT UNSIGNED NULL AFTER payment_proof_mime');
    storefront_add_column($pdo, 'ev_orders', 'payment_proof_uploaded_at', 'DATETIME NULL AFTER payment_proof_size');
    storefront_add_column($pdo, 'ev_orders', 'payment_reference', 'VARCHAR(190) NULL AFTER payment_proof_uploaded_at');

    return $pdo;
}