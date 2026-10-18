<?php
// ============================================================
//  Tesla Trade Inc — Configuration
//  Runtime credentials belong in the PHP host environment, not
//  in this file or the ZIP export.
// ============================================================

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

/**
 * Hestia deployments commonly run PHP through an Apache/Nginx bridge. When
 * Apache does not forward SetEnv values into PHP-FPM, read only the explicit
 * SetEnv directives from the protected document-root .htaccess as a fallback.
 * This keeps runtime credentials out of PHP source while supporting a
 * .htaccess-only deployment.
 */
function tt_htaccess_env(string $key): ?string {
    $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_readable($path)) {
        return null;
    }

    $contents = @file_get_contents($path);
    if (!is_string($contents) || $contents === '') {
        return null;
    }

    $pattern = '/^[ \t]*SetEnv[ \t]+' . preg_quote($key, '/') .
        '[ \t]+(?:"([^"]*)"|\'([^\']*)\'|([^#\s]+))/mi';
    if (!preg_match($pattern, $contents, $matches)) {
        return null;
    }

    if (array_key_exists(1, $matches)) return $matches[1];
    if (array_key_exists(2, $matches)) return $matches[2];
    return $matches[3] ?? null;
}

function tt_config_env(string $key, ?string $default = null, bool $required = false): string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        // Apache/cPanel can prefix variables with REDIRECT_ after an internal
        // rewrite. Check the server-provided copies without ever consulting
        // request headers, so credentials cannot be supplied by a browser.
        $names = [$key, 'REDIRECT_' . $key, 'REDIRECT_REDIRECT_' . $key];
        $value = null;
        foreach ($names as $name) {
            if (isset($_SERVER[$name]) && $_SERVER[$name] !== '') {
                $value = $_SERVER[$name];
                break;
            }
            if (isset($_ENV[$name]) && $_ENV[$name] !== '') {
                $value = $_ENV[$name];
                break;
            }
        }
        if ($value === null) $value = $default;
    }
    if ($value === null || $value === '') {
        $htaccessValue = tt_htaccess_env($key);
        if ($htaccessValue !== null) {
            $value = $htaccessValue;
        }
    }
    $value = trim((string)($value ?? ''));
    if ($required && $value === '') {
        throw new RuntimeException("Missing required server environment variable: {$key}");
    }
    return $value;
}

function tt_admin_password_file(): string {
    $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.admin-password';
    if (!is_file($path) || !is_readable($path)) {
        return '';
    }

    $value = file_get_contents($path);
    return is_string($value) ? trim($value) : '';
}

// --- Database -----------------------------------------------
// Empty defaults are intentional. get_db() returns a controlled error when
// Hestia has not supplied the required values instead of a blank PHP page.
define('DB_HOST', tt_config_env('TT_DB_HOST', 'localhost'));
define('DB_NAME', tt_config_env('TT_DB_NAME', ''));
define('DB_USER', tt_config_env('TT_DB_USER', ''));
define('DB_PASS', tt_config_env('TT_DB_PASS', ''));

// --- Admin --------------------------------------------------
// Runtime values can override the built-in compatibility fallback. The
// fallback is a one-way digest so the admin password is never sent to the
// browser or stored in plaintext in the PHP source.
// Spaceship shared hosting runs on LiteSpeed, where a .htaccess SetEnv value
// may not always be forwarded to PHP. Keep the environment variable as the
// first choice, with a protected host-local file as a fallback.
define('ADMIN_PASSWORD', tt_config_env('TT_ADMIN_PASSWORD', tt_admin_password_file()));
define('ADMIN_TOKEN',    tt_config_env('TT_ADMIN_TOKEN', ''));
define(
    'ADMIN_PASSWORD_SHA256',
    tt_config_env(
        'TT_ADMIN_PASSWORD_SHA256',
        ''
    )
);

function tt_admin_password_matches(string $password): bool {
    if (ADMIN_PASSWORD === '' && ADMIN_PASSWORD_SHA256 === '') {
        return false;
    }

    if (ADMIN_PASSWORD !== '' && hash_equals(ADMIN_PASSWORD, $password)) {
        return true;
    }

    return hash_equals(ADMIN_PASSWORD_SHA256, hash('sha256', $password));
}

/**
 * Reject browser requests that try to mutate account or payment state from a
 * different origin. Requests without Origin/Referer are kept compatible with
 * same-host CLI and server-to-server calls.
 */
function tt_require_same_origin(): void {
    $candidate = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($candidate === '') {
        $candidate = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
    }
    if ($candidate === '') {
        return;
    }

    $requestHost = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        ? 'https'
        : 'http';
    $expected = parse_url($scheme . '://' . $requestHost);
    $actual = parse_url($candidate);
    if (!$expected || !$actual || empty($expected['host']) || empty($actual['host'])) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Cross-origin request rejected.']);
        exit;
    }

    $expectedPort = (int)($expected['port'] ?? ($scheme === 'https' ? 443 : 80));
    $actualPort = (int)($actual['port'] ?? (($actual['scheme'] ?? '') === 'https' ? 443 : 80));
    if (
        !hash_equals(strtolower((string)$expected['host']), strtolower((string)$actual['host'])) ||
        $expectedPort !== $actualPort
    ) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Cross-origin request rejected.']);
        exit;
    }
}

// --- Admin notification email --------------------------------
define('ADMIN_EMAIL', tt_config_env('TT_ADMIN_EMAIL', 'admin@teslawealths.org'));

// --- Invitation signup gate --------------------------------
// Change this deployment-level value before sharing invitation links. The
// default keeps the feature usable on a fresh cPanel upload; the value is
// never exposed by the API.
define('INVITATION_CODE', tt_config_env('TT_INVITATION_CODE', 'INVITATIONCODE'));

function tt_invitation_code_matches(string $candidate): bool {
    $expected = strtoupper(trim((string)INVITATION_CODE));
    $actual = strtoupper(trim($candidate));
    if ($actual === '') {
        return false;
    }

    // Once the database-backed invitation ledger is available, it becomes
    // the source of truth. The environment value remains a safe first-boot
    // fallback for a fresh cPanel install or an unavailable database.
    if (function_exists('tt_db_invitation_code_matches')) {
        $managedResult = tt_db_invitation_code_matches($actual);
        if ($managedResult !== null) {
            return $managedResult;
        }
    }

    return $expected !== '' && hash_equals($expected, $actual);
}

// --- Email sender -------------------------------------------
define('SENDER_NAME',  tt_config_env('TT_SENDER_NAME', 'Tesla Trade Inc'));
define('SENDER_EMAIL', tt_config_env('TT_SENDER_EMAIL', 'no-reply@teslawealths.org'));

// --- Resend API key -------------------------------------------
// Never commit this value. Configure it in the Hestia .htaccess environment.
define('RESEND_API_KEY', tt_config_env('RESEND_API_KEY', ''));

// --- Telegram notifications ---------------------------------
define('TELEGRAM_BOT_TOKEN', tt_config_env('TT_TELEGRAM_BOT_TOKEN', ''));
define('TELEGRAM_CHAT_ID',   tt_config_env('TT_TELEGRAM_CHAT_ID', ''));

// --- Payment wallet addresses --------------------------------
define('WALLET_USDT', tt_config_env('TT_WALLET_USDT', ''));
define('WALLET_ETH',  tt_config_env('TT_WALLET_ETH', ''));
define('WALLET_BTC',  tt_config_env('TT_WALLET_BTC', ''));

// --- Bank details -------------------------------------------
define('BANK_NAME',        tt_config_env('TT_BANK_NAME', ''));
define('BANK_ACCOUNT',     tt_config_env('TT_BANK_ACCOUNT', ''));
define('BANK_ROUTING',     tt_config_env('TT_BANK_ROUTING', ''));
define('BANK_SWIFT',       tt_config_env('TT_BANK_SWIFT', ''));

// --- Additional manual payment methods -----------------------
// These can be supplied from .htaccess SetEnv lines or cPanel
// environment variables. They are intentionally empty by default.
define('VENMO_HANDLE',     tt_config_env('TT_VENMO_HANDLE', ''));
define('CASHAPP_HANDLE',   tt_config_env('TT_CASHAPP_HANDLE', ''));
define('PAYPAL_HANDLE',    tt_config_env('TT_PAYPAL_HANDLE', ''));
define('ALIPAY_ACCOUNT',   tt_config_env('TT_ALIPAY_ACCOUNT', ''));
define('WECHAT_ACCOUNT',   tt_config_env('TT_WECHAT_ACCOUNT', ''));

/**
 * Values supplied in .htaccess/cPanel environment variables are the
 * deployment-level source of truth for payment instructions. They override
 * older values saved through the admin panel, while blank environment values
 * leave the saved value available.
 */
function tt_payment_env_overrides(): array {
    return [
        'usdt' => ['address' => WALLET_USDT],
        'eth' => ['address' => WALLET_ETH],
        'btc' => ['address' => WALLET_BTC],
        'bank' => [
            'name' => BANK_NAME,
            'account' => BANK_ACCOUNT,
            'routing' => BANK_ROUTING,
            'swift' => BANK_SWIFT,
        ],
        'venmo' => ['handle' => VENMO_HANDLE],
        'cashapp' => ['handle' => CASHAPP_HANDLE],
        'paypal' => ['handle' => PAYPAL_HANDLE],
        'alipay' => ['account' => ALIPAY_ACCOUNT],
        'wechat' => ['account' => WECHAT_ACCOUNT],
    ];
}

function tt_normalize_payment_method(string $method): string {
    $normalized = strtolower(trim($method));
    $aliases = [
        'usdt' => 'usdt',
        'usdt (trc-20)' => 'usdt',
        'tether (usdt)' => 'usdt',
        'tether (trc-20)' => 'usdt',
        'ethereum' => 'eth',
        'ethereum (eth)' => 'eth',
        'ethereum (erc-20)' => 'eth',
        'eth' => 'eth',
        'bitcoin' => 'btc',
        'bitcoin (btc)' => 'btc',
        'btc' => 'btc',
        'bank transfer' => 'bank',
        'wire / sepa transfer' => 'bank',
        'venmo' => 'venmo',
        'cash app' => 'cashapp',
        'cashapp' => 'cashapp',
        'paypal' => 'paypal',
        'alipay' => 'alipay',
        'wechat pay' => 'wechat',
    ];
    return $aliases[$normalized] ?? '';
}

function tt_valid_payment_method(string $method): bool {
    return tt_normalize_payment_method($method) !== '';
}

function tt_payment_method_label(string $method): string {
    $labels = [
        'usdt' => 'Tether (TRC-20)',
        'eth' => 'Ethereum (ERC-20)',
        'btc' => 'Bitcoin (BTC)',
        'bank' => 'Wire / SEPA Transfer',
        'venmo' => 'Venmo',
        'cashapp' => 'Cash App',
        'paypal' => 'PayPal',
        'alipay' => 'Alipay',
        'wechat' => 'WeChat Pay',
    ];
    $key = tt_normalize_payment_method($method);
    if ($key !== '' && isset($labels[$key])) {
        return $labels[$key];
    }
    return trim($method);
}

// --- Referral program defaults ------------------------------
// These are the default values. Override from Admin → Referral Settings.
define('REFERRAL_BONUS_AMOUNT',   100);   // USD credited to referred user on first deposit
define('REFERRAL_MATURITY_DAYS',  30);    // Days before referral bonus can be withdrawn
// Retained only for compatibility with older installations. Withdrawals
// never require an upfront payment.
define('WITHDRAWAL_DEPOSIT_RATE', 0.00);

// --- Investment plans ---------------------------------------
define('PLANS', [
    'starter_ai' => [
        'label'    => 'Explorer',
        'roiMin'   => 50,
        'roiMax'   => 50,
        'min'      => 30,
        'max'      => 1000,
        'cycle'    => '30 days',
        'desc'     => 'An accessible entry tier for investors beginning with a smaller allocation and a defined projected return target.',
    ],
    'growth_ai' => [
        'label'    => 'Pioneer',
        'roiMin'   => 80,
        'roiMax'   => 80,
        'min'      => 1000,
        'max'      => 10000,
        'cycle'    => '60 days',
        'desc'     => 'A broader allocation tier for investors seeking increased exposure to the business growth strategy.',
    ],
    'elite_ai' => [
        'label'    => 'Visionary',
        'roiMin'   => 120,
        'roiMax'   => 120,
        'min'      => 10000,
        'max'      => 25000,
        'cycle'    => '90 days',
        'desc'     => 'A higher-capital tier intended for investors seeking a larger participation in the operating strategy.',
    ],
    'legacy_elite_ai' => [
        'label'    => 'Pioneer Plus',
        'roiMin'   => 180,
        'roiMax'   => 180,
        'min'      => 25000,
        'max'      => 55000,
        'cycle'    => '180 days',
        'desc'     => 'The highest available tier for larger allocations within the current offering limit. Projected returns are estimates and are not guaranteed.',
    ],
    'dogecoin_reserve' => [
        'label'    => 'Dogecoin Reserve Fund',
        'roiMin'   => 40,
        'roiMax'   => 120,
        'min'      => 1000,
        'max'      => 25000,
        'cycle'    => '90 days',
        'desc'     => 'A dedicated Dogecoin participation option for investors seeking exposure to the DOGE market. Projected returns are estimates and are not guaranteed.',
    ],
]);
