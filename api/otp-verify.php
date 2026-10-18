<?php
// Direct OTP verification endpoint paired with api/otp-send.php.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
tt_start_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

function otp_verify_json($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    otp_verify_json(['success' => false, 'error' => 'POST required'], 405);
}

$raw = file_get_contents('php://input');
$body = $raw ? (json_decode($raw, true) ?: []) : [];
$email = strtolower(trim((string)($body['email'] ?? '')));
$code = trim((string)($body['code'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
    otp_verify_json(['success' => false, 'error' => 'Enter the 6-digit verification code.'], 400);
}

try {
    $db = get_db();
    // Compare the database expiry timestamp inside MySQL so PHP and MySQL
    // timezone differences cannot make a valid code appear expired.
    $st = $db->prepare(
        'SELECT * FROM otps
         WHERE email=? AND code=? AND used=0
           AND expires_at >= NOW()
         ORDER BY created_at DESC LIMIT 1'
    );
    $st->execute([$email, $code]);
    $row = $st->fetch();
    if (!$row) {
        otp_verify_json([
            'success' => false,
            'error' => 'Incorrect or expired verification code. Request a new code and try again.',
            'canResend' => true,
        ], 401);
    }
    $token = mark_otp_verified($db, $row, $email);
    otp_verify_json(['success' => true, 'verificationToken' => $token]);
} catch (Throwable $e) {
    error_log('OTP verify database error: ' . $e->getMessage());
    $detail = strtolower($e->getMessage());
    $message = 'Verification service is not connected. Check the cPanel database settings and database-user permissions.';
    if (strpos($detail, 'access denied') !== false) {
        $message = 'The database user was rejected. In cPanel, add ttadmin to the ttinc database with all privileges.';
    } elseif (strpos($detail, 'unknown database') !== false) {
        $message = 'The ttinc database was not found. Confirm the database name and cPanel account prefix.';
    } elseif (strpos($detail, 'could not find driver') !== false) {
        $message = 'PHP PDO MySQL is not enabled. Enable the PDO MySQL extension in cPanel.';
    }
    otp_verify_json([
        'success' => false,
        'error' => $message,
    ], 503);
}