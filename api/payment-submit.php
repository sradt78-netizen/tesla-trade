<?php
// Direct payment submission endpoint for cPanel hosts where /api/* rewrites
// are unavailable. This endpoint intentionally does not depend on Resend:
// email notifications are optional and must never make a payment disappear.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';
tt_start_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
tt_require_same_origin();

function payment_submit_json($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function save_payment_proof(array $file): array {
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE  => 'Payment proof is too large for the server upload limit.',
            UPLOAD_ERR_FORM_SIZE => 'Payment proof is too large.',
            UPLOAD_ERR_PARTIAL   => 'Payment proof upload was interrupted.',
            UPLOAD_ERR_NO_FILE   => 'Choose a payment proof file before submitting.',
        ];
        payment_submit_json(['success' => false, 'error' => $messages[$error] ?? 'Payment proof could not be uploaded.'], 400);
    }
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        payment_submit_json(['success' => false, 'error' => 'Payment proof upload could not be verified.'], 400);
    }
    $maxBytes = 10 * 1024 * 1024;
    if ((int)$file['size'] <= 0 || (int)$file['size'] > $maxBytes) {
        payment_submit_json(['success' => false, 'error' => 'Payment proof must be under 10MB.'], 400);
    }

    $allowed = [
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png'  => 'image/png',
        'webp' => 'image/webp',
        'gif'  => 'image/gif',
        'pdf'  => 'application/pdf',
    ];
    $extension = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!isset($allowed[$extension])) {
        payment_submit_json(['success' => false, 'error' => 'Upload a JPG, PNG, WEBP, GIF, or PDF payment proof.'], 400);
    }

    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($file['tmp_name']);
    }
    if ($mime !== '' && $mime !== $allowed[$extension]) {
        payment_submit_json(['success' => false, 'error' => 'The payment proof content does not match its file type.'], 400);
    }

    $directory = dirname(__DIR__) . '/uploads/payment-proofs/';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        payment_submit_json(['success' => false, 'error' => 'Payment proof storage is not available.'], 500);
    }
    $htaccess = $directory . '.htaccess';
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, "Options -Indexes\nDeny from all\n");
    }

    $filename = 'proof_' . uuid() . '.' . $extension;
    $absolutePath = $directory . $filename;
    if (!move_uploaded_file($file['tmp_name'], $absolutePath)) {
        payment_submit_json(['success' => false, 'error' => 'Payment proof could not be saved. Please try again.'], 500);
    }
    @chmod($absolutePath, 0640);

    return [
        'path' => 'uploads/payment-proofs/' . $filename,
        'absolutePath' => $absolutePath,
        'name' => basename((string)($file['name'] ?? $filename)),
        'mime' => $mime ?: $allowed[$extension],
        'size' => (int)$file['size'],
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    payment_submit_json(['success' => false, 'error' => 'POST required'], 405);
}

$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
$raw = file_get_contents('php://input');
$b = strpos($contentType, 'multipart/form-data') !== false
    ? $_POST
    : ($raw ? (json_decode($raw, true) ?: []) : []);
$paymentProof = null;
$email = strtolower(trim((string)($b['userEmail'] ?? $b['email'] ?? '')));
$method = trim((string)($b['method'] ?? $b['paymentMethod'] ?? $b['payment_method'] ?? ''));
$total = (float)($b['total'] ?? 0);
$planId = trim((string)($b['planId'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    payment_submit_json(['success' => false, 'error' => 'A valid investor email is required.'], 400);
}
if ($method === '') {
    payment_submit_json(['success' => false, 'error' => 'Choose a payment method before submitting.'], 400);
}
if (!tt_valid_payment_method($method)) {
    payment_submit_json(['success' => false, 'error' => 'Choose one of the available payment methods.'], 400);
}
$method = tt_payment_method_label($method);
if (!is_numeric($b['total'] ?? null) || !is_finite($total) || $total <= 0) {
    payment_submit_json(['success' => false, 'error' => 'Enter a valid investment amount.'], 400);
}

// Recover the plan from the old compiled bundle when it sends portfolio as
// an array instead of sending planId.
if (!$planId && is_array($b['portfolio'] ?? null)) {
    $planId = trim((string)($b['portfolio'][0]['id'] ?? $b['portfolio']['id'] ?? ''));
}
if (!$planId || !isset(PLANS[$planId])) {
    payment_submit_json(['success' => false, 'error' => 'A valid investment plan is required. Return to Investment Plans and select it again.'], 400);
}

if (session_status() !== PHP_SESSION_ACTIVE ||
    !hash_equals((string)($_SESSION['investor_email'] ?? ''), $email)) {
    payment_submit_json([
        'success' => false,
        'error' => 'Your investor session has expired. Please sign in again, then submit the payment.',
    ], 401);
}

$plan = PLANS[$planId];
if ($total < (float)$plan['min'] || ($plan['max'] !== null && $total > (float)$plan['max'])) {
    payment_submit_json(['success' => false, 'error' => 'The amount is outside the selected plan range.'], 400);
}
$proofFile = $_FILES['paymentProof'] ?? null;
if (!is_array($proofFile) || (int)($proofFile['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
    payment_submit_json([
        'success' => false,
        'error' => 'Upload your payment receipt before submitting the deposit.',
    ], 400);
}
$paymentProof = save_payment_proof($proofFile);

try {
    $db = get_db();

    $pending = $db->prepare(
        "SELECT id, tx_id FROM investments
         WHERE LOWER(user_email)=? AND status='pending_approval'
         ORDER BY created_at DESC LIMIT 1"
    );
    $pending->execute([$email]);
    $existing = $pending->fetch();
    if ($existing) {
        if ($paymentProof) {
            $existingReference = trim((string)($b['paymentReference'] ?? '')) ?: null;
            $db->prepare(
                'UPDATE investments
                 SET payment_proof_path=?, payment_proof_name=?, payment_proof_mime=?,
                     payment_proof_size=?, payment_proof_uploaded_at=NOW(),
                     payment_reference=COALESCE(?, payment_reference)
                 WHERE id=?'
            )->execute([
                $paymentProof['path'], $paymentProof['name'], $paymentProof['mime'],
                $paymentProof['size'], $existingReference, $existing['id'],
            ]);
            $existingDetails = $db->prepare('SELECT user_name, user_email, portfolio, total, method, payment_reference FROM investments WHERE id=?');
            $existingDetails->execute([$existing['id']]);
            $details = $existingDetails->fetch() ?: [];
            telegram_payment_proof(
                (string)($details['user_name'] ?? 'Investor'),
                (string)($details['user_email'] ?? $email),
                (string)($details['portfolio'] ?? ''),
                '$' . number_format((float)($details['total'] ?? 0), 2),
                (string)($details['method'] ?? $method),
                (string)($existingReference ?? $details['payment_reference'] ?? ''),
                $paymentProof['absolutePath']
            );
        }
        payment_submit_json([
            'success' => true,
            'id' => $existing['id'],
            'txId' => $existing['tx_id'],
            'status' => 'pending_approval',
            'dashboardInvestmentId' => find_primary_active_investment_id($db, $email),
            'alreadySubmitted' => true,
            'proofUploaded' => (bool)$paymentProof,
        ]);
    }

    // Only the name is required here. Phone and age were added by later
    // migrations, so selecting them would make payment confirmation fail on
    // an older cPanel database before the fallback insert can run.
    $accountStmt = $db->prepare(
        'SELECT name, onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1'
    );
    $accountStmt->execute([$email]);
    $account = $accountStmt->fetch();
    if (!$account) {
        payment_submit_json([
            'success' => false,
            'error' => 'Complete investor registration before submitting a payment.',
        ], 403);
    }
    $dashboardInvestmentId = find_primary_active_investment_id($db, $email);
    $returningInvestor = (bool)$dashboardInvestmentId
        || (($account['onboarding_status'] ?? '') === 'active');

    $userName = trim((string)($account['name'] ?? $b['userName'] ?? 'Investor')) ?: 'Investor';
    $portfolioValue = $b['portfolio'] ?? $plan['label'];
    if (is_string($portfolioValue)) {
        // The compatibility payment screen stores its selected plan as a
        // JSON string. Decode it before inserting so the database receives a
        // short readable plan name instead of the full JSON payload.
        $decodedPortfolio = json_decode($portfolioValue, true);
        if (is_array($decodedPortfolio)) {
            $portfolioValue = $decodedPortfolio;
        }
    }
    if (is_array($portfolioValue)) {
        $portfolioItem = $portfolioValue[0] ?? $portfolioValue;
        $portfolio = trim((string)($portfolioItem['label'] ?? $portfolioItem['name'] ?? $portfolioItem['planName'] ?? $plan['label']));
    } else {
        $portfolio = trim((string)$portfolioValue) ?: $plan['label'];
    }
    if (strlen($portfolio) > 255) {
        $portfolio = $plan['label'];
    }
    $id = uuid();
    $txId = uuid();
    $reference = trim((string)($b['paymentReference'] ?? '')) ?: null;

    // The base columns exist in every prior Tesla Wealth schema. Prefer the
    // richer insert, but fall back to the base insert if an old installation
    // has not yet added the optional payment metadata columns.
    try {
        $db->prepare(
            'INSERT INTO investments
             (id,tx_id,user_id,user_name,user_email,portfolio,total,method,status,
              plan_id,plan_name,projected_roi,payment_confirmed,payment_reference,
              payment_proof_path,payment_proof_name,payment_proof_mime,payment_proof_size,
              payment_proof_uploaded_at,payment_submitted_at,pending_approval_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),NOW())'
        )->execute([
            $id, $txId, $email, $userName, $email, $portfolio, $total, $method,
            'pending_approval', $planId, $plan['label'], (float)$plan['roiMax'],
            1, $reference,
            $paymentProof['path'] ?? null, $paymentProof['name'] ?? null,
            $paymentProof['mime'] ?? null, $paymentProof['size'] ?? null,
        ]);
    } catch (PDOException $metadataError) {
        error_log('Tesla Wealth payment metadata insert fallback: ' . $metadataError->getMessage());
        $db->prepare(
            'INSERT INTO investments
             (id,tx_id,user_id,user_name,user_email,portfolio,total,method,status)
             VALUES (?,?,?,?,?,?,?,?,?)'
        )->execute([
            $id, $txId, $email, $userName, $email, $portfolio, $total, $method,
            'pending_approval',
        ]);
    }

    // Keep the standalone cPanel payment endpoint on the same durable ledger
    // as the main /api/investments route. Without this row, the deposit is
    // saved as an investment but is absent from transaction history until a
    // legacy backfill happens to find it.
    record_account_transaction(
        $db,
        $id,
        $email,
        'deposit',
        $total,
        $method,
        'pending_approval',
        $txId,
        'Investor deposit'
    );

    // This update is helpful for the gated onboarding flow, but older
    // installations may not have the column yet.
    try {
        if (!$returningInvestor) {
            $db->prepare(
                "UPDATE investor_accounts
                 SET onboarding_status='pending_approval', updated_at=NOW()
                 WHERE LOWER(email)=?"
            )->execute([$email]);
        }
    } catch (Throwable $ignored) {
        error_log('Tesla Wealth onboarding status update skipped: ' . $ignored->getMessage());
    }

    if ($paymentProof) {
        telegram_payment_proof(
            $userName,
            $email,
            $portfolio,
            '$' . number_format($total, 2),
            $method,
            (string)($reference ?? ''),
            $paymentProof['absolutePath']
        );
    }

    payment_submit_json([
        'success' => true,
        'id' => $id,
        'txId' => $txId,
        'status' => 'pending_approval',
        'dashboardInvestmentId' => $dashboardInvestmentId ?: $id,
        'proofUploaded' => (bool)$paymentProof,
    ]);
} catch (Throwable $e) {
    if (is_array($paymentProof) && !empty($paymentProof['absolutePath'])) {
        @unlink($paymentProof['absolutePath']);
    }
    error_log('Tesla Wealth direct payment submission failed: ' . $e->getMessage());
    $message = $e->getMessage();
    if (stripos($message, 'Database is not configured') !== false ||
        stripos($message, 'Access denied') !== false ||
        stripos($message, 'Unknown database') !== false ||
        stripos($message, 'Connection refused') !== false) {
        $message = 'Database is not connected. Configure TT_DB_HOST, TT_DB_NAME, TT_DB_USER, and TT_DB_PASS as active SetEnv lines in the Hestia public_html/.htaccess file.';
    } else {
        $message = 'The payment could not be saved on the server. Check the cPanel PHP error log.';
    }
    payment_submit_json(['success' => false, 'error' => $message], 500);
}