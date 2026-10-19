<?php
// Direct OTP endpoint for cPanel hosts where the /api/* rewrite is not
// applied consistently. This intentionally returns JSON for every outcome.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';
tt_start_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

function otp_send_json($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    otp_send_json(['success' => false, 'error' => 'POST required'], 405);
}

$raw = file_get_contents('php://input');
$body = $raw ? (json_decode($raw, true) ?: []) : [];
$email = strtolower(trim((string)($body['email'] ?? '')));
$name = trim((string)($body['name'] ?? 'Investor')) ?: 'Investor';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    otp_send_json(['success' => false, 'error' => 'Enter a valid email address.'], 400);
}

$code = str_pad((string)mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);

try {
    $db = get_db();
    $stCount = $db->prepare(
        'SELECT COUNT(*) FROM otps WHERE email=? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)'
    );
    $stCount->execute([$email]);
    if ((int)$stCount->fetchColumn() >= 5) {
        otp_send_json([
            'success' => false,
            'error' => 'Too many verification codes. Please wait before requesting another.',
        ], 429);
    }
    clear_otp_verification();
    $db->beginTransaction();
    $db->prepare('UPDATE otps SET used=1 WHERE email=? AND used=0')->execute([$email]);
    $db->prepare(
        'INSERT INTO otps (email, code, expires_at, name)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)'
    )->execute([$email, $code, $name]);
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('OTP send database error: ' . $e->getMessage());
    $detail = strtolower($e->getMessage());
    $message = 'Verification service is not connected. Check the cPanel database settings and database-user permissions.';
    if (strpos($detail, 'access denied') !== false) {
        $message = 'The database user was rejected. In cPanel, add ttadmin to the ttinc database with all privileges.';
    } elseif (strpos($detail, 'unknown database') !== false) {
        $message = 'The ttinc database was not found. Confirm the database name and cPanel account prefix.';
    } elseif (strpos($detail, 'could not find driver') !== false) {
        $message = 'PHP PDO MySQL is not enabled. Enable the PDO MySQL extension in cPanel.';
    } elseif (strpos($detail, 'permission denied') !== false || strpos($detail, 'create command denied') !== false) {
        $message = 'The database user cannot create tables. Grant ttadmin all privileges on ttinc.';
    }
    otp_send_json([
        'success' => false,
        'error' => $message,
    ], 503);
}

try {
    $mailResult = send_email(
        $email,
        $name,
        'Your Tesla Trade Inc Verification Code',
        otp_email_html($name, $code)
    );
} catch (Throwable $e) {
    error_log('OTP email error: ' . $e->getMessage());
    $mailResult = ['ok' => false];
}

if (empty($mailResult['ok'])) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    otp_send_json([
        'success' => false,
        'error' => 'We could not send the verification email. Confirm the Resend sender domain and RESEND_API_KEY in cPanel, then try again.',
    ], 502);
}

$db->commit();
otp_send_json(['success' => true]);