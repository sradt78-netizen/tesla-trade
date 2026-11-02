<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
tt_start_session();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    exit('GET required');
}

$isAdmin = !empty($_SESSION['admin_auth']);
$headerToken = (string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
if (!$isAdmin && (ADMIN_TOKEN === '' || !hash_equals(ADMIN_TOKEN, $headerToken))) {
    http_response_code(401);
    exit('Unauthorized');
}

$investmentId = trim((string)($_GET['id'] ?? ''));
if ($investmentId === '') {
    http_response_code(400);
    exit('Payment proof not specified');
}

try {
    $db = get_db();
    $stmt = $db->prepare(
        'SELECT payment_proof_path, payment_proof_name, payment_proof_mime
         FROM investments WHERE id=? LIMIT 1'
    );
    $stmt->execute([$investmentId]);
    $proof = $stmt->fetch();
    if (!$proof || empty($proof['payment_proof_path'])) {
        http_response_code(404);
        exit('Payment proof not found');
    }

    $baseDirectory = realpath(dirname(__DIR__) . '/uploads/payment-proofs');
    $absolutePath = realpath(dirname(__DIR__) . '/' . ltrim((string)$proof['payment_proof_path'], '/'));
    if (!$baseDirectory || !$absolutePath ||
        strpos($absolutePath, $baseDirectory . DIRECTORY_SEPARATOR) !== 0 ||
        !is_file($absolutePath) || !is_readable($absolutePath)) {
        http_response_code(404);
        exit('Payment proof not found');
    }

    $mime = (string)($proof['payment_proof_mime'] ?? 'application/octet-stream');
    $allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!in_array($mime, $allowedMime, true)) {
        $mime = 'application/octet-stream';
    }
    $name = basename((string)($proof['payment_proof_name'] ?? 'payment-proof'));
    $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', $name) ?: 'payment-proof';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)filesize($absolutePath));
    header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($absolutePath);
} catch (Throwable $e) {
    error_log('Tesla Wealth payment proof download failed: ' . $e->getMessage());
    http_response_code(500);
    exit('Payment proof could not be loaded');
}