<?php
// Direct payment-settings endpoint for cPanel hosts where the /api/* rewrite
// is unavailable or points at a different document root. It deliberately
// remains useful even before the database has been configured.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

function payment_settings_json($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    payment_settings_json(['error' => 'GET required'], 405);
}

$defaults = [
    'usdt' => [
        'network' => 'TRC-20',
        'address' => defined('WALLET_USDT') && WALLET_USDT
            ? WALLET_USDT : 'SAMPLE-USDT-ADDRESS-UPDATE-IN-ADMIN',
        'label' => 'Tether (USDT)',
    ],
    'eth' => [
        'network' => 'ERC-20',
        'address' => defined('WALLET_ETH') && WALLET_ETH
            ? WALLET_ETH : 'SAMPLE-ETH-ADDRESS-UPDATE-IN-ADMIN',
        'label' => 'Ethereum (ETH)',
    ],
    'btc' => [
        'network' => 'Bitcoin',
        'address' => defined('WALLET_BTC') && WALLET_BTC
            ? WALLET_BTC : 'SAMPLE-BTC-ADDRESS-UPDATE-IN-ADMIN',
        'label' => 'Bitcoin (BTC)',
    ],
    'bank' => [
        'name' => defined('BANK_NAME') && BANK_NAME
            ? BANK_NAME : 'Sample Bank (Replace in Admin)',
        'account' => defined('BANK_ACCOUNT') && BANK_ACCOUNT ? BANK_ACCOUNT : '0000000000',
        'routing' => defined('BANK_ROUTING') && BANK_ROUTING ? BANK_ROUTING : '000000000',
        'swift' => defined('BANK_SWIFT') && BANK_SWIFT ? BANK_SWIFT : 'SAMPLEXXX',
        'label' => 'Bank Transfer',
    ],
    'venmo' => [
        'handle' => defined('VENMO_HANDLE') && VENMO_HANDLE
            ? VENMO_HANDLE : '@sample-venmo-update-in-admin',
        'label' => 'Venmo',
    ],
    'cashapp' => [
        'handle' => defined('CASHAPP_HANDLE') && CASHAPP_HANDLE
            ? CASHAPP_HANDLE : '$sampleCashApp-update-in-admin',
        'label' => 'Cash App',
    ],
    'paypal' => [
        'handle' => defined('PAYPAL_HANDLE') && PAYPAL_HANDLE
            ? PAYPAL_HANDLE : 'sample-paypal@update-in-admin.example',
        'label' => 'PayPal',
    ],
    'alipay' => [
        'account' => defined('ALIPAY_ACCOUNT') && ALIPAY_ACCOUNT
            ? ALIPAY_ACCOUNT : 'sample-alipay-update-in-admin',
        'label' => 'Alipay',
    ],
    'wechat' => [
        'account' => defined('WECHAT_ACCOUNT') && WECHAT_ACCOUNT
            ? WECHAT_ACCOUNT : 'sample-wechat-update-in-admin',
        'label' => 'WeChat Pay',
    ],
];

$saved = [];
try {
    $saved = get_setting('payment_settings', []);
} catch (Throwable $e) {
    error_log('Tesla Wealth direct payment settings read failed: ' . $e->getMessage());
}

$result = [];
foreach ($defaults as $key => $default) {
    $savedMethod = isset($saved[$key]) && is_array($saved[$key])
        ? array_filter($saved[$key], static fn($value) => trim((string)$value) !== '')
        : [];
    $result[$key] = array_merge($default, $savedMethod);
}
// Deployment values from .htaccess take precedence over stale saved admin
// values. Blank deployment values intentionally do not override anything.
foreach (tt_payment_env_overrides() as $key => $fields) {
    foreach ($fields as $field => $value) {
        if (trim((string)$value) !== '') {
            $result[$key][$field] = $value;
        }
    }
}

$bank = $result['bank'];
$bank['bankName'] = $bank['bankName'] ?? ($bank['name'] ?? '');
$bank['accountName'] = $bank['accountName'] ?? ($bank['name'] ?? '');
$bank['accountNumber'] = $bank['accountNumber'] ?? ($bank['account'] ?? '');
$bank['swift'] = $bank['swift'] ?? ($bank['swiftCode'] ?? '');
$result['bank'] = $bank;

payment_settings_json($result);