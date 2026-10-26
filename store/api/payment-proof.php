<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/config.php';
require_once __DIR__ . '/db.php';

function store_proof_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($payload);
    exit;
}

function store_proof_error_message(array $file): string
{
    return match ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE)) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Payment receipt is too large for this server.',
        UPLOAD_ERR_PARTIAL => 'Payment receipt upload was interrupted. Please try again.',
        UPLOAD_ERR_NO_FILE => 'Choose a payment receipt before submitting.',
        default => 'Payment receipt could not be uploaded.',
    };
}

function store_save_proof(array $file): array
{
    if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        store_proof_json(['success' => false, 'error' => store_proof_error_message($file)], 400);
    }
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        store_proof_json(['success' => false, 'error' => 'Payment receipt could not be verified.'], 400);
    }

    $maxBytes = 10 * 1024 * 1024;
    if ((int)$file['size'] <= 0 || (int)$file['size'] > $maxBytes) {
        store_proof_json(['success' => false, 'error' => 'Payment receipt must be under 10MB.'], 400);
    }

    $allowed = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'pdf' => 'application/pdf',
    ];
    $extension = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!isset($allowed[$extension])) {
        store_proof_json(['success' => false, 'error' => 'Upload a JPG, PNG, WEBP, GIF, or PDF receipt.'], 400);
    }

    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($file['tmp_name']);
    }
    if ($mime !== '' && $mime !== $allowed[$extension]) {
        store_proof_json(['success' => false, 'error' => 'The receipt content does not match its file type.'], 400);
    }

    $directory = __DIR__ . '/../uploads/payment-proofs/';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        store_proof_json(['success' => false, 'error' => 'Receipt storage is not available.'], 500);
    }
    if (!is_file($directory . '.htaccess')) {
        @file_put_contents($directory . '.htaccess', "Options -Indexes\nDeny from all\n");
    }

    $filename = 'shop_proof_' . bin2hex(random_bytes(16)) . '.' . $extension;
    $absolutePath = $directory . $filename;
    if (!move_uploaded_file($file['tmp_name'], $absolutePath)) {
        store_proof_json(['success' => false, 'error' => 'Payment receipt could not be saved.'], 500);
    }
    @chmod($absolutePath, 0640);

    return [
        'path' => 'store/uploads/payment-proofs/' . $filename,
        'absolutePath' => $absolutePath,
        'name' => basename((string)($file['name'] ?? 'payment-receipt.' . $extension)),
        'mime' => $mime !== '' ? $mime : $allowed[$extension],
        'size' => (int)$file['size'],
    ];
}

function store_admin_allowed(): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (!empty($_SESSION['admin_auth'])) {
        return true;
    }
    $headerToken = (string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
    return defined('ADMIN_TOKEN') && ADMIN_TOKEN !== '' && hash_equals(ADMIN_TOKEN, $headerToken);
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'POST') {
    $orderId = filter_var($_POST['orderId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $uploadToken = trim((string)($_POST['uploadToken'] ?? ''));
    $reference = trim((string)($_POST['paymentReference'] ?? ''));
    if ($orderId === false || !preg_match('/^[a-f0-9]{64}$/', $uploadToken)) {
        store_proof_json(['success' => false, 'error' => 'This receipt upload link is invalid.'], 400);
    }
    if (mb_strlen($reference) > 190) {
        store_proof_json(['success' => false, 'error' => 'The payment reference is too long.'], 400);
    }

    try {
        $pdo = storefront_pdo();
        $statement = $pdo->prepare(
            'SELECT id, payment_upload_token, payment_proof_path
             FROM ev_orders WHERE id=? LIMIT 1'
        );
        $statement->execute([$orderId]);
        $order = $statement->fetch();
        if (!$order || empty($order['payment_upload_token']) ||
            !hash_equals((string)$order['payment_upload_token'], $uploadToken)) {
            store_proof_json(['success' => false, 'error' => 'This receipt upload link is invalid or expired.'], 403);
        }

        $proof = store_save_proof($_FILES['paymentProof'] ?? []);
        $update = $pdo->prepare(
            'UPDATE ev_orders
             SET payment_proof_path=?, payment_proof_name=?, payment_proof_mime=?,
                 payment_proof_size=?, payment_proof_uploaded_at=UTC_TIMESTAMP(),
                 payment_reference=?, status=?
             WHERE id=?'
        );
        $update->execute([
            $proof['path'],
            $proof['name'],
            $proof['mime'],
            $proof['size'],
            $reference !== '' ? $reference : null,
            'payment_submitted',
            $orderId,
        ]);

        if (!empty($order['payment_proof_path'])) {
            $oldPath = realpath(__DIR__ . '/../../' . ltrim((string)$order['payment_proof_path'], '/'));
            $base = realpath(__DIR__ . '/../uploads/payment-proofs');
            if ($oldPath && $base && strpos($oldPath, $base . DIRECTORY_SEPARATOR) === 0 && is_file($oldPath)) {
                @unlink($oldPath);
            }
        }

        store_proof_json([
            'success' => true,
            'orderId' => (int)$orderId,
            'message' => 'Your payment receipt was uploaded. The admin team can now review it.',
        ]);
    } catch (Throwable $error) {
        error_log('Tesla Trade shop payment proof error: ' . $error->getMessage());
        store_proof_json(['success' => false, 'error' => 'The receipt could not be saved. Please try again.'], 500);
    }
}

if ($method !== 'GET') {
    store_proof_json(['success' => false, 'error' => 'GET or POST required.'], 405);
}

if (!store_admin_allowed()) {
    http_response_code(401);
    exit('Unauthorized');
}

$orderId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($orderId === false) {
    http_response_code(400);
    exit('Payment receipt not specified');
}

try {
    $pdo = storefront_pdo();
    $statement = $pdo->prepare(
        'SELECT payment_proof_path, payment_proof_name, payment_proof_mime
         FROM ev_orders WHERE id=? LIMIT 1'
    );
    $statement->execute([$orderId]);
    $proof = $statement->fetch();
    if (!$proof || empty($proof['payment_proof_path'])) {
        http_response_code(404);
        exit('Payment receipt not found');
    }

    $baseDirectory = realpath(__DIR__ . '/../uploads/payment-proofs');
    $absolutePath = realpath(__DIR__ . '/../../' . ltrim((string)$proof['payment_proof_path'], '/'));
    if (!$baseDirectory || !$absolutePath ||
        strpos($absolutePath, $baseDirectory . DIRECTORY_SEPARATOR) !== 0 ||
        !is_file($absolutePath) || !is_readable($absolutePath)) {
        http_response_code(404);
        exit('Payment receipt not found');
    }

    $mime = (string)($proof['payment_proof_mime'] ?? 'application/octet-stream');
    $allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!in_array($mime, $allowedMime, true)) {
        $mime = 'application/octet-stream';
    }
    $name = basename((string)($proof['payment_proof_name'] ?? 'payment-receipt'));
    $name = preg_replace('/[^A-Za-z0-9._ -]/', '_', $name) ?: 'payment-receipt';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)filesize($absolutePath));
    header('Content-Disposition: inline; filename="' . str_replace('"', '', $name) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($absolutePath);
} catch (Throwable $error) {
    error_log('Tesla Trade shop payment receipt view failed: ' . $error->getMessage());
    http_response_code(500);
    exit('Payment receipt could not be loaded');
}