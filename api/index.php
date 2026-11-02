<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';
tt_start_session();

// ── CORS & headers ────────────────────────────────────────────
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS');
header('Access-Control-Allow-Headers: Content-Type,x-admin-token');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Helpers ───────────────────────────────────────────────────
function json_out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
function body(): array {
    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($contentType, 'multipart/form-data') !== false) {
        return $_POST;
    }
    $raw = file_get_contents('php://input');
    return $raw ? (json_decode($raw, true) ?? []) : [];
}
function is_admin(): bool {
    $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if (!empty($_SESSION['admin_auth'])) {
        return true;
    }
    return ADMIN_TOKEN !== '' && hash_equals(ADMIN_TOKEN, $token);
}
function require_admin(): void {
    if (!is_admin()) json_out(['error'=>'Unauthorized'], 401);
}
function gen_otp(): string { return str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT); }
function fmt_usd(float $v): string { return '$' . number_format($v, 2); }
function normalize_email(string $email): string { return strtolower(trim($email)); }
function valid_password(string $password): bool {
    return strlen($password) >= 8 && strlen($password) <= _stringsafe_password_limit();
}
function trading_settings(): array {
    $saved = get_setting('trading_settings', []);
    return [
        'profitIntervalSeconds' => max(1, (int)($saved['profitIntervalSeconds'] ?? 10)),
        'lossIntervalSeconds'   => max(1, (int)($saved['lossIntervalSeconds'] ?? 10)),
        'profitRatePercent'     => max(0, (float)($saved['profitRatePercent'] ?? 0.5)),
        'lossRatePercent'       => max(0, (float)($saved['lossRatePercent'] ?? 0.3)),
    ];
}
function trading_account_balance(array $inv): float {
    $balance = (float)($inv['total_current_value'] ?? 0);
    return $balance > 0 ? $balance : (float)($inv['total'] ?? 0);
}
function vehicle_catalog(): array {
    return [
        'model_s' => ['name' => 'Tesla Model S', 'base' => 74990.00],
        'model_3' => ['name' => 'Tesla Model 3', 'base' => 40240.00],
        'model_x' => ['name' => 'Tesla Model X', 'base' => 79990.00],
        'model_y' => ['name' => 'Tesla Model Y', 'base' => 43990.00],
        'cybertruck' => ['name' => 'Tesla Cybertruck', 'base' => 60990.00],
    ];
}
function vehicle_color_options(): array {
    return [
        'white' => ['name' => 'Pearl White', 'adj' => 0.00],
        'black' => ['name' => 'Solid Black', 'adj' => 0.00],
        'grey' => ['name' => 'Stealth Grey', 'adj' => 0.00],
        'silver' => ['name' => 'Quicksilver', 'adj' => 1000.00],
        'blue' => ['name' => 'Deep Blue', 'adj' => 1500.00],
        'red' => ['name' => 'Ultra Red', 'adj' => 2000.00],
    ];
}
function trading_value_at(array $inv, float $at): array {
    $amount = (float)($inv['trading_amount'] ?? 0);
    $started = !empty($inv['trading_started_at']) ? strtotime((string)$inv['trading_started_at']) : 0;
    $settings = trading_settings();
    if (($inv['trading_status'] ?? 'idle') !== 'active' || $amount <= 0 || !$started) {
        return [
            'status' => 'idle',
            'phase' => 'idle',
            'phaseLabel' => 'Ready to trade',
            'elapsedSeconds' => 0,
            'tradeValue' => 0,
            'pnl' => 0,
            'pnlPercent' => 0,
            'availableBalance' => round(trading_account_balance($inv), 2),
            'history' => [],
            'settings' => $settings,
        ];
    }

    $elapsed = max(0, (int)floor($at - $started));
    $profitWindow = $settings['profitIntervalSeconds'];
    $lossWindow = $settings['lossIntervalSeconds'];
    $cycle = $profitWindow + $lossWindow;
    $netState = trading_value_at_without_history($amount, $started, (int)$at, $settings);
    $tradeValue = $netState['value'];
    $netPercent = $amount > 0 ? (($tradeValue / $amount) - 1) * 100 : 0;
    $pnl = round($tradeValue - $amount, 2);
    $position = $elapsed % $cycle;
    $isProfit = $position < $profitWindow;
    $phaseDuration = $isProfit ? $profitWindow : $lossWindow;
    $phaseElapsed = $isProfit ? $position : $position - $profitWindow;
    $phaseRemaining = max(0, $phaseDuration - $phaseElapsed);
    $history = [];
    $sampleCount = min(30, $elapsed + 1);
    $sampleStart = max(0, $elapsed - $sampleCount + 1);
    for ($i = 0; $i < $sampleCount; $i++) {
        $sampleAt = $started + $sampleStart + $i;
        $sampleState = trading_value_at_without_history($amount, $started, $sampleAt, $settings);
        $history[] = [
            'timestamp' => $sampleAt,
            'value' => $sampleState['value'],
            'trend' => $sampleState['trend'],
        ];
    }
    return [
        'status' => 'active',
        'phase' => $isProfit ? 'profit' : 'loss',
        'phaseLabel' => $isProfit ? 'Profit phase' : 'Loss phase',
        'elapsedSeconds' => $elapsed,
        'phaseDurationSeconds' => $phaseDuration,
        'phaseElapsedSeconds' => $phaseElapsed,
        'phaseRemainingSeconds' => $phaseRemaining,
        'tradeValue' => $tradeValue,
        'pnl' => $pnl,
        'pnlPercent' => $amount > 0 ? round(($pnl / $amount) * 100, 2) : 0,
        'availableBalance' => round(max(0, trading_account_balance($inv) - $tradeValue), 2),
        'history' => $history,
        'settings' => $settings,
    ];
}
function trading_value_at_without_history(float $amount, int $started, int $at, array $settings): array {
    $elapsed = max(0, $at - $started);
    $profitWindow = $settings['profitIntervalSeconds'];
    $lossWindow = $settings['lossIntervalSeconds'];
    $cycle = $profitWindow + $lossWindow;
    $fullCycles = intdiv($elapsed, $cycle);
    $remaining = $elapsed % $cycle;
    $netPercent = $fullCycles * ($settings['profitRatePercent'] - $settings['lossRatePercent']);
    if ($remaining <= $profitWindow) {
        $netPercent += $settings['profitRatePercent'] * ($remaining / $profitWindow);
    } else {
        $netPercent += $settings['profitRatePercent'];
        $netPercent -= $settings['lossRatePercent'] * (($remaining - $profitWindow) / $lossWindow);
    }
    $position = $elapsed % $cycle;
    return [
        'value' => max(0.01, round($amount * (1 + $netPercent / 100), 2)),
        'trend' => $position < $profitWindow ? 'profit' : 'loss',
    ];
}
function _stringsafe_password_limit(): int { return 255; }
function wallet_bonus_balance(PDO $db, string $email): float {
    $st = $db->prepare(
        "SELECT COALESCE(SUM(amount), 0)
         FROM account_transactions
         WHERE LOWER(user_email)=? AND type='bonus' AND status='processed'"
    );
    $st->execute([$email]);
    return (float)$st->fetchColumn();
}
function withdrawal_eligibility(PDO $db, array $inv, float $requestedAmount = 0): array {
    $portfolioValue = max(
        (float)($inv['total_current_value'] ?? 0),
        (float)($inv['total'] ?? 0)
    );
    $stWithdrawn = $db->prepare(
        "SELECT COALESCE(SUM(amount), 0)
         FROM account_transactions
         WHERE investment_id=? AND type='withdrawal'
           AND status IN ('pending', 'processed')"
    );
    $stWithdrawn->execute([(string)$inv['id']]);
    $alreadyRequested = (float)$stWithdrawn->fetchColumn();
    $availableBalance = max(0, round($portfolioValue - $alreadyRequested, 2));
    $amount = $requestedAmount > 0 ? round($requestedAmount, 2) : $availableBalance;
    $tradeStartedAt = trim((string)($inv['trading_started_at'] ?? ''));
    $tradeStarted = $tradeStartedAt !== ''
        && (float)($inv['trading_amount'] ?? 0) > 0;
    return [
        'tradeStarted'       => $tradeStarted,
        'tradeStartedAt'     => $tradeStartedAt ?: null,
        'withdrawalAmount'   => $amount,
        'availableBalance'   => $availableBalance,
        // A withdrawal must never require an upfront payment. Keep these
        // fields for backwards-compatible clients, but make the safe policy
        // explicit and non-blocking.
        'requiresUpfrontPayment' => false,
        'depositRatePercent' => 0,
        'requiredDeposit'    => 0.00,
        'approvedDeposit'    => 0.00,
        'depositShortfall'   => 0.00,
        'depositConfirmed'   => true,
        'kycStatus'          => (string)($inv['kyc_status'] ?? 'none'),
        'adminWithdrawalEnabled' => (bool)($inv['can_withdraw'] ?? false),
    ];
}
function kyc_withdrawal_eligibility(PDO $db, array $inv): array {
    // KYC is an identity check, not a payment gate. Do not derive a
    // withdrawal amount from a second deposit or require one to submit KYC.
    return withdrawal_eligibility($db, $inv, 0);
}
function uploaded_file_error_message(array $file, string $label): ?string {
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE  => "$label is too large for the server upload limit",
            UPLOAD_ERR_FORM_SIZE => "$label is too large",
            UPLOAD_ERR_PARTIAL   => "$label upload was interrupted",
            UPLOAD_ERR_NO_FILE   => "$label is required",
        ];
        return $messages[$error] ?? "$label could not be uploaded";
    }
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        return "$label upload could not be verified";
    }
    return null;
}
function save_kyc_upload(
    array $file,
    string $field,
    array $allowedExt,
    array $allowedMime,
    int $maxBytes,
    string $label,
    string $uploadDir
): string {
    $error = uploaded_file_error_message($file, $label);
    if ($error) json_out(['error'=>$error], 400);
    if ((int)$file['size'] <= 0 || (int)$file['size'] > $maxBytes) {
        json_out(['error'=>"$label must be under " . round($maxBytes / 1048576) . "MB"], 400);
    }

    $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt, true)) {
        json_out(['error'=>"$label has an unsupported file type"], 400);
    }

    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($file['tmp_name']);
    }
    if ($mime && !in_array($mime, $allowedMime, true)) {
        json_out(['error'=>"$label content does not match its file type"], 400);
    }

    $fname = $field . '_' . uuid() . '.' . $ext;
    $destination = $uploadDir . $fname;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        error_log("Tesla Trade KYC upload failed for {$field}");
        json_out(['error'=>"$label could not be saved. Please try again"], 500);
    }
    @chmod($destination, 0640);
    return 'uploads/kyc/' . $fname;
}

function save_payment_proof_upload(array $file): array {
    $error = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE  => 'Payment proof is too large for the server upload limit.',
            UPLOAD_ERR_FORM_SIZE => 'Payment proof is too large.',
            UPLOAD_ERR_PARTIAL   => 'Payment proof upload was interrupted.',
            UPLOAD_ERR_NO_FILE   => 'Choose a payment proof file before submitting.',
        ];
        json_out(['error'=>$messages[$error] ?? 'Payment proof could not be uploaded.'], 400);
    }
    if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        json_out(['error'=>'Payment proof upload could not be verified.'], 400);
    }
    $maxBytes = 10 * 1024 * 1024;
    if ((int)$file['size'] <= 0 || (int)$file['size'] > $maxBytes) {
        json_out(['error'=>'Payment proof must be under 10MB.'], 400);
    }
    $allowed = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
        'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf',
    ];
    $extension = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!isset($allowed[$extension])) {
        json_out(['error'=>'Upload a JPG, PNG, WEBP, GIF, or PDF payment proof.'], 400);
    }
    $mime = '';
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file($file['tmp_name']);
    }
    if ($mime !== '' && $mime !== $allowed[$extension]) {
        json_out(['error'=>'The payment proof content does not match its file type.'], 400);
    }
    $directory = dirname(__DIR__) . '/uploads/payment-proofs/';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        json_out(['error'=>'Payment proof storage is not available.'], 500);
    }
    if (!is_file($directory . '.htaccess')) {
        @file_put_contents($directory . '.htaccess', "Options -Indexes\nDeny from all\n");
    }
    $filename = 'proof_' . uuid() . '.' . $extension;
    $absolutePath = $directory . $filename;
    if (!move_uploaded_file($file['tmp_name'], $absolutePath)) {
        json_out(['error'=>'Payment proof could not be saved. Please try again.'], 500);
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


// ── Route matching ─────────────────────────────────────────────
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri    = preg_replace('#^/api#', '', $uri);
$uri    = rtrim($uri, '/') ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

$parts = explode('/', ltrim($uri, '/'));
$seg0  = $parts[0] ?? '';
$seg1  = $parts[1] ?? '';
$seg2  = $parts[2] ?? '';
$seg3  = $parts[3] ?? '';

try {

// ── GET /healthz ───────────────────────────────────────────────
if ($uri === '/healthz' && $method === 'GET') {
    json_out(['status'=>'ok']);
}

// ── GET /invitation/verify?code=xxx — public access check ─────
if ($uri === '/invitation/verify' && $method === 'GET') {
    $code = trim((string)($_GET['code'] ?? ''));
    if (!tt_valid_invitation_code_format($code)) {
        json_out(['valid' => false, 'error' => 'Enter a valid invitation code.'], 422);
    }
    json_out(['valid' => tt_invitation_code_matches($code)]);
}

// ── GET /plans ─────────────────────────────────────────────────
if ($uri === '/plans' && $method === 'GET') {
    $plans = [];
    foreach (PLANS as $id => $p) {
        $plans[] = [
            'id'      => $id,
            'label'   => $p['label'],
            'desc'    => $p['desc']   ?? '',
            'roiMin'  => $p['roiMin'],
            'roiMax'  => $p['roiMax'],
            'min'     => $p['min'],
            'max'     => $p['max'] ?? null,
            'cycle'   => $p['cycle'] ?? '30 days',
        ];
    }
    json_out(['plans' => $plans]);
}

// ── POST or GET /track — log domain clicks & visitor traffic ──
if ($uri === '/track') {
    $db = get_db();
    $b = body();
    if (empty($b) && !empty($_GET)) {
        $b = $_GET;
    }

    $ip = trim((string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''));
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }

    $ref = trim((string)($b['referrer'] ?? $_SERVER['HTTP_REFERER'] ?? ''));
    $landing = trim((string)($b['landing_page'] ?? $_SERVER['REQUEST_URI'] ?? '/'));
    $source = trim((string)($b['campaign_source'] ?? $b['source'] ?? $b['ref'] ?? ''));
    if ($source === '') {
        if (strpos($ref, 'google.') !== false) $source = 'google';
        elseif (strpos($ref, 'twitter.com') !== false || strpos($ref, 't.co') !== false || strpos($ref, 'x.com') !== false) $source = 'x/twitter';
        elseif (strpos($ref, 'facebook.com') !== false || strpos($ref, 'fb.com') !== false) $source = 'facebook';
        elseif (strpos($ref, 'instagram.com') !== false) $source = 'instagram';
        elseif (strpos($ref, 'telegram.') !== false || strpos($ref, 't.me') !== false) $source = 'telegram';
        elseif (strpos($ref, 'whatsapp.') !== false || strpos($ref, 'wa.me') !== false) $source = 'whatsapp';
        elseif ($ref !== '') $source = 'referral';
        else $source = 'direct';
    }

    $device = trim((string)($b['device_type'] ?? ''));
    if ($device === '') {
        $ua = strtolower((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
        $device = (strpos($ua, 'mobile') !== false || strpos($ua, 'android') !== false || strpos($ua, 'iphone') !== false) ? 'mobile' : 'desktop';
    }

    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);

    try {
        $st = $db->prepare('INSERT INTO analytics_clicks (ip_address, referrer, landing_page, campaign_source, device_type, user_agent) VALUES (?, ?, ?, ?, ?, ?)');
        $st->execute([substr($ip, 0, 45), substr($ref, 0, 500), substr($landing, 0, 255), substr($source, 0, 100), substr($device, 0, 20), $ua]);
    } catch (Exception $e) {}

    json_out(['success' => true]);
}

// ── GET /analytics-data — comprehensive analytics stats ────────
if ($uri === '/analytics-data' && $method === 'GET') {
    $db = get_db();

    $authPass = trim((string)($_GET['password'] ?? $_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? ''));
    $isAuthed = is_admin() || ($authPass !== '' && tt_admin_password_matches($authPass));

    $totalClicks = (int)$db->query('SELECT COUNT(*) FROM analytics_clicks')->fetchColumn();
    $uniqueVisitors = (int)$db->query('SELECT COUNT(DISTINCT ip_address) FROM analytics_clicks')->fetchColumn();
    $clicksToday = (int)$db->query('SELECT COUNT(*) FROM analytics_clicks WHERE created_at >= CURDATE()')->fetchColumn();

    $totalSignups = (int)$db->query('SELECT COUNT(*) FROM investor_accounts')->fetchColumn();
    $signupsToday = (int)$db->query('SELECT COUNT(*) FROM investor_accounts WHERE registered_at >= CURDATE()')->fetchColumn();

    $invRow = $db->query('SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as volume FROM investments')->fetch();
    $totalInvestments = (int)($invRow['count'] ?? 0);
    $totalVolume = (float)($invRow['volume'] ?? 0);

    $totalOrders = (int)$db->query('SELECT COUNT(*) FROM ev_orders')->fetchColumn();

    $sources = $db->query('SELECT campaign_source, COUNT(*) as count FROM analytics_clicks GROUP BY campaign_source ORDER BY count DESC LIMIT 10')->fetchAll();
    $devices = $db->query('SELECT device_type, COUNT(*) as count FROM analytics_clicks GROUP BY device_type ORDER BY count DESC')->fetchAll();
    $recentClicks = $db->query('SELECT id, ip_address, referrer, landing_page, campaign_source, device_type, created_at FROM analytics_clicks ORDER BY id DESC LIMIT 50')->fetchAll();

    $recentSignups = [];
    if ($isAuthed) {
        $recentSignups = $db->query('SELECT email, name, phone, onboarding_status, registered_at FROM investor_accounts ORDER BY registered_at DESC LIMIT 20')->fetchAll();
    } else {
        $raw = $db->query('SELECT email, name, onboarding_status, registered_at FROM investor_accounts ORDER BY registered_at DESC LIMIT 20')->fetchAll();
        foreach ($raw as $r) {
            $parts = explode('@', $r['email']);
            $masked = substr($parts[0], 0, 3) . '***@' . ($parts[1] ?? '');
            $recentSignups[] = [
                'email' => $masked,
                'name' => $r['name'],
                'onboarding_status' => $r['onboarding_status'],
                'registered_at' => $r['registered_at'],
            ];
        }
    }

    json_out([
        'authenticated' => $isAuthed,
        'summary' => [
            'total_clicks' => $totalClicks,
            'unique_visitors' => $uniqueVisitors,
            'clicks_today' => $clicksToday,
            'total_signups' => $totalSignups,
            'signups_today' => $signupsToday,
            'conversion_rate' => $totalClicks > 0 ? round(($totalSignups / $totalClicks) * 100, 2) : 0,
            'total_investments' => $totalInvestments,
            'investment_volume' => $totalVolume,
            'total_orders' => $totalOrders,
        ],
        'sources' => $sources,
        'devices' => $devices,
        'recent_clicks' => $recentClicks,
        'recent_signups' => $recentSignups,
    ]);
}

// ── GET /my-status?email=xxx ───────────────────────────────────
if ($uri === '/my-status' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!$email) json_out(['status'=>'none']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['status'=>'none']);
    }
    require_investor_session($email);
    $db = get_db();
    $stActive = $db->prepare(
        "SELECT id FROM investments WHERE user_email=? AND status='active' LIMIT 1"
    );
    $stActive->execute([$email]);
    if ($stActive->fetch()) json_out(['status'=>'active']);
    $st = $db->prepare(
        'SELECT id, status FROM investments WHERE user_email=? ORDER BY created_at DESC LIMIT 1'
    );
    $st->execute([$email]);
    $row = $st->fetch();
    if (!$row) json_out(['status'=>'none']);
    json_out(['status'=>$row['status'], 'id'=>$row['id']]);
}

// ── GET /transactions?email=xxx — investor transaction history ──
if ($uri === '/transactions' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['error'=>'A valid investor email is required'], 400);
    }
    require_investor_session($email);
    $db = get_db();
    $rows = [];

    $stLedger = $db->prepare(
        'SELECT id, investment_id, type, amount, method, status, reference_id, note, created_at
         FROM account_transactions
         WHERE LOWER(user_email)=?
         ORDER BY created_at DESC'
    );
    $stLedger->execute([$email]);
    foreach ($stLedger->fetchAll() as $row) {
        $rows[] = cast_transaction($row);
    }

    // Backfill the original investor deposit and older withdrawals from
    // installations that existed before the account ledger was introduced.
    $stInvestments = $db->prepare(
        "SELECT i.id, i.tx_id, i.total, i.method, i.status, i.created_at,
                i.payment_submitted_at
         FROM investments i
         WHERE LOWER(i.user_email)=? AND i.total > 0
           AND NOT EXISTS (
             SELECT 1 FROM account_transactions t
             WHERE t.reference_id=i.tx_id AND t.type='deposit'
           )"
    );
    $stInvestments->execute([$email]);
    foreach ($stInvestments->fetchAll() as $row) {
        $rows[] = cast_transaction([
            'id'            => 'legacy-deposit-' . $row['id'],
            'investment_id' => $row['id'],
            'type'          => 'deposit',
            'amount'        => $row['total'],
            'method'        => $row['method'],
            'status'        => $row['status'] === 'active' ? 'processed' : $row['status'],
            'reference_id'  => $row['tx_id'],
            'note'          => 'Initial investor deposit',
            'created_at'    => $row['payment_submitted_at'] ?: $row['created_at'],
        ]);
    }

    $stWithdrawals = $db->prepare(
        "SELECT w.id, w.investment_id, w.amount, w.method, w.status, w.created_at
         FROM withdrawals w
         INNER JOIN investments i ON i.id=w.investment_id
         WHERE LOWER(i.user_email)=?
           AND NOT EXISTS (
             SELECT 1 FROM account_transactions t
             WHERE t.reference_id=w.id AND t.type='withdrawal'
           )"
    );
    $stWithdrawals->execute([$email]);
    foreach ($stWithdrawals->fetchAll() as $row) {
        $rows[] = cast_transaction([
            'id'            => 'legacy-withdrawal-' . $row['id'],
            'investment_id' => $row['investment_id'],
            'type'          => 'withdrawal',
            'amount'        => $row['amount'],
            'method'        => $row['method'],
            'status'        => $row['status'],
            'reference_id'  => $row['id'],
            'note'          => 'Withdrawal request',
            'created_at'    => $row['created_at'],
        ]);
    }

    usort($rows, static fn(array $a, array $b): int =>
        strcmp((string)$b['createdAt'], (string)$a['createdAt'])
    );
    json_out($rows);
}

// ── GET /account-status?email=xxx ──────────────────────────────
if ($uri === '/account-status' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['account'=>false, 'investmentStatus'=>'none']);
    }
    require_investor_session($email);

    $db = get_db();
    $stAccount = $db->prepare('SELECT email, name, created_at FROM investor_accounts WHERE email=? LIMIT 1');
    $stAccount->execute([$email]);
    $account = $stAccount->fetch();

    $stInvestments = $db->prepare(
        "SELECT id, status, user_name, plan_id, plan_name, total, payment_submitted_at
         FROM investments WHERE LOWER(user_email)=?
         ORDER BY created_at DESC"
    );
    $stInvestments->execute([$email]);
    $investments = $stInvestments->fetchAll();
    $walletBalance = wallet_bonus_balance($db, $email);

    // Existing installations may predate investor_accounts. Treat any
    // investment record as an existing account for the gated flow.
    if (!$account && $investments) {
        $account = [
            'email' => $email,
            'name' => $investments[0]['user_name'] ?? $email,
            'created_at' => $investments[0]['created_at'] ?? null,
        ];
    }

    $activeInvestmentId = find_primary_active_investment_id($db, $email);
    $pendingPayments = [];
    $pendingDepositTotal = 0.00;
    foreach ($investments as $investment) {
        if (in_array($investment['status'], ['pending_approval', 'pending'], true)) {
            $amount = (float)$investment['total'];
            $pendingDepositTotal += $amount;
            $pendingPayments[] = [
                'id' => $investment['id'],
                'status' => $investment['status'],
                'planId' => $investment['plan_id'] ?? null,
                'planName' => $investment['plan_name'] ?? null,
                'amount' => $amount,
                'submittedAt' => $investment['payment_submitted_at'] ?? null,
            ];
        }
    }

    // An active portfolio always wins over a pending follow-up deposit.
    // Pending is an onboarding lock only when the investor has no active
    // investment yet.
    $status = $activeInvestmentId ? 'active' : 'none';
    foreach ($investments as $investment) {
        if ($status === 'active') break;
        if ($investment['status'] === 'pending_approval') {
            $status = 'pending_approval';
            break;
        }
        if ($investment['status'] === 'pending' && $status === 'none') {
            $status = 'pending';
        }
        if (in_array($investment['status'], ['declined', 'rejected', 'cancelled'], true)
            && $status === 'none') {
            $status = $investment['status'];
        }
    }

    $walletStmt = $db->prepare(
        "SELECT COALESCE(SUM(
             CASE WHEN total_current_value IS NULL OR total_current_value <= 0
                  THEN total ELSE total_current_value END
         ), 0)
         FROM investments
         WHERE LOWER(user_email)=? AND status='active'
           AND (deposit_parent_id IS NULL OR deposit_parent_id='')"
    );
    $walletStmt->execute([$email]);

    json_out([
        'account' => (bool)$account,
        'name' => $account['name'] ?? $email,
        'walletBalance' => $walletBalance,
        'welcomeBonus' => $walletBalance >= 100 ? 100.00 : 0.00,
        'investmentStatus' => $status,
        'hasActiveInvestment' => (bool)$activeInvestmentId,
        'activeInvestmentId' => $activeInvestmentId,
        'availableBalance' => round((float)$walletStmt->fetchColumn(), 2),
        'pendingDepositTotal' => round($pendingDepositTotal, 2),
        'pendingPayments' => $pendingPayments,
        'investments' => array_map(static function (array $investment): array {
            return [
                'id' => $investment['id'],
                'status' => $investment['status'],
                'planId' => $investment['plan_id'] ?? null,
                'planName' => $investment['plan_name'] ?? null,
                'total' => (float)$investment['total'],
                'submittedAt' => $investment['payment_submitted_at'] ?? null,
            ];
        }, $investments),
    ]);
}

// ── POST /auth/social-session — exchange a verified Supabase session
// for the site's server-side investor session. The access token is checked
// against Supabase; the browser cannot choose an arbitrary email.
if ($seg0 === 'auth' && $seg1 === 'social-session' && $method === 'POST') {
    $b = body();
    $accessToken = trim((string)($b['accessToken'] ?? ''));
    if (!$accessToken || strlen($accessToken) > 4096) {
        json_out(['success'=>false, 'message'=>'Social session token is required.'], 400);
    }

    $supabaseUrl = trim((string)(getenv('SUPABASE_URL') ?: ($_ENV['SUPABASE_URL'] ?? '')));
    $anonKey = trim((string)(getenv('SUPABASE_ANON_KEY') ?: ($_ENV['SUPABASE_ANON_KEY'] ?? '')));
    if (!$supabaseUrl || !$anonKey) {
        json_out(['success'=>false, 'message'=>'Supabase public configuration is missing on this server.'], 503);
    }

    $endpoint = rtrim($supabaseUrl, '/') . '/auth/v1/user';
    $headers = "apikey: {$anonKey}\r\nAuthorization: Bearer {$accessToken}\r\nAccept: application/json\r\n";
    $remote = false;
    $remoteStatus = 0;

    if (function_exists('curl_init')) {
        $curl = curl_init($endpoint);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $anonKey,
                'Authorization: Bearer ' . $accessToken,
                'Accept: application/json',
            ],
        ]);
        $remote = curl_exec($curl);
        $remoteStatus = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'GET',
            'timeout' => 8,
            'ignore_errors' => true,
            'header' => $headers,
        ]]);
        $remote = @file_get_contents($endpoint, false, $ctx);
        $statusLine = $http_response_header[0] ?? '';
        if (preg_match('/\s(\d{3})\s/', $statusLine, $match)) {
            $remoteStatus = (int)$match[1];
        }
    }

    $supabaseUser = is_string($remote) ? json_decode($remote, true) : null;
    $email = normalize_email((string)($supabaseUser['email'] ?? ''));
    if ($remoteStatus < 200 || $remoteStatus >= 300 || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['success'=>false, 'message'=>'Supabase could not verify this social account. Please try again.'], 401);
    }

    $metadata = is_array($supabaseUser['user_metadata'] ?? null) ? $supabaseUser['user_metadata'] : [];
    $name = trim((string)(
        $metadata['full_name'] ??
        $metadata['name'] ??
        $metadata['user_name'] ??
        $metadata['preferred_username'] ??
        $b['name'] ??
        strstr($email, '@', true)
    ));
    if (!$name) $name = $email;

    // A verified OAuth identity is also a valid account signup. Upserting the
    // lightweight account record makes social signup behave like email signup
    // without inventing a phone number, age, or password.
    $db = get_db();
    $accountCheck = $db->prepare('SELECT email FROM investor_accounts WHERE email=? LIMIT 1');
    $accountCheck->execute([$email]);
    $isNewAccount = !$accountCheck->fetch();
    if ($isNewAccount && !tt_invitation_code_matches((string)($b['invitationCode'] ?? ''))) {
        json_out([
            'success' => false,
            'message' => 'A valid invitation code is required to create a new account.',
        ], 403);
    }

    tt_start_session();
    session_regenerate_id(true);
    establish_investor_session($email);
    $_SESSION['social_auth_email'] = $email;
    $_SESSION['social_auth_provider'] = trim((string)($b['provider'] ?? 'social')) ?: 'social';

    $db->prepare(
        "INSERT INTO investor_accounts
         (email, name, phone, age, onboarding_status, deposit_match_eligible, registered_at)
         VALUES (?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE name=IF(VALUES(name)='', name, VALUES(name)), updated_at=NOW()"
    )->execute([$email, $name, '', 0, 'plan_selection', $isNewAccount ? 1 : 0]);
    $investmentCheck = $db->prepare(
        "SELECT status FROM investments WHERE LOWER(user_email)=?
         ORDER BY created_at DESC LIMIT 1"
    );
    $investmentCheck->execute([$email]);
    $investment = $investmentCheck->fetch();

    json_out([
        'success' => true,
        'email' => $email,
        'name' => $name,
        'provider' => $_SESSION['social_auth_provider'],
        'isNewAccount' => $isNewAccount,
        'investmentStatus' => $investment['status'] ?? 'none',
    ]);
}

// ── POST /accounts ─────────────────────────────────────────────
if ($uri === '/accounts' && $method === 'POST') {
    $b     = body();
    $email = normalize_email((string)($b['email'] ?? ''));
    $name  = trim($b['name']  ?? $email);
    $phone = trim((string)($b['phone'] ?? ''));
    $age   = (int)($b['age'] ?? 0);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['error'=>'A valid email is required'], 400);
    if (!$name) json_out(['error'=>'name required'], 400);
    $otpEmail = normalize_email((string)($_SESSION['otp_verified_email'] ?? ''));
    $socialEmail = normalize_email((string)($_SESSION['social_auth_email'] ?? ''));
    $hasOtpProof = $otpEmail === $email;
    $hasSocialProof = $socialEmail === $email && (string)($_SESSION['investor_email'] ?? '') === $email;
    if (!$hasOtpProof && !$hasSocialProof) {
        json_out(['error'=>'Verify your email before creating the account.'], 403);
    }
    $db = get_db();
    $existingAccount = $db->prepare('SELECT phone, age FROM investor_accounts WHERE email=? LIMIT 1');
    $existingAccount->execute([$email]);
    $existing = $existingAccount->fetch();
    $isNewAccount = !$existing;
    if ($isNewAccount && !tt_invitation_code_matches((string)($b['invitationCode'] ?? ''))) {
        json_out(['error'=>'A valid invitation code is required to create a new account.'], 403);
    }
    if (!$existing && (!$phone || $age < 18 || $age > 120)) {
        json_out(['error'=>'Phone number and age (18+) are required'], 400);
    }

    $db->prepare(
        "INSERT INTO investor_accounts
         (email, name, phone, age, onboarding_status, deposit_match_eligible, registered_at)
         VALUES (?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name),
           phone=IF(VALUES(phone)='', phone, VALUES(phone)),
           age=IF(VALUES(age)=0, age, VALUES(age)),
           updated_at=NOW()"
    )->execute([
        $email,
        $name,
        $phone ?: (string)($existing['phone'] ?? ''),
        $age ?: (int)($existing['age'] ?? 0),
        'plan_selection',
        $isNewAccount ? 1 : 0,
    ]);
    // Account creation completes the verified onboarding handoff. Establish
    // the server-side investor session here as well as during password setup,
    // because older signup/recovery screens only persisted ttinc_auth in the
    // browser before redirecting to plan selection.
    establish_investor_session($email);

    $st = $db->prepare(
        "SELECT id, status FROM investments WHERE user_email=? AND status='active' ORDER BY created_at DESC LIMIT 1"
    );
    $st->execute([$email]);
    $active = $st->fetch();
    if ($active) json_out(['status'=>'active', 'id'=>$active['id']]);

    $st2 = $db->prepare(
        "SELECT id, status FROM investments
         WHERE user_email=? AND status IN ('pending_approval','pending')
         ORDER BY created_at DESC LIMIT 1"
    );
    $st2->execute([$email]);
    $existing = $st2->fetch();
    if ($existing) json_out([
        'status' => $existing['status'],
        'id' => $existing['id'],
        'onboardingState' => 'pending_approval',
    ]);

    $welcome = send_onboarding_email_once(
        'welcome:' . $email,
        'welcome',
        $email,
        $name,
        'Welcome to Tesla Trade Inc',
        welcome_email_html($name)
    );
    if (empty($welcome['ok'])) {
        error_log('Tesla Wealth welcome email was not delivered for ' . $email);
    }

    json_out([
        'status' => 'created',
        'onboardingState' => 'plan_selection',
        'email' => $email,
        'name' => $name,
        'walletBalance' => wallet_bonus_balance($db, $email),
        'welcomeBonus' => 0.00,
        'depositMatchRatePercent' => 100,
        'depositMatchLimit' => 2,
    ]);
}

// ── GET /dbcheck ───────────────────────────────────────────────
if ($uri === '/dbcheck' && $method === 'GET') {
    require_admin();
    $missing = [];
    foreach ([
        'TT_DB_HOST' => DB_HOST,
        'TT_DB_NAME' => DB_NAME,
        'TT_DB_USER' => DB_USER,
        'TT_DB_PASS' => DB_PASS,
    ] as $name => $value) {
        if (trim((string)$value) === '') {
            $missing[] = $name;
        }
    }
    if ($missing) {
        json_out([
            'status' => 'failed',
            'error' => 'Hestia .htaccess database settings are missing: ' . implode(', ', $missing),
        ], 503);
    }
    if (!extension_loaded('pdo_mysql')) {
        json_out([
            'status' => 'failed',
            'error' => 'PDO MySQL is not enabled for this PHP version in Hestia.',
        ], 503);
    }
    try {
        $pdo = new PDO(
            'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
            DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        json_out(['status'=>'connected']);
    } catch (Exception $e) {
        error_log('Tesla Trade database check failed: ' . $e->getMessage());
        json_out([
            'status' => 'failed',
            'error' => 'MySQL rejected the connection.',
            'diagnostic' => tt_db_failure_category($e),
        ], 503);
    }
}

// ── POST /admin/login ──────────────────────────────────────────
if ($seg0 === 'admin' && $seg1 === 'login' && $method === 'POST') {
    $b = body();
    if (tt_admin_password_matches((string)($b['password'] ?? ''))) {
        session_regenerate_id(true);
        $_SESSION['admin_auth'] = true;
        json_out(['success'=>true, 'token'=>ADMIN_TOKEN]);
    }
    json_out(['success'=>false, 'message'=>'Invalid password'], 401);
}

// ── Invitation-code management (admin) ───────────────────────
if ($seg0 === 'admin' && $seg1 === 'invitation-codes'
    && $seg2 === '' && $method === 'GET') {
    require_admin();
    json_out(['codes' => tt_invitation_codes(get_db())]);
}

if ($seg0 === 'admin' && $seg1 === 'invitation-codes'
    && $seg2 === '' && $method === 'POST') {
    require_admin();
    $payload = body();
    $action = strtolower(trim((string)($payload['action'] ?? 'generate')));
    $db = get_db();
    try {
        if ($action === 'rotate') {
            $code = tt_rotate_invitation_codes($db);
            json_out(['success' => true, 'action' => 'rotate', 'code' => $code]);
        }
        if ($action === 'generate') {
            $code = tt_create_invitation_code(
                $db,
                $payload['code'] ?? null,
                'admin'
            );
            json_out(['success' => true, 'action' => 'generate', 'code' => $code]);
        }
        json_out(['success' => false, 'error' => 'Use generate or rotate.'], 422);
    } catch (Throwable $e) {
        $status = $e instanceof InvalidArgumentException ? 422 : 500;
        json_out(['success' => false, 'error' => $e->getMessage()], $status);
    }
}

if ($seg0 === 'admin' && $seg1 === 'invitation-codes'
    && $seg2 !== '' && $method === 'PATCH') {
    require_admin();
    $payload = body();
    $status = strtolower(trim((string)($payload['status'] ?? '')));
    try {
        $updated = tt_set_invitation_code_status(get_db(), (int)$seg2, $status);
        json_out(['success' => true, 'code' => $updated]);
    } catch (Throwable $e) {
        $httpStatus = $e instanceof InvalidArgumentException ? 422 : 404;
        json_out(['success' => false, 'error' => $e->getMessage()], $httpStatus);
    }
}

// ── POST /auth/login — investor email/password login ───────────
if ($seg0 === 'auth' && $seg1 === 'login' && $method === 'POST') {
    $b       = body();
    $email   = normalize_email((string)($b['email'] ?? ''));
    $password= (string)($b['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$password) {
        json_out(['success'=>false, 'message'=>'Enter a valid email and password.'], 400);
    }

    $db = get_db();
    $st = $db->prepare(
        'SELECT email, password_hash FROM investor_credentials WHERE LOWER(email)=? LIMIT 1'
    );
    $st->execute([$email]);
    $credential = $st->fetch();

    if (!$credential) {
        $stInvestor = $db->prepare(
            'SELECT user_name FROM investments WHERE LOWER(user_email)=? ORDER BY created_at DESC LIMIT 1'
        );
        $stInvestor->execute([$email]);
        $investor = $stInvestor->fetch();
        if (!$investor) {
            $stAccount = $db->prepare('SELECT name FROM investor_accounts WHERE email=? LIMIT 1');
            $stAccount->execute([$email]);
            $account = $stAccount->fetch();
            if ($account) $investor = ['user_name' => $account['name']];
        }
        if ($investor) {
            json_out([
                'success' => false,
                'needsPasswordSetup' => true,
                'message' => 'Set a password to activate email/password login for this account.',
            ], 200);
        }
        json_out(['success'=>false, 'message'=>'No investor account was found for this email.'], 404);
    }

    if (!password_verify($password, $credential['password_hash'])) {
        json_out(['success'=>false, 'message'=>'Invalid email or password.'], 401);
    }

    $stName = $db->prepare(
        'SELECT user_name FROM investments WHERE LOWER(user_email)=? ORDER BY created_at DESC LIMIT 1'
    );
    $stName->execute([$email]);
    $investor = $stName->fetch();
    if (!$investor) {
        $stAccountName = $db->prepare('SELECT name FROM investor_accounts WHERE LOWER(email)=? LIMIT 1');
        $stAccountName->execute([$email]);
        $accountName = $stAccountName->fetch();
        if ($accountName) $investor = ['user_name' => $accountName['name']];
    }
    // A browser session may expire while the password remains valid. Rotate
    // the session on every successful login and establish a fresh investor
    // session instead of treating the old session state as authentication.
    if (session_status() === PHP_SESSION_ACTIVE) @session_regenerate_id(true);
    establish_investor_session($email);
    json_out([
        'success' => true,
        'email'   => $email,
        'name'    => $investor['user_name'] ?? $email,
    ]);
}

// ── POST /auth/set-password — first-time investor setup ────────
if ($seg0 === 'auth' && $seg1 === 'set-password' && $method === 'POST') {
    $b       = body();
    $email   = normalize_email((string)($b['email'] ?? ''));
    $password= (string)($b['password'] ?? '');
    $verificationToken = trim((string)($b['verificationToken'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_out(['success'=>false, 'message'=>'Enter a valid email address.'], 400);
    }
    if (!valid_password($password)) {
        json_out(['success'=>false, 'message'=>'Password must be 8–255 characters.'], 400);
    }

    $db = get_db();
    if (!otp_verification_is_valid($db, $email, $verificationToken)) {
        json_out(['success'=>false, 'message'=>'Verify your email before setting a password.'], 403);
    }
    $stInvestor = $db->prepare(
        'SELECT user_name FROM investments WHERE LOWER(user_email)=? LIMIT 1'
    );
    $stInvestor->execute([$email]);
    $investor = $stInvestor->fetch();
    if (!$investor) {
        $stAccount = $db->prepare('SELECT name FROM investor_accounts WHERE email=? LIMIT 1');
        $stAccount->execute([$email]);
        $account = $stAccount->fetch();
        if ($account) $investor = ['user_name' => $account['name']];
    }
    if (!$investor) {
        json_out(['success'=>false, 'message'=>'No investor account was found for this email.'], 404);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->prepare(
        'INSERT INTO investor_credentials (email, password_hash) VALUES (?,?)
         ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), updated_at=NOW()'
    )->execute([$email, $hash]);
    establish_investor_session($email);
    clear_otp_verification();

    json_out([
        'success' => true,
        'email'   => $email,
        'name'    => $investor['user_name'] ?? $email,
    ]);
}

// ── GET /payment-settings ──────────────────────────────────────
if ($seg0 === 'payment-settings' && $method === 'GET') {
    $saved = [];
    try {
        $saved = get_setting('payment_settings', []);
    } catch (Throwable $e) {
        // Investor payment choices must remain visible even if the optional
        // saved-settings row cannot be read. Admin can repair the database
        // connection and replace the sample values later.
        error_log('Tesla Wealth payment settings read failed: ' . $e->getMessage());
    }
    /*
     * Always return the complete payment catalog. Older installations can
     * have a partial payment_settings JSON object (or no row at all), which
     * previously made the investor UI silently omit methods. Defaults are
     * intentionally non-functional sample details: the admin can replace
     * them without needing a database migration, and every method remains
     * visible while setup is being completed.
     */
    $defaults = [
        'usdt' => [
            'network' => 'TRC-20',
            'address' => WALLET_USDT ?: 'SAMPLE-USDT-ADDRESS-UPDATE-IN-ADMIN',
            'label' => 'Tether (USDT)',
        ],
        'eth' => [
            'network' => 'ERC-20',
            'address' => WALLET_ETH ?: 'SAMPLE-ETH-ADDRESS-UPDATE-IN-ADMIN',
            'label' => 'Ethereum (ETH)',
        ],
        'btc' => [
            'network' => 'Bitcoin',
            'address' => WALLET_BTC ?: 'SAMPLE-BTC-ADDRESS-UPDATE-IN-ADMIN',
            'label' => 'Bitcoin (BTC)',
        ],
        'bank' => [
            'name' => BANK_NAME ?: 'Sample Bank (Replace in Admin)',
            'account' => BANK_ACCOUNT ?: '0000000000',
            'routing' => BANK_ROUTING ?: '000000000',
            'swift' => BANK_SWIFT ?: 'SAMPLEXXX',
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
    $paymentSettings = [];
    foreach ($defaults as $key => $default) {
        $savedMethod = isset($saved[$key]) && is_array($saved[$key])
            ? array_filter($saved[$key], static fn($value) => trim((string)$value) !== '')
            : [];
        $paymentSettings[$key] = array_merge(
            $default,
            $savedMethod
        );
    }
    // Values entered in the .htaccess configuration block override older
    // admin-panel values so deployment configuration is deterministic.
    foreach (tt_payment_env_overrides() as $key => $fields) {
        foreach ($fields as $field => $value) {
            if (trim((string)$value) !== '') {
                $paymentSettings[$key][$field] = $value;
            }
        }
    }
    $usdt = $paymentSettings['usdt'];
    $eth = $paymentSettings['eth'];
    $btc = $paymentSettings['btc'];
    $bank = $paymentSettings['bank'];
    // The investor payment screen uses the long bank field names while the
    // admin settings form and older installs use the short names.
    $bank['bankName'] = $bank['bankName'] ?? ($bank['name'] ?? '');
    $bank['accountName'] = $bank['accountName'] ?? ($bank['name'] ?? '');
    $bank['accountNumber'] = $bank['accountNumber'] ?? ($bank['account'] ?? '');
    $bank['swift'] = $bank['swift'] ?? ($bank['swiftCode'] ?? '');
    json_out([
        'usdt'   => $usdt,
        'eth'    => $eth,
        'btc'    => $btc,
        'bank'   => $bank,
        'venmo'  => $paymentSettings['venmo'],
        'cashapp' => $paymentSettings['cashapp'],
        'paypal' => $paymentSettings['paypal'],
        'alipay' => $paymentSettings['alipay'],
        'wechat' => $paymentSettings['wechat'],
    ]);
}

// ── PATCH /payment-settings (admin) ───────────────────────────
if ($seg0 === 'payment-settings' && $method === 'PATCH') {
    require_admin();
    $b    = body();
    $cur  = get_setting('payment_settings', []);
    $cur  = array_merge($cur, array_filter($b, fn($v)=>is_array($v)));
    set_setting('payment_settings', $cur);
    json_out($cur);
}

// ── GET /referral-settings (admin) ────────────────────────────
if ($seg0 === 'referral-settings' && $method === 'GET') {
    require_admin();
    json_out(get_referral_settings());
}

// ── PATCH /referral-settings (admin) ─────────────────────────
if ($seg0 === 'referral-settings' && $method === 'PATCH') {
    require_admin();
    $b   = body();
    $cur = get_setting('referral_settings', []);
    if (isset($b['bonus_amount']))  $cur['bonus_amount']  = max(0, (float)$b['bonus_amount']);
    if (isset($b['maturity_days'])) $cur['maturity_days'] = max(1, (int)$b['maturity_days']);
    set_setting('referral_settings', $cur);
    json_out(['success'=>true, 'settings'=>get_referral_settings()]);
}

// ── GET /email-settings (admin) ───────────────────────────────
if ($seg0 === 'email-settings' && $seg1 === '' && $method === 'GET') {
    require_admin();
    $cfg = get_setting('email_settings', []);
    json_out($cfg);
}
if ($seg0 === 'email-settings' && $seg1 === '' && $method === 'PATCH') {
    require_admin();
    $b   = body();
    $cur = get_setting('email_settings', []);
    foreach (['senderName','senderEmail','replyTo','adminEmail'] as $k) {
        if (isset($b[$k])) $cur[$k] = $b[$k];
    }
    set_setting('email_settings', $cur);
    json_out(['success'=>true]);
}

// ── POST /admin/marketing-emails ──────────────────────────────
// Send marketing emails to investors based on type
if ($seg0 === 'admin' && $seg1 === 'marketing-emails' && $method === 'POST') {
    require_admin();
    $b    = body();
    $type = $b['type'] ?? ''; // 'no_deposit', 'referral_share', or 'all_investors'

    $db   = get_db();
    $sent = 0;
    $rs   = get_referral_settings();

    if ($type === 'no_deposit') {
        // Send to investors who have pending accounts but total=0 (never deposited)
        $rows = $db->query(
            "SELECT DISTINCT user_email, user_name FROM investments
             WHERE total=0 AND status IN ('pending','active')
             ORDER BY created_at DESC"
        )->fetchAll();
        foreach ($rows as $r) {
            if (marketing_email_sent_recently($r['user_email'], 'no_deposit', 7)) continue;
            $result = send_email(
                $r['user_email'], $r['user_name'],
                'Your Investment Account is Ready — Make Your First Deposit',
                marketing_no_deposit_email_html($r['user_name'], $r['user_email'])
            );
            if ($result['ok']) {
                log_marketing_email($r['user_email'], 'no_deposit');
                $sent++;
            }
        }
    } elseif ($type === 'referral_share') {
        // Send referral promotion email to all active investors
        $rows = $db->query(
            "SELECT DISTINCT user_email, user_name FROM investments
             WHERE status='active'
             ORDER BY created_at DESC"
        )->fetchAll();
        $bonusAmt = fmt_usd($rs['bonus_amount']);
        foreach ($rows as $r) {
            if (marketing_email_sent_recently($r['user_email'], 'referral_share', 14)) continue;
            $code = get_or_create_referral_code($r['user_email']);
            $siteProto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https' : 'http';
            $siteHost  = $_SERVER['HTTP_HOST'] ?? 'yourdomain.com';
            $link = $siteProto . '://' . $siteHost . '/?ref=' . $code;
            $result = send_email(
                $r['user_email'], $r['user_name'],
                'Earn ' . $bonusAmt . ' — Share Your Referral Code!',
                marketing_referral_email_html($r['user_name'], $code, $link, $bonusAmt)
            );
            if ($result['ok']) {
                log_marketing_email($r['user_email'], 'referral_share');
                $sent++;
            }
        }
    } elseif ($type === 'all_investors') {
        $subject = trim((string)($b['subject'] ?? ''));
        $message = trim((string)($b['message'] ?? ''));
        if ($subject === '' || $message === '') {
            json_out(['error' => 'subject and message are required'], 400);
        }
        $rows = $db->query(
            "SELECT DISTINCT user_email, user_name FROM investments
             WHERE user_email <> ''
             ORDER BY created_at DESC"
        )->fetchAll();
        foreach ($rows as $r) {
            if (marketing_email_sent_recently($r['user_email'], 'all_investors', 1)) continue;
            $result = send_email(
                $r['user_email'], $r['user_name'], $subject,
                custom_marketing_email_html($r['user_name'], $message)
            );
            if ($result['ok']) {
                log_marketing_email($r['user_email'], 'all_investors');
                $sent++;
            }
        }
    } else {
        json_out(['error'=>'type must be no_deposit, referral_share, or all_investors'], 400);
    }

    json_out(['success'=>true, 'sent'=>$sent]);
}

// ── GET/PATCH /telegram-settings (admin) ─────────────────────
if ($seg0 === 'telegram-settings' && $method === 'GET') {
    require_admin();
    $cfg = get_setting('telegram_settings', []);
    if (!empty($cfg['botToken'])) {
        $cfg['botTokenMasked'] = substr($cfg['botToken'], 0, 8) . '••••••••';
    }
    json_out($cfg);
}
if ($seg0 === 'telegram-settings' && $method === 'PATCH') {
    require_admin();
    $b   = body();
    $cur = get_setting('telegram_settings', []);
    foreach (['botToken','chatId'] as $k) {
        if (isset($b[$k]) && $b[$k] !== '') $cur[$k] = $b[$k];
    }
    set_setting('telegram_settings', $cur);
    json_out(['success'=>true]);
}

// ── POST /telegram-settings/test (admin) ─────────────────────
if ($seg0 === 'telegram-settings' && $seg1 === 'test' && $method === 'POST') {
    require_admin();
    $r = send_telegram("✅ <b>Tesla Trade Inc</b>\n\nYour Telegram notifications are working correctly!\n\n⏰ " . date('D, d M Y H:i:s') . ' UTC');
    json_out($r['ok'] ? ['success'=>true] : ['success'=>false,'error'=>$r['error']]);
}

// ── POST /email-settings/test (admin) ─────────────────────────
if ($seg0 === 'email-settings' && $seg1 === 'test' && $method === 'POST') {
    require_admin();
    $b  = body();
    $to = $b['to'] ?? (get_setting('email_settings',[])['senderEmail'] ?? SENDER_EMAIL);
    $r  = send_email($to, 'Admin', 'Tesla Trade Inc — Test Email',
          '<p style="font-family:sans-serif">Your email settings are working correctly.</p>');
    json_out($r['ok'] ? ['success'=>true] : ['success'=>false,'error'=>$r['error']]);
}

// ── GET /test-email (admin) ────────────────────────────────────
if ($seg0 === 'test-email' && $method === 'GET') {
    require_admin();
    $cfg  = get_setting('email_settings', []);
    $from = $cfg['senderEmail'] ?? SENDER_EMAIL;
    $to   = $_GET['to'] ?? $from;
    $r    = send_email($to, 'Admin', 'Tesla Trade Inc — Test Email',
                '<p style="font-family:sans-serif;font-size:16px">Your Resend email delivery is working correctly on Tesla Trade Inc.</p>');
    json_out($r['ok']
        ? ['ok'=>true,  'sent_to'=>$to, 'sender_used'=>$from]
        : ['ok'=>false, 'error'=>$r['error']]);
}

// ── POST /otp/send ─────────────────────────────────────────────
if ($seg0 === 'otp' && $seg1 === 'send' && $method === 'POST') {
    $b     = body();
    $email = trim($b['email'] ?? '');
    $name  = trim($b['name']  ?? 'Investor');
    if (!$email) json_out(['error'=>'email required'], 400);

    $code = gen_otp();
    try {
        $db = get_db();
        $stCount = $db->prepare(
            "SELECT COUNT(*) FROM otps WHERE email=? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)"
        );
        $stCount->execute([$email]);
        if ((int)$stCount->fetchColumn() >= 5) {
            json_out(['success'=>false, 'error'=>'Too many verification codes. Please wait before requesting another.'], 429);
        }
        clear_otp_verification();
    } catch (Throwable $e) {
        // Keep this response JSON and actionable on cPanel. The generic
        // top-level error otherwise hides a bad database name/user/password.
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
        json_out(['success' => false, 'error' => $message], 503);
    }
    $db->prepare("UPDATE otps SET used=1 WHERE email=? AND used=0")->execute([$email]);
    $db->prepare("INSERT INTO otps (email, code, expires_at, name) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)")
       ->execute([$email, $code, $name]);

    $mailResult = send_email($email, $name,
        'Your Tesla Trade Inc Verification Code',
        otp_email_html($name, $code));

    if (!$mailResult['ok']) {
        json_out([
            'success' => false,
            'error'   => 'We could not send the verification email. Please try again in a moment.',
        ], 502);
    }
    json_out(['success'=>true]);
}

// ── POST /otp/resend ───────────────────────────────────────────
if ($seg0 === 'otp' && $seg1 === 'resend' && $method === 'POST') {
    $b     = body();
    $email = trim($b['email'] ?? '');
    $name  = trim($b['name']  ?? 'Investor');
    if (!$email) json_out(['error'=>'email required'], 400);

    // Rate-limit: max 3 resends per hour per email
    $db = get_db();
    $stCount = $db->prepare(
        "SELECT COUNT(*) as c FROM otps WHERE email=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)"
    );
    $stCount->execute([$email]);
    $cnt = (int)($stCount->fetch()['c'] ?? 0);
    if ($cnt >= 5) {
        json_out(['error'=>'Too many OTP requests. Please wait 1 hour before trying again.'], 429);
    }

    $code = gen_otp();
    $db->prepare("UPDATE otps SET used=1 WHERE email=? AND used=0")->execute([$email]);
    $db->prepare("INSERT INTO otps (email, code, expires_at, name) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)")
       ->execute([$email, $code, $name]);

    $mailResult = send_email($email, $name,
        'Your Tesla Trade Inc Verification Code (Resent)',
        otp_email_html($name, $code));

    if (!$mailResult['ok']) {
        json_out([
            'success' => false,
            'error'   => 'We could not send the verification email. Please try again in a moment.',
        ], 502);
    }
    json_out(['success'=>true]);
}

// ── POST /otp/verify ───────────────────────────────────────────
if ($seg0 === 'otp' && $seg1 === 'verify' && $method === 'POST') {
    $b     = body();
    $email = trim($b['email'] ?? '');
    $code  = trim($b['code']  ?? '');
    if (!$email || !$code) json_out(['error'=>'email and code required'], 400);

    $db = get_db();
    $st = $db->prepare("SELECT * FROM otps WHERE email=? AND code=? AND used=0 AND expires_at >= NOW() ORDER BY created_at DESC LIMIT 1");
    $st->execute([$email, $code]);
    $row = $st->fetch();
    if (!$row) {
        // Give specific feedback: expired vs wrong code
        $stChk = $db->prepare(
            "SELECT used, expires_at FROM otps WHERE email=? AND code=? ORDER BY created_at DESC LIMIT 1"
        );
        $stChk->execute([$email, $code]);
        $chkRow = $stChk->fetch();
        if ($chkRow) {
            $msg = (int)$chkRow['used']
                ? 'This code has already been used. Please request a new code.'
                : 'This code has expired (valid for 24 hours). Please request a new code.';
        } else {
            $msg = 'Incorrect code. Please check the code sent to your email and try again.';
        }
        json_out(['success'=>false, 'message'=>$msg], 401);
    }

    $token = mark_otp_verified($db, $row, $email);
    json_out(['success'=>true, 'verificationToken'=>$token]);
}

// ── POST /support/transcript ───────────────────────────────────
if ($seg0 === 'support' && $seg1 === 'transcript' && $method === 'POST') {
    $b    = body();
    $email= normalize_email((string)($b['email'] ?? ''));
    $text = trim($b['transcript'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !$text) {
        json_out(['error'=>'A valid email and transcript are required'], 400);
    }
    require_active_investor($email);
    $name = trim((string)($b['name'] ?? 'Investor'));
    $db = get_db();
    $st = $db->prepare('SELECT name FROM investor_accounts WHERE email=? LIMIT 1');
    $st->execute([$email]);
    $account = $st->fetch();
    if ($account && !empty($account['name'])) $name = (string)$account['name'];
    if (!$name) $name = 'Investor';
    $text = substr($text, 0, 20000);
    $r = send_email($email, $name, 'Your Tesla Trade Inc Support Transcript',
                    transcript_email_html($name, $text));
    json_out(['success'=>$r['ok']]);
}

// ── POST /investments ─────────────────────────────────────────
if ($seg0 === 'investments' && $seg1 === '' && $method === 'POST') {
    $b = body();
    $paymentProof = null;
    foreach (['userEmail','portfolio','total','method'] as $f) {
        if (empty($b[$f])) json_out(['error'=>"$f required"], 400);
    }
    $planId = trim($b['planId'] ?? '');
    // Compatibility with the original compiled payment screen. It sends the
    // selected plan inside the portfolio array instead of sending planId and
    // does not include paymentConfirmed, even though the button is the
    // investor's explicit payment confirmation action.
    if (!$planId && is_array($b['portfolio'] ?? null)) {
        $legacyPlanId = trim((string)($b['portfolio'][0]['id'] ?? ''));
        if ($legacyPlanId) $planId = $legacyPlanId;
    }
    if (!$planId || !isset(PLANS[$planId])) json_out(['error'=>'A valid investment plan is required'], 400);
    $paymentConfirmed = !empty($b['paymentConfirmed'])
        || (is_array($b['portfolio'] ?? null) && !empty($b['portfolio'][0]['id']));
    if (!$paymentConfirmed) json_out(['error'=>'Payment confirmation is required'], 400);
    $plan = PLANS[$planId];
    if (!is_numeric($b['total'] ?? null)) {
        json_out(['error'=>'Enter a valid investment amount'], 400);
    }
    $total = (float)$b['total'];
    if (!is_finite($total) || $total <= 0) {
        json_out(['error'=>'Enter a valid investment amount'], 400);
    }
    $userEmail = normalize_email((string)$b['userEmail']);
    if (!filter_var($userEmail, FILTER_VALIDATE_EMAIL)) {
        json_out(['error'=>'A valid investor email is required'], 400);
    }
    $paymentMethod = trim((string)$b['method']);
    if (!tt_valid_payment_method($paymentMethod)) {
        json_out(['error'=>'Choose one of the available payment methods'], 400);
    }
    require_investor_session($userEmail);
    $proofFile = $_FILES['paymentProof'] ?? null;
    if (!is_array($proofFile) || (int)($proofFile['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        json_out(['error'=>'Upload your payment receipt before submitting the deposit.'], 400);
    }
    $paymentProof = save_payment_proof_upload($proofFile);
    $db = get_db();
    $stExistingPending = $db->prepare(
        "SELECT id, tx_id, status FROM investments
         WHERE user_email=? AND status='pending_approval'
         ORDER BY created_at DESC LIMIT 1"
    );
    $stExistingPending->execute([$userEmail]);
    $existingPending = $stExistingPending->fetch();
    if ($existingPending) {
        if ($paymentProof) {
            $paymentReference = trim((string)($b['paymentReference'] ?? '')) ?: null;
            $db->prepare(
                'UPDATE investments
                 SET payment_proof_path=?, payment_proof_name=?, payment_proof_mime=?,
                     payment_proof_size=?, payment_proof_uploaded_at=NOW(),
                     payment_reference=COALESCE(?, payment_reference)
                 WHERE id=?'
            )->execute([
                $paymentProof['path'], $paymentProof['name'], $paymentProof['mime'],
                $paymentProof['size'], $paymentReference, $existingPending['id'],
            ]);
            $detailsStmt = $db->prepare('SELECT user_name, user_email, portfolio, total, method, payment_reference FROM investments WHERE id=?');
            $detailsStmt->execute([$existingPending['id']]);
            $details = $detailsStmt->fetch() ?: [];
            telegram_payment_proof(
                (string)($details['user_name'] ?? 'Investor'),
                (string)($details['user_email'] ?? $userEmail),
                (string)($details['portfolio'] ?? ''),
                fmt_usd((float)($details['total'] ?? 0)),
                (string)($details['method'] ?? $paymentMethod),
                (string)($paymentReference ?? $details['payment_reference'] ?? ''),
                $paymentProof['absolutePath']
            );
        }
        json_out([
            'success' => true,
            'id' => $existingPending['id'],
            'txId' => $existingPending['tx_id'],
            'status' => 'pending_approval',
            'dashboardInvestmentId' => find_primary_active_investment_id($db, $userEmail),
            'alreadySubmitted' => true,
            'proofUploaded' => (bool)$paymentProof,
        ]);
    }
    $stAccount = $db->prepare('SELECT name, phone, age, onboarding_status FROM investor_accounts WHERE email=? LIMIT 1');
    $stAccount->execute([$userEmail]);
    $account = $stAccount->fetch();
    if (!$account) {
        json_out(['error'=>'Complete registration before submitting a payment'], 403);
    }
    $dashboardInvestmentId = find_primary_active_investment_id($db, $userEmail);
    $returningInvestor = (bool)$dashboardInvestmentId
        || (($account['onboarding_status'] ?? '') === 'active');
    $userName = trim((string)($account['name'] ?? $b['userName'] ?? 'Investor'));
    if (!$userName) $userName = 'Investor';
    if ($total < (float)$plan['min'] || ($plan['max'] !== null && $total > (float)$plan['max'])) {
        json_out(['error'=>'The amount is outside the selected plan range'], 400);
    }
    $portfolio = is_array($b['portfolio'])
        ? ($b['portfolio']['label'] ?? $b['portfolio']['id'] ?? json_encode($b['portfolio']))
        : (string)$b['portfolio'];

    $id      = uuid();
    $txId    = uuid();
    $refCode = trim($b['referralCode'] ?? '');
    // The account is normally created by the verified registration flow.
    // Keep this upsert for legacy users and payment retries, but do not
    // overwrite the verified phone/age fields with blank values.
    $db->prepare(
        'INSERT INTO investor_accounts
         (email, name, phone, age, onboarding_status)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), updated_at=NOW()'
    )->execute([
        $userEmail,
        $userName,
        trim((string)($account['phone'] ?? $b['phone'] ?? '')),
        (int)($account['age'] ?? $b['age'] ?? 0),
        $returningInvestor ? 'active' : 'pending_approval',
    ]);
    $paymentReference = trim((string)($b['paymentReference'] ?? '')) ?: null;
    try {
        $db->prepare('INSERT INTO investments
            (id,tx_id,user_id,user_name,user_email,portfolio,total,method,status,referral_code,
             plan_id,plan_name,projected_roi,payment_confirmed,payment_reference,
             payment_proof_path,payment_proof_name,payment_proof_mime,payment_proof_size,
             payment_proof_uploaded_at,payment_submitted_at,pending_approval_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),NOW())')
           ->execute([$id,$txId,$userEmail,$userName,$userEmail,
                      $portfolio,$total,$paymentMethod,'pending_approval',$refCode ?: null,
                      $planId,$plan['label'],(float)$plan['roiMax'],1,$paymentReference,
                      $paymentProof['path'] ?? null, $paymentProof['name'] ?? null,
                      $paymentProof['mime'] ?? null, $paymentProof['size'] ?? null]);
    } catch (PDOException $metadataError) {
        // Some existing cPanel databases predate the payment metadata
        // migration. The payment itself must still be recorded in the
        // original columns, rather than becoming the generic client error.
        error_log('Tesla Wealth payment metadata insert fallback: ' . $metadataError->getMessage());
        $db->prepare('INSERT INTO investments
            (id,tx_id,user_id,user_name,user_email,portfolio,total,method,status)
            VALUES (?,?,?,?,?,?,?,?,?)')
           ->execute([$id,$txId,$userEmail,$userName,$userEmail,
                      $portfolio,$total,$paymentMethod,'pending_approval']);
    }
    record_account_transaction(
        $db, $id, $userEmail, 'deposit', $total, $paymentMethod,
        'pending_approval', $txId, 'Investor deposit'
    );
    if (!$returningInvestor) {
        $db->prepare(
            "UPDATE investor_accounts SET onboarding_status='pending_approval', updated_at=NOW() WHERE email=?"
        )->execute([$userEmail]);
    }

    $amountFmt = fmt_usd($total);

    if ($refCode && $total > 0) {
        credit_referral_commission($userEmail, $id, $total, 'Initial deposit');
        credit_referral_bonus_to_referred($userEmail, $id);
    }

    $pendingEmail = send_onboarding_email_once(
        'pending_deposit:' . $id,
        'pending_deposit',
        $userEmail, $userName,
        'Payment Received — Pending Approval | Tesla Trade Inc',
        pending_deposit_email_html($userName, $amountFmt, $portfolio, $paymentMethod),
        $id
    );
    if (empty($pendingEmail['ok'])) {
        error_log('Tesla Wealth pending deposit email was not delivered for ' . $id);
    }
    $adminEmail = send_onboarding_email_once(
        'admin_alert:' . $id,
        'admin_pending_deposit',
        ADMIN_EMAIL,
        'Admin',
        'New Payment Pending Approval — Tesla Trade Inc',
        admin_signup_email_html($userName, $userEmail, $portfolio, $amountFmt, $paymentMethod),
        $id
    );
    if (empty($adminEmail['ok'])) {
        error_log('Tesla Wealth admin pending deposit email was not delivered for ' . $id);
    }
    telegram_new_registration(
        $userName, $userEmail,
         $portfolio, $amountFmt, $paymentMethod
    );
    if ($paymentProof) {
        telegram_payment_proof(
            $userName, $userEmail, $portfolio, $amountFmt, $paymentMethod,
            (string)($paymentReference ?? ''), $paymentProof['absolutePath']
        );
    }

    // If referral bonus credited, email the referred user
    if ($refCode) {
        try {
            $rs = get_referral_settings();
            $stRef = $db->prepare('SELECT * FROM referral_bonuses WHERE investment_id=?');
            $stRef->execute([$id]);
            $bonus = $stRef->fetch();
            if ($bonus) {
                $bonusFmt = fmt_usd($bonus['bonus_amount']);
                $matDate  = date('F j, Y', strtotime($bonus['matured_at']));
                send_email(
                    $userEmail, $userName,
                    'You Got a ' . $bonusFmt . ' Referral Bonus! — Tesla Trade Inc',
                    referral_bonus_email_html(
                        $userName, $bonusFmt, $bonus['referrer_email'],
                        (int)$bonus['maturity_days'], $matDate
                    )
                );
            }
        } catch (Throwable $e) { /* non-fatal */ }
    }

    json_out([
        'success' => true,
        'id' => $id,
        'txId' => $txId,
        'status' => 'pending_approval',
        'dashboardInvestmentId' => $dashboardInvestmentId ?: $id,
        'proofUploaded' => (bool)$paymentProof,
    ]);
}

// ── GET /investments (admin) ──────────────────────────────────
if ($seg0 === 'investments' && $seg1 === '' && $method === 'GET') {
    $db    = get_db();
    $email = trim($_GET['email'] ?? '');
    if ($email !== '') {
        require_active_investor(normalize_email($email));
        $st = $db->prepare('SELECT * FROM investments WHERE user_email=? ORDER BY created_at DESC');
        $st->execute([$email]);
        json_out(array_map('cast_investment', $st->fetchAll()));
    }
    require_admin();
    $rows = $db->query('SELECT * FROM investments ORDER BY created_at DESC')->fetchAll();
    json_out(array_map('cast_investment', $rows));
}

// ── GET /investments/:id ──────────────────────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === '' && $method === 'GET') {
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $row = $st->fetch();
    if (!$row) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$row['user_email']));
    $out = cast_investment($row);
    // The portfolio screen calls portfolio.map()/reduce(). The DB column is a
    // plain text label, which made the page crash to a blank screen right
    // after approval. Expose a list here (single-investment route only; other
    // routes still use the text label as the plan name).
    if (!is_array($out['portfolio'] ?? null)) {
        $out['portfolio'] = [[
            'id' => 'tsla',
            'name' => 'Tesla, Inc.',
            'ticker' => 'TSLA',
            'investedAmount' => (float)$out['total'],
        ]];
    }
    json_out($out);
}

// ── GET /investments/:id/chart-data ──────────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === 'chart-data' && $method === 'GET') {
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));

    $total   = (float)$inv['total'];
    $roi     = $inv['roi_percent'] !== null ? (float)$inv['roi_percent'] : 0;
    $start   = strtotime($inv['created_at']);
    $now     = time();
    $profMin = (float)($inv['profit_min'] ?? 0.5);
    $lossMin = (float)($inv['loss_min']  ?? 0.3);

    $days = max(1, (int)(($now - $start) / 86400));
    $days = min($days, 365);

    mt_srand(crc32($inv['id']));

    $points = [];
    $value  = $total;
    for ($i = 0; $i <= $days; $i++) {
        $date = date('Y-m-d', $start + $i * 86400);
        if ($i === 0) {
            $points[] = ['date'=>$date,'value'=>round($value,2),'day'=>$i];
            continue;
        }
        $dailyTarget = $roi > 0 ? ($roi / 100) / 365 : 0;
        $noise       = (mt_rand(-100, 100) / 100) * (($profMin + $lossMin) / 100 / 2);
        $value       = $value * (1 + $dailyTarget + $noise);
        $value       = max($value, $total * 0.70);
        if ($i === $days && $inv['roi_percent'] !== null) {
            $value = (float)($inv['total_current_value'] ?: $total * (1 + $roi / 100));
        }
        $points[] = ['date'=>$date,'value'=>round($value,2),'day'=>$i];
    }

    $first    = $points[0]['value'];
    $last     = end($points)['value'];
    $gainLoss = round($last - $first, 2);
    $gainPct  = $first > 0 ? round(($gainLoss / $first) * 100, 2) : 0;

    json_out([
        'investmentId' => $inv['id'],
        'total'  => $total,
        'roi'    => $roi,
        'points' => $points,
        'summary'=> [
            'startValue'   => $first,
            'currentValue' => $last,
            'gainLoss'     => $gainLoss,
            'gainPct'      => $gainPct,
            'isGain'       => $gainLoss >= 0,
        ],
    ]);
}

// ── POST /investments/:id/trading/start ───────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === 'trading'
    && $seg3 === 'start' && $method === 'POST') {
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));
    if (($inv['trading_status'] ?? 'idle') === 'active') {
        json_out(['error'=>'A trade is already active for this account.'], 409);
    }
    $payload = body();
    $amount = round((float)($payload['amount'] ?? 0), 2);
    $available = trading_account_balance($inv);
    if ($available <= 0) {
        json_out(['error'=>'You have no available funds. Top up your account before starting a trade.'], 409);
    }
    if ($amount <= 0 || $amount > $available) {
        json_out(['error'=>'Enter an amount within your available balance.'], 422);
    }
    $db->prepare(
        "UPDATE investments
         SET trading_status='active', trading_amount=?, trading_current_value=?,
             trading_started_at=NOW(), trading_updated_at=NOW()
         WHERE id=?"
    )->execute([$amount, $amount, $seg1]);
    $st->execute([$seg1]);
    $updated = $st->fetch();
    $state = trading_value_at($updated, time());
    json_out([
        'success' => true,
        'investment' => cast_investment($updated),
        'trade' => $state,
    ]);
}

// ── GET /investments/:id/trading-state ────────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === 'trading-state' && $method === 'GET') {
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));
    $state = trading_value_at($inv, time());
    if (($inv['trading_status'] ?? 'idle') === 'active') {
        $db->prepare('UPDATE investments SET trading_current_value=?, trading_updated_at=NOW() WHERE id=?')
           ->execute([$state['tradeValue'], $seg1]);
    }
    json_out([
        'investmentId' => $seg1,
        'trade' => $state,
    ]);
}

// ── POST /investments/:id/trading/stop ─────────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === 'trading'
    && $seg3 === 'stop' && $method === 'POST') {
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));
    if (($inv['trading_status'] ?? 'idle') !== 'active') {
        json_out(['error'=>'There is no active trade to stop.'], 409);
    }

    $activeTrade = trading_value_at($inv, time());
    $accountBalance = trading_account_balance($inv);
    $tradeAmount = (float)($inv['trading_amount'] ?? 0);
    $finalTradeValue = (float)($activeTrade['tradeValue'] ?? $tradeAmount);
    // Return the stopped trade and its P/L to the portfolio balance, then
    // clear the live-trade fields so the investor can start again later.
    $newBalance = round(max(0, $accountBalance - $tradeAmount + $finalTradeValue), 2);
    $db->prepare(
        "UPDATE investments
         SET total_current_value=?, trading_status='idle', trading_amount=0,
             trading_current_value=0, trading_started_at=NULL, trading_updated_at=NOW()
         WHERE id=?"
    )->execute([$newBalance, $seg1]);

    $tradePnl = round($finalTradeValue - $tradeAmount, 2);
    if (abs($tradePnl) >= 0.01) {
        $tradeType = $tradePnl > 0 ? 'profit' : 'loss';
        $tradeLabel = $tradePnl > 0 ? 'Trading profit' : 'Trading loss';
        record_account_transaction(
            $db,
            $seg1,
            (string)$inv['user_email'],
            $tradeType,
            abs($tradePnl),
            'Trading',
            'processed',
            'trade-' . uuid(),
            $tradeLabel . ' from the completed trade'
        );
    }

    $st->execute([$seg1]);
    $updated = $st->fetch();
    json_out([
        'success' => true,
        'stoppedTradeValue' => round($finalTradeValue, 2),
        'portfolioBalance' => $newBalance,
        'investment' => cast_investment($updated),
        'trade' => trading_value_at($updated, time()),
    ]);
}

// ── GET/POST /admin/trading-settings ──────────────────────────
if ($seg0 === 'admin' && $seg1 === 'trading-settings' && $method === 'GET') {
    require_admin();
    json_out(['settings' => trading_settings()]);
}
if ($seg0 === 'admin' && $seg1 === 'trading-settings' && $method === 'POST') {
    require_admin();
    $payload = body();
    $settings = [
        'profitIntervalSeconds' => max(1, min(86400, (int)($payload['profitIntervalSeconds'] ?? 10))),
        'lossIntervalSeconds'   => max(1, min(86400, (int)($payload['lossIntervalSeconds'] ?? 10))),
        'profitRatePercent'     => max(0, min(100, (float)($payload['profitRatePercent'] ?? 0.5))),
        'lossRatePercent'       => max(0, min(100, (float)($payload['lossRatePercent'] ?? 0.3))),
    ];
    set_setting('trading_settings', $settings);
    json_out(['success' => true, 'settings' => $settings]);
}

// ── PATCH /investments/:id (admin) ────────────────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === '' && $method === 'PATCH') {
    require_admin();
    $b  = body();
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);

    $allowed = ['status','earnings','total_current_value','roi_percent',
                'profit_min','loss_min','can_withdraw','kyc_status'];
    $sets = []; $vals = [];
    foreach ($allowed as $col) {
        $key = lcfirst(str_replace('_', '', ucwords($col,'_')));
        if (array_key_exists($key, $b) || array_key_exists($col, $b)) {
            $v = $b[$col] ?? $b[$key];
            $sets[] = "$col=?";
            $vals[] = ($col === 'can_withdraw') ? (int)(bool)$v : $v;
        }
    }
    if (isset($b['roiPercent']) && $b['roiPercent'] !== '' && $b['roiPercent'] !== null) {
        $roi = (float)$b['roiPercent'];
        $tcv = round((float)$inv['total'] * (1 + $roi/100), 2);
        $sets[] = 'roi_percent=?';        $vals[] = $roi;
        $sets[] = 'total_current_value=?'; $vals[] = $tcv;
        $sets[] = 'earnings=?';           $vals[] = round($tcv - (float)$inv['total'], 2);
    }
    if ($sets) {
        $vals[] = $seg1;
        $db->prepare('UPDATE investments SET ' . implode(',', $sets) . ' WHERE id=?')->execute($vals);
    }

    if (isset($b['status']) && $b['status'] !== $inv['status']) {
        $newStatus = $b['status'];
        if (in_array($newStatus, ['active','declined','rejected','cancelled'], true)
            && $inv['status'] !== 'pending_approval') {
            json_out(['error'=>'Only pending_approval investments can be approved or declined'], 409);
        }
        $amtFmt    = fmt_usd((float)$inv['total']);
        if ($newStatus === 'active') {
            $db->prepare("UPDATE investments SET status=?, activated_at=NOW() WHERE id=?")
               ->execute([$newStatus, $seg1]);
            // Approval must move the paid principal into the same
            // current-value field used by the investor dashboard.
            sync_approved_investment_balance($db, $seg1);
            merge_approved_deposit_into_primary($db, $seg1);
            $db->prepare(
                "UPDATE investor_accounts SET onboarding_status='active', activated_at=NOW() WHERE email=?"
            )->execute([$inv['user_email']]);
            send_onboarding_email_once(
                'activation:' . $seg1,
                'activation',
                $inv['user_email'], $inv['user_name'],
                'Your Account is Now Approved & Active — Tesla Trade Inc',
                approval_email_html($inv['user_name'], $amtFmt, $inv['portfolio']),
                $seg1
            );
        } elseif (in_array($newStatus, ['declined','rejected','cancelled'], true)) {
            if (!find_primary_active_investment_id($db, (string)$inv['user_email'])) {
                $db->prepare(
                    "UPDATE investor_accounts SET onboarding_status='declined', updated_at=NOW() WHERE email=?"
                )->execute([$inv['user_email']]);
            }
            send_email($inv['user_email'], $inv['user_name'],
                'Investment Application Update — Tesla Trade Inc',
                declined_email_html($inv['user_name'], $amtFmt, $inv['portfolio']));
            $db->prepare('UPDATE investments SET status=? WHERE id=?')
               ->execute([$newStatus, $seg1]);
        }
        $db->prepare(
            'UPDATE account_transactions SET status=? WHERE reference_id=? AND type=?'
        )->execute([
            $newStatus === 'active' ? 'processed' : $newStatus,
            $inv['tx_id'],
            'deposit',
        ]);
        if ($newStatus === 'active') {
            $matchedBonus = credit_deposit_match_bonus($db, $inv);
            if ($matchedBonus > 0) {
                $bonusFmt = fmt_usd($matchedBonus);
                send_email(
                    $inv['user_email'],
                    $inv['user_name'],
                    'Your 100% Deposit Match Was Added — Tesla Trade Inc',
                    '<p>Your approved deposit of ' . fmt_usd((float)$inv['total']) .
                    ' qualified for a 100% bonus match. We added ' . $bonusFmt .
                    ' to your account.</p><p>This promotion applies to your first two approved deposits only.</p>'
                );
            }
        }
        send_admin_email(
            ($newStatus === 'active' ? '✅' : '❌') . ' Investment ' . ucfirst($newStatus) . ' — ' . $inv['user_name'],
            admin_investment_status_email_html(
                $inv['user_name'], $inv['user_email'],
                $inv['portfolio'], $amtFmt, $newStatus)
        );
        telegram_investment_status(
            $inv['user_name'], $inv['user_email'],
            $inv['portfolio'], $amtFmt, $newStatus);
    }

    if (isset($b['roiPercent']) && $b['roiPercent'] !== '' && $b['roiPercent'] !== null) {
        $updatedInvSt = $db->prepare('SELECT * FROM investments WHERE id=?');
        $updatedInvSt->execute([$seg1]);
        $updatedInv = $updatedInvSt->fetch();
        if ($updatedInv) {
            $principalFmt = fmt_usd((float)$updatedInv['total']);
            $tcvFmt       = fmt_usd((float)$updatedInv['total_current_value']);
            $earnFmt      = fmt_usd((float)$updatedInv['earnings']);
            $roiVal       = number_format((float)$updatedInv['roi_percent'], 2);
            send_email($updatedInv['user_email'], $updatedInv['user_name'],
                'Your Portfolio Has Been Updated — Tesla Trade Inc',
                roi_update_email_html($updatedInv['user_name'], $updatedInv['portfolio'],
                    $principalFmt, $roiVal, $tcvFmt, $earnFmt));
            send_admin_email('📈 ROI Updated — ' . $updatedInv['user_name'],
                admin_roi_update_email_html($updatedInv['user_name'], $updatedInv['user_email'],
                    $updatedInv['portfolio'], $principalFmt, $roiVal, $tcvFmt));
        }
    }

    if (array_key_exists('can_withdraw', $b) || array_key_exists('canWithdraw', $b)) {
        $newCanWithdraw = isset($b['can_withdraw']) ? (bool)$b['can_withdraw']
                        : (isset($b['canWithdraw']) ? (bool)$b['canWithdraw'] : false);
        $wasEnabled = !(bool)$inv['can_withdraw'];
        if ($newCanWithdraw && $wasEnabled) {
            $tcvFmt2 = fmt_usd((float)($inv['total_current_value'] ?: $inv['total']));
            send_email($inv['user_email'], $inv['user_name'],
                'Withdrawals Now Available on Your Account — Tesla Trade Inc',
                withdrawal_enabled_email_html($inv['user_name'], $inv['portfolio'], $tcvFmt2));
        }
        $amtFmt2 = fmt_usd((float)$inv['total']);
        send_admin_email(
            ($newCanWithdraw ? '🔓' : '🔒') . ' Withdraw Access ' . ($newCanWithdraw ? 'Enabled' : 'Disabled') . ' — ' . $inv['user_name'],
            admin_withdraw_toggle_email_html($inv['user_name'], $inv['user_email'], $amtFmt2, $newCanWithdraw)
        );
    }

    $st2 = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st2->execute([$seg1]);
    json_out(cast_investment($st2->fetch()));
}

// ── GET /withdrawal-eligibility?investmentId=xxx&amount=xxx ────
if ($uri === '/withdrawal-eligibility' && $method === 'GET') {
    $investmentId = trim((string)($_GET['investmentId'] ?? ''));
    $requestedAmount = is_numeric($_GET['amount'] ?? null)
        ? (float)$_GET['amount']
        : 0.00;
    if (!$investmentId) json_out(['error'=>'investmentId is required'], 400);
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$investmentId]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));
    if ($requestedAmount < 0 || !is_finite($requestedAmount)) {
        json_out(['error'=>'Withdrawal amount must be a valid number'], 400);
    }
    $eligibility = withdrawal_eligibility($db, $inv, $requestedAmount);
    json_out([
        'investmentId' => $investmentId,
        'eligibility' => $eligibility,
    ]);
}

// ── POST /withdrawal-deposits ─────────────────────────────────
// Submit the deposit calculated for a requested withdrawal. It is
// represented as a pending investment so the existing admin approval
// queue and deposit ledger remain the single source of truth.
if ($seg0 === 'withdrawal-deposits' && $seg1 === '' && $method === 'POST') {
    json_out([
        'error' => 'Upfront payment is not required to request a withdrawal.',
        'requiresUpfrontPayment' => false,
    ], 410);

    $b = body();
    $investmentId = trim((string)($b['investmentId'] ?? ''));
    $amount = round((float)($b['amount'] ?? 0), 2);
    $withdrawalAmount = round((float)($b['withdrawalAmount'] ?? 0), 2);
    $paymentMethod = trim((string)($b['method'] ?? ''));
    if (!$investmentId || $amount <= 0 || $withdrawalAmount <= 0) {
        json_out(['error'=>'investmentId, withdrawalAmount, and deposit amount are required'], 400);
    }
    if (!tt_valid_payment_method($paymentMethod)) {
        json_out(['error'=>'Choose one of the available payment methods'], 400);
    }

    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$investmentId]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Investment not found'], 404);
    require_active_investor(normalize_email((string)$inv['user_email']));

    $eligibility = withdrawal_eligibility($db, $inv, $withdrawalAmount);
    // This route intentionally exits above. The old implementation accepted
    // money and created a fake second investment before allowing withdrawal.
}

// ── POST /withdrawals ─────────────────────────────────────────
if ($seg0 === 'withdrawals' && $seg1 === '' && $method === 'POST') {
    $b  = body();
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$b['investmentId'] ?? '']);
    $inv = $st->fetch();
    if (!$inv) {
        json_out([
            'error' => "You don't have any active investments. Fund an active account before requesting a withdrawal.",
            'active_investment_required' => true,
        ], 403);
    }
    require_active_investor(normalize_email((string)$inv['user_email']));

    $amount = (float)($b['amount'] ?? 0);
    if (!is_finite($amount) || $amount <= 0) {
        json_out(['error'=>'Withdrawal amount must be greater than zero.'], 400);
    }

    $eligibility = withdrawal_eligibility($db, $inv, $amount);
    if ($amount > $eligibility['availableBalance']) {
        json_out([
            'error'=>'Withdrawal amount exceeds your available portfolio value.',
            'eligibility'=>$eligibility,
        ], 400);
    }
    $kycStatus = $inv['kyc_status'] ?? 'none';
    if ($kycStatus !== 'verified') {
        if ($kycStatus === 'none') {
            json_out(['error'=>'Complete identity verification before requesting a withdrawal.', 'kyc_required'=>true, 'eligibility'=>$eligibility], 403);
        } elseif ($kycStatus === 'pending') {
            json_out(['error'=>'Your KYC verification is under review. Withdrawals will be enabled once your identity has been verified by our team.', 'kyc_pending'=>true, 'eligibility'=>$eligibility], 403);
        } elseif ($kycStatus === 'rejected') {
            json_out(['error'=>'Your KYC submission was rejected. Please resubmit your documents on the KYC page.', 'kyc_rejected'=>true, 'eligibility'=>$eligibility], 403);
        } else {
            json_out(['error'=>'KYC verification is required before you can withdraw. Please complete your identity verification.', 'kyc_required'=>true, 'eligibility'=>$eligibility], 403);
        }
    }
    if (!$inv['can_withdraw']) {
        json_out(['error'=>'Withdrawals are not yet enabled for your account. Please contact support or wait for your investment term to mature.', 'eligibility'=>$eligibility], 403);
    }
    $methodName = trim((string)($b['method'] ?? ''));
    if (!$methodName || strlen($methodName) > 50) json_out(['error'=>'A valid withdrawal method is required.'], 400);

    $id            = uuid();
    // The compiled client used `destination` while the original API only
    // accepted `walletAddress`. Accept both names during the transition and
    // keep the value in the durable withdrawal record.
    $walletAddress = trim((string)($b['walletAddress'] ?? ($b['destination'] ?? '')));
    if ($walletAddress === '' || strlen($walletAddress) > 255) {
        json_out(['error'=>'Receiving wallet or bank details are required (maximum 255 characters).'], 400);
    }
    $db->prepare('INSERT INTO withdrawals (id,investment_id,user_id,user_name,amount,method,wallet_address)
                  VALUES (?,?,?,?,?,?,?)')
       ->execute([$id,$b['investmentId'],$inv['user_id'],$inv['user_name'],
                  $amount,$methodName,$walletAddress]);
    record_account_transaction(
        $db, $b['investmentId'], $inv['user_email'], 'withdrawal', $amount,
        $methodName, 'pending', $id, 'Withdrawal request'
    );

    $wdAmtFmt = fmt_usd($amount);
    $wdMethod = $methodName;

    send_email($inv['user_email'], $inv['user_name'],
        'Withdrawal Request Received — Tesla Trade Inc',
        withdrawal_request_confirm_email_html($inv['user_name'], $wdAmtFmt, $wdMethod));
    send_admin_email(
        '💸 New Withdrawal Request — ' . $inv['user_name'],
        admin_withdrawal_request_email_html($inv['user_name'],
            $inv['user_email'], $wdAmtFmt, $wdMethod));
    telegram_withdrawal_request($inv['user_name'], $inv['user_email'], $wdAmtFmt, $wdMethod);

    json_out([
        'success'=>true,
        'id'=>$id,
        'withdrawalAmount'=>$amount,
        'requiredDeposit'=>$eligibility['requiredDeposit'],
        'depositConfirmed'=>true,
    ]);
}

// ── GET /withdrawals (admin) ──────────────────────────────────
if ($seg0 === 'withdrawals' && $seg1 === '' && $method === 'GET') {
    require_admin();
    $db   = get_db();
    $statusFilter = $_GET['status'] ?? '';
    if ($statusFilter === 'pending') {
        $rows = $db->query("SELECT w.*, i.user_email FROM withdrawals w LEFT JOIN investments i ON i.id=w.investment_id WHERE w.status='pending' ORDER BY w.created_at DESC")->fetchAll();
    } elseif ($statusFilter === 'completed') {
        $rows = $db->query("SELECT w.*, i.user_email FROM withdrawals w LEFT JOIN investments i ON i.id=w.investment_id WHERE w.status IN ('processed','declined') ORDER BY w.created_at DESC")->fetchAll();
    } else {
        $rows = $db->query('SELECT w.*, i.user_email FROM withdrawals w LEFT JOIN investments i ON i.id=w.investment_id ORDER BY w.created_at DESC')->fetchAll();
    }
    json_out(array_map('cast_withdrawal', $rows));
}

// ── PATCH /withdrawals/:id (admin) ────────────────────────────
if ($seg0 === 'withdrawals' && $seg1 !== '' && $method === 'PATCH') {
    require_admin();
    $b  = body();
    $db = get_db();

    $stGet = $db->prepare('SELECT w.*, i.user_name, i.user_email
                            FROM withdrawals w
                            LEFT JOIN investments i ON i.id = w.investment_id
                            WHERE w.id=?');
    $stGet->execute([$seg1]);
    $wdraw = $stGet->fetch();

    $newStatus = (string)($b['status'] ?? 'processed');
    if (!in_array($newStatus, ['pending', 'processed', 'declined'], true)) {
        json_out(['error'=>'status must be pending, processed, or declined'], 400);
    }
    if (!$wdraw) json_out(['error'=>'Not found'], 404);
    $db->prepare('UPDATE withdrawals SET status=? WHERE id=?')->execute([$newStatus, $seg1]);
    $db->prepare(
        'UPDATE account_transactions SET status=? WHERE reference_id=? AND type=?'
    )->execute([$newStatus, $seg1, 'withdrawal']);

    if ($wdraw && !empty($wdraw['user_email'])) {
        $wdAmtFmt2 = fmt_usd((float)$wdraw['amount']);
        send_email($wdraw['user_email'], $wdraw['user_name'] ?? 'Investor',
            'Withdrawal Update — Tesla Trade Inc',
            withdrawal_email_html($wdraw['user_name'] ?? 'Investor', $wdAmtFmt2, $newStatus));
        send_admin_email(
            ($newStatus === 'processed' ? '✅' : '❌') . ' Withdrawal ' . ucfirst($newStatus) . ' — ' . ($wdraw['user_name'] ?? 'Investor'),
            admin_withdrawal_status_email_html($wdraw['user_name'] ?? 'Investor',
                $wdraw['user_email'], $wdAmtFmt2, $newStatus));
    }
    json_out(['success'=>true]);
}

// ── POST /investments/:id/add-funds (admin) ──────────────────
if ($seg0 === 'investments' && $seg1 !== '' && $seg2 === 'add-funds' && $method === 'POST') {
    require_admin();
    $b      = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_out(['error'=>'amount must be positive'], 400);
    $db = get_db();
    $st = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st->execute([$seg1]);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Not found'], 404);

    $new_total = round((float)$inv['total'] + $amount, 2);
    if ($inv['roi_percent'] !== null) {
        $roi          = (float)$inv['roi_percent'];
        $new_tcv      = round($new_total * (1 + $roi/100), 2);
        $new_earnings = round($new_tcv - $new_total, 2);
        $db->prepare('UPDATE investments SET total=?,total_current_value=?,earnings=? WHERE id=?')
           ->execute([$new_total, $new_tcv, $new_earnings, $seg1]);
    } else {
        $db->prepare('UPDATE investments SET total=?,total_current_value=? WHERE id=?')
           ->execute([$new_total, $new_total, $seg1]);
    }
    record_account_transaction(
        $db, $seg1, $inv['user_email'], 'deposit', $amount,
        'Admin adjustment', 'processed', null, trim((string)($b['note'] ?? 'Admin funds added'))
    );

    $addedFmt  = fmt_usd($amount);
    $newTotFmt = fmt_usd($new_total);

    // First deposit email — only send once
    $isFirstDeposit = ((float)$inv['total'] == 0) && $amount > 0 && !$inv['first_deposit_emailed'];
    if ($isFirstDeposit) {
        send_email($inv['user_email'], $inv['user_name'],
            'First Deposit Received — Tesla Trade Inc',
            first_deposit_email_html($inv['user_name'], $addedFmt, $inv['portfolio']));
        $db->prepare('UPDATE investments SET first_deposit_emailed=1 WHERE id=?')->execute([$seg1]);
    }

    send_email($inv['user_email'], $inv['user_name'],
        'Funds Deposited to Your Account — Tesla Trade Inc',
        deposit_email_html($inv['user_name'], $addedFmt, $newTotFmt, $b['note'] ?? ''));
    send_admin_email('💰 Funds Added — ' . $inv['user_name'],
        admin_funds_added_email_html($inv['user_name'], $inv['user_email'], $addedFmt, $newTotFmt));
    telegram_funds_added($inv['user_name'], $inv['user_email'], $addedFmt, $newTotFmt);

    credit_referral_commission($inv['user_email'], $seg1, $amount, 'Additional deposit');
    if ($isFirstDeposit) {
        credit_referral_bonus_to_referred($inv['user_email'], $seg1);
        // Send referral bonus email if applicable
        try {
            $stBon = $db->prepare('SELECT * FROM referral_bonuses WHERE investment_id=?');
            $stBon->execute([$seg1]);
            $bonus = $stBon->fetch();
            if ($bonus) {
                $bonusFmt = fmt_usd($bonus['bonus_amount']);
                $matDate  = date('F j, Y', strtotime($bonus['matured_at']));
                send_email($inv['user_email'], $inv['user_name'],
                    'You Got a ' . $bonusFmt . ' Referral Bonus! — Tesla Trade Inc',
                    referral_bonus_email_html($inv['user_name'], $bonusFmt, $bonus['referrer_email'],
                        (int)$bonus['maturity_days'], $matDate));
            }
        } catch (Throwable $e) {}
    }

    $st2 = $db->prepare('SELECT * FROM investments WHERE id=?');
    $st2->execute([$seg1]);
    json_out(cast_investment($st2->fetch()));
}

// ── GET /referral/code?email=xxx ──────────────────────────────
if ($seg0 === 'referral' && $seg1 === 'code' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!$email) json_out(['error'=>'email required'], 400);
    require_investor_session($email);
    $code    = get_or_create_referral_code($email);
    $siteUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on' ? 'https' : 'http')
               . '://' . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com');
    json_out(['code'=>$code, 'link'=>$siteUrl.'/?ref='.$code]);
}

// ── GET /referral/dashboard?email=xxx ────────────────────────
if ($seg0 === 'referral' && $seg1 === 'dashboard' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!$email) json_out(['error'=>'email required'], 400);
    require_investor_session($email);
    $db   = get_db();

    $code    = get_or_create_referral_code($email);
    $siteUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on' ? 'https' : 'http')
               . '://' . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com');

    $st = $db->prepare('SELECT COALESCE(SUM(commission),0) as total_earned, COUNT(*) as total_deposits
                         FROM referral_earnings WHERE referrer_email=?');
    $st->execute([$email]);
    $agg = $st->fetch();

    $st2 = $db->prepare('SELECT COUNT(DISTINCT referred_email) as unique_referrals FROM referral_earnings WHERE referrer_email=?');
    $st2->execute([$email]);
    $uniq = $st2->fetch();

    $st3 = $db->prepare('SELECT re.referred_email, re.deposit_amount, re.commission, re.note, re.created_at,
                                 i.user_name as referred_name
                          FROM referral_earnings re
                          LEFT JOIN investments i ON i.id = re.investment_id
                          WHERE re.referrer_email=?
                          ORDER BY re.created_at DESC LIMIT 30');
    $st3->execute([$email]);
    $earnings = $st3->fetchAll();

    // Referral bonus for this user (as a referred user)
    $stBon = $db->prepare('SELECT * FROM referral_bonuses WHERE referred_email=? LIMIT 1');
    $stBon->execute([$email]);
    $myBonus = $stBon->fetch();

    $rs = get_referral_settings();

    json_out([
        'code'             => $code,
        'link'             => $siteUrl.'/?ref='.$code,
        'total_earned'     => (float)$agg['total_earned'],
        'total_deposits'   => (int)$agg['total_deposits'],
        'unique_referrals' => (int)$uniq['unique_referrals'],
        'earnings'         => array_map(function($r) {
            $r['commission']     = (float)$r['commission'];
            $r['deposit_amount'] = (float)$r['deposit_amount'];
            return $r;
        }, $earnings),
        'my_bonus' => $myBonus ? [
            'amount'       => (float)$myBonus['bonus_amount'],
            'matured_at'   => $myBonus['matured_at'],
            'matured'      => strtotime($myBonus['matured_at']) <= time(),
            'maturity_days'=> (int)$myBonus['maturity_days'],
        ] : null,
        'settings' => $rs,
    ]);
}

// ── GET /referral/leaderboard (admin) ────────────────────────
if ($seg0 === 'referral' && $seg1 === 'leaderboard' && $method === 'GET') {
    require_admin();
    $db   = get_db();
    $rows = $db->query(
        'SELECT referrer_email,
                COUNT(DISTINCT referred_email) as unique_refs,
                COUNT(*) as total_deposits,
                COALESCE(SUM(commission),0) as total_earned
         FROM referral_earnings
         GROUP BY referrer_email
         ORDER BY total_earned DESC LIMIT 100'
    )->fetchAll();
    json_out(array_map(function($r) {
        $r['total_earned'] = (float)$r['total_earned'];
        $r['unique_refs']  = (int)$r['unique_refs'];
        return $r;
    }, $rows));
}

// ── POST /kyc  (investor submits KYC — multipart form data) ──
if ($seg0 === 'kyc' && $seg1 === '' && $method === 'POST') {
    $investmentId = trim($_POST['investmentId'] ?? '');
    $userEmail    = normalize_email((string)($_POST['userEmail'] ?? ''));
    $userName     = '';
    $fullName     = trim($_POST['fullName']     ?? '');
    $dob          = trim($_POST['dateOfBirth']  ?? '');
    $nationality  = trim($_POST['nationality']  ?? '');
    $address      = trim($_POST['address']      ?? '');
    $idType       = trim($_POST['idType']       ?? '');
    $idNumber     = trim($_POST['idNumber']     ?? '');

    if (!$investmentId || !$userEmail) json_out(['error'=>'investmentId and userEmail required'], 400);
    require_investor_session($userEmail);
    if (!$fullName || !$dob || !$address || !$idType || !$idNumber) {
        json_out(['error'=>'All personal details are required'], 400);
    }

    $db = get_db();

    $stInv = $db->prepare('SELECT * FROM investments WHERE id=? AND LOWER(user_email)=?');
    $stInv->execute([$investmentId, $userEmail]);
    $inv = $stInv->fetch();
    if (!$inv) json_out(['error'=>'Investment not found'], 404);
    $userEmail = normalize_email((string)$inv['user_email']);
    $userName = trim((string)$inv['user_name']);
    $stExist = $db->prepare("SELECT id, status FROM kyc_submissions WHERE investment_id=? AND status IN ('pending','verified') ORDER BY created_at DESC LIMIT 1");
    $stExist->execute([$investmentId]);
    $exist = $stExist->fetch();
    if ($exist && $exist['status'] === 'verified') {
        json_out(['error'=>'KYC already verified for this account'], 400);
    }
    if ($exist && $exist['status'] === 'pending') {
        json_out(['error'=>'KYC is already under review. Please wait for admin verification.'], 400);
    }

    $uploadDir = __DIR__ . '/../uploads/kyc/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
        file_put_contents($uploadDir . '.htaccess', "Options -Indexes\nDeny from all\n");
    }

    $selfie_path = '';
    $video_path  = '';
    $id_doc_path = '';

    $selfie_path = save_kyc_upload(
        $_FILES['selfie'] ?? [], 'selfie',
        ['jpg','jpeg','png','webp','heic'],
        ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/octet-stream'],
        10 * 1024 * 1024, 'Selfie photo', $uploadDir
    );
    $id_doc_path = '';
    if (!empty($_FILES['id_doc'])) {
        $id_doc_path = save_kyc_upload(
            $_FILES['id_doc'], 'id_doc',
            ['jpg','jpeg','png','webp','heic','pdf'],
            ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','application/octet-stream'],
            10 * 1024 * 1024, 'ID document', $uploadDir
        );
    }
    $video_path = save_kyc_upload(
        $_FILES['video'] ?? [], 'video',
        ['mp4','mov','webm','avi','3gp','m4v'],
        ['video/mp4','video/quicktime','video/webm','video/x-msvideo','video/3gpp','application/octet-stream'],
        100 * 1024 * 1024, 'Verification video', $uploadDir
    );

    $id = uuid();
    $db->prepare(
        'INSERT INTO kyc_submissions (id,investment_id,user_email,user_name,full_name,date_of_birth,nationality,address,id_type,id_number,id_doc_path,selfie_path,video_path,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([$id,$investmentId,$userEmail,$userName,$fullName,$dob,$nationality,$address,$idType,$idNumber,$id_doc_path,$selfie_path,$video_path,'pending']);

    $db->prepare("UPDATE investments SET kyc_status='pending' WHERE id=?")->execute([$investmentId]);

    try {
        send_admin_email(
            '🪪 New KYC Submission — ' . $userName,
            kyc_admin_email_html($userName, $userEmail, $fullName, $dob, $nationality, $idType, $idNumber, $address)
        );
        send_telegram("🪪 <b>New KYC Submission</b>\n\n👤 <b>{$userName}</b>\n📧 {$userEmail}\n🆔 {$idType}: {$idNumber}\n\nLog in to admin panel to verify.");
    } catch (Throwable $e) { /* non-fatal */ }

    json_out(['success'=>true, 'id'=>$id]);
}

// ── GET /kyc?investmentId=xxx — investor checks own KYC status
if ($seg0 === 'kyc' && $seg1 === '' && $method === 'GET' && isset($_GET['investmentId'])) {
    $investmentId = trim($_GET['investmentId']);
    $db = get_db();
    $stInv = $db->prepare('SELECT user_email FROM investments WHERE id=?');
    $stInv->execute([$investmentId]);
    $inv = $stInv->fetch();
    if (!$inv) json_out(['error'=>'Investment not found'], 404);
    require_investor_session(normalize_email((string)$inv['user_email']));
    $st = $db->prepare("SELECT id, status, admin_note, created_at FROM kyc_submissions WHERE investment_id=? ORDER BY created_at DESC LIMIT 1");
    $st->execute([$investmentId]);
    $row = $st->fetch();
    if (!$row) json_out(['status'=>'none']);
    json_out(['status'=>$row['status'], 'adminNote'=>$row['admin_note'], 'submittedAt'=>$row['created_at']]);
}

// ── GET /admin/kyc (admin) — list all KYC submissions ────────
if ($seg0 === 'admin' && $seg1 === 'kyc' && $seg2 === '' && $method === 'GET') {
    require_admin();
    $db   = get_db();
    $rows = $db->query('SELECT * FROM kyc_submissions ORDER BY created_at DESC')->fetchAll();
    json_out($rows);
}

// ── PATCH /admin/kyc/:id (admin) — approve or reject KYC ─────
if ($seg0 === 'admin' && $seg1 === 'kyc' && $seg2 !== '' && $method === 'PATCH') {
    require_admin();
    $b      = body();
    $kycId  = $seg2;
    $status = $b['status'] ?? '';
    $note   = $b['adminNote'] ?? '';

    if (!in_array($status, ['verified','rejected'])) {
        json_out(['error'=>'status must be verified or rejected'], 400);
    }

    $db = get_db();
    $st = $db->prepare('SELECT * FROM kyc_submissions WHERE id=?');
    $st->execute([$kycId]);
    $kyc = $st->fetch();
    if (!$kyc) json_out(['error'=>'Not found'], 404);
    $stInv = $db->prepare('SELECT * FROM investments WHERE id=?');
    $stInv->execute([$kyc['investment_id']]);
    $kycInvestment = $stInv->fetch();
    if (!$kycInvestment) json_out(['error'=>'Investment not found'], 404);
    $db->prepare('UPDATE kyc_submissions SET status=?, admin_note=? WHERE id=?')
       ->execute([$status, $note, $kycId]);

    $db->prepare(
        "UPDATE investments
         SET kyc_status=?,
             can_withdraw=CASE WHEN ?='verified' THEN 1 ELSE 0 END
         WHERE id=?"
    )->execute([$status, $status, $kyc['investment_id']]);

    try {
        if ($status === 'verified') {
            send_email($kyc['user_email'], $kyc['user_name'],
                '✅ KYC Verified — Tesla Trade Inc',
                kyc_approved_email_html($kyc['user_name']));
        } else {
            send_email($kyc['user_email'], $kyc['user_name'],
                '❌ KYC Update — Tesla Trade Inc',
                kyc_rejected_email_html($kyc['user_name'], $note));
        }
    } catch (Throwable $e) { /* non-fatal */ }

    json_out(['success'=>true]);
}

// ── POST /vehicle-orders — public shop checkout ----------------
// The storefront uses manual payment methods today. This endpoint records a
// customer order and its installment schedule so support/admin can reconcile
// the first and subsequent payments instead of losing the order in chat.
if ($uri === '/vehicle-orders' && $method === 'POST') {
    $b = body();
    $catalog = vehicle_catalog();
    $colors = vehicle_color_options();
    $vehicleId = trim((string)($b['vehicleId'] ?? ''));
    $colorId = trim((string)($b['colorId'] ?? 'white'));
    $name = trim((string)($b['customerName'] ?? ''));
    $email = normalize_email((string)($b['customerEmail'] ?? ''));
    $phone = trim((string)($b['customerPhone'] ?? ''));
    $paymentType = ($b['paymentType'] ?? 'full') === 'installment' ? 'installment' : 'full';
    $months = (int)($b['installmentMonths'] ?? 1);
    $methodName = trim((string)($b['paymentMethod'] ?? ''));

    if (!isset($catalog[$vehicleId]) || !isset($colors[$colorId])) {
        json_out(['error'=>'Choose a valid vehicle and color'], 400);
    }
    if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$phone) {
        json_out(['error'=>'Name, email, and phone are required'], 400);
    }
    if (!tt_valid_payment_method($methodName)) {
        json_out(['error'=>'Choose one of the available payment methods'], 400);
    }
    if ($paymentType === 'full') {
        $months = 1;
    } elseif (!in_array($months, [12, 24, 36], true)) {
        json_out(['error'=>'Choose a 12, 24, or 36 month installment plan'], 400);
    }

    $total = round($catalog[$vehicleId]['base'] + $colors[$colorId]['adj'], 2);
    $installmentAmount = round($total / $months, 2);
    $orderId = uuid();
    $db = get_db();
    $db->prepare(
        'INSERT INTO vehicle_orders
         (id,customer_name,customer_email,customer_phone,vehicle_id,vehicle_name,
          vehicle_color,vehicle_total,payment_type,installment_months,
          installment_amount,payment_method,payment_reference)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $orderId, $name, $email, $phone, $vehicleId, $catalog[$vehicleId]['name'],
        $colors[$colorId]['name'], $total, $paymentType, $months,
        $installmentAmount, $methodName, strtoupper($vehicleId) . ' ' . strtoupper($colorId) . ' ORDER',
    ]);

    json_out([
        'success' => true,
        'orderId' => $orderId,
        'status' => 'pending_payment',
        'vehicle' => $catalog[$vehicleId]['name'],
        'total' => $total,
        'paymentType' => $paymentType,
        'installmentMonths' => $months,
        'installmentAmount' => $installmentAmount,
        'firstPaymentAmount' => $installmentAmount,
        'paymentReference' => strtoupper($vehicleId) . ' ' . strtoupper($colorId) . ' ORDER',
    ]);
}

// ── POST /financing-applications — public vehicle pre-qualification ----
if ($uri === '/financing-applications' && $method === 'POST') {
    $b = body();
    $catalog = vehicle_catalog();
    $colors = vehicle_color_options();
    $vehicleId = trim((string)($b['vehicleId'] ?? ''));
    $colorId = trim((string)($b['colorId'] ?? 'white'));
    $name = trim((string)($b['customerName'] ?? ''));
    $email = normalize_email((string)($b['customerEmail'] ?? ''));
    $phone = trim((string)($b['customerPhone'] ?? ''));
    $dob = trim((string)($b['dateOfBirth'] ?? ''));
    $street = trim((string)($b['streetAddress'] ?? ''));
    $city = trim((string)($b['city'] ?? ''));
    $stateRegion = trim((string)($b['stateRegion'] ?? ''));
    $postal = trim((string)($b['postalCode'] ?? ''));
    $country = trim((string)($b['country'] ?? ''));
    $employment = trim((string)($b['employmentStatus'] ?? ''));
    $annualIncome = (float)($b['annualIncome'] ?? 0);
    $housing = trim((string)($b['housingStatus'] ?? ''));
    $monthlyHousing = (float)($b['monthlyHousing'] ?? 0);
    $downPayment = (float)($b['downPayment'] ?? 0);
    $termMonths = (int)($b['termMonths'] ?? 60);
    $creditConsent = !empty($b['creditConsent']) ? 1 : 0;
    $allowedEmployment = ['employed', 'self_employed', 'retired', 'student', 'other'];
    $allowedHousing = ['rent', 'own', 'living_with_family', 'other'];
    $dobDate = DateTime::createFromFormat('!Y-m-d', $dob);
    $dobValid = $dobDate && $dobDate->format('Y-m-d') === $dob;

    if (!isset($catalog[$vehicleId]) || !isset($colors[$colorId])) {
        json_out(['error'=>'Choose a valid vehicle and color'], 400);
    }
    if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$phone) {
        json_out(['error'=>'Name, email, and phone are required'], 400);
    }
    if (!$dobValid || $dobDate > new DateTime('-18 years') || $dobDate < new DateTime('-100 years')) {
        json_out(['error'=>'Applicants must provide a valid date of birth and be at least 18'], 400);
    }
    if (!$street || !$city || !$stateRegion || !$postal || !$country) {
        json_out(['error'=>'Complete residential address is required'], 400);
    }
    if (!in_array($employment, $allowedEmployment, true) || !in_array($housing, $allowedHousing, true)) {
        json_out(['error'=>'Choose valid employment and housing details'], 400);
    }
    if ($annualIncome < 0 || $monthlyHousing < 0 || $downPayment < 0) {
        json_out(['error'=>'Income, housing, and down payment values cannot be negative'], 400);
    }
    $total = round($catalog[$vehicleId]['base'] + $colors[$colorId]['adj'], 2);
    if ($downPayment > $total) {
        json_out(['error'=>'Down payment cannot exceed the vehicle price'], 400);
    }
    if (!in_array($termMonths, [36, 48, 60, 72], true)) {
        json_out(['error'=>'Choose a 36, 48, 60, or 72 month term'], 400);
    }
    if (!$creditConsent) {
        json_out(['error'=>'Consent is required before submitting a financing application'], 400);
    }

    $application = [
        'id' => uuid(),
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'date_of_birth' => $dob,
        'street_address' => $street,
        'city' => $city,
        'state_region' => $stateRegion,
        'postal_code' => $postal,
        'country' => $country,
        'employment_status' => $employment,
        'annual_income' => round($annualIncome, 2),
        'housing_status' => $housing,
        'monthly_housing' => round($monthlyHousing, 2),
        'vehicle_id' => $vehicleId,
        'vehicle_name' => $catalog[$vehicleId]['name'],
        'vehicle_color' => $colors[$colorId]['name'],
        'vehicle_total' => $total,
        'down_payment' => round($downPayment, 2),
        'term_months' => $termMonths,
        'credit_consent' => $creditConsent,
        'status' => 'pending',
    ];
    $db = get_db();
    $db->prepare(
        'INSERT INTO financing_applications
         (id,customer_name,customer_email,customer_phone,date_of_birth,street_address,
          city,state_region,postal_code,country,employment_status,annual_income,
          housing_status,monthly_housing,vehicle_id,vehicle_name,vehicle_color,
          vehicle_total,down_payment,term_months,credit_consent,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $application['id'], $application['customer_name'], $application['customer_email'],
        $application['customer_phone'], $application['date_of_birth'], $application['street_address'],
        $application['city'], $application['state_region'], $application['postal_code'],
        $application['country'], $application['employment_status'], $application['annual_income'],
        $application['housing_status'], $application['monthly_housing'], $application['vehicle_id'],
        $application['vehicle_name'], $application['vehicle_color'], $application['vehicle_total'],
        $application['down_payment'], $application['term_months'], $application['credit_consent'],
        $application['status'],
    ]);
    telegram_financing_application($application);
    send_admin_email(
        '🚘 New Vehicle Financing Application — ' . $application['customer_name'],
        '<p>A new financing application was submitted for ' . htmlspecialchars($application['vehicle_name']) .
        ' (' . htmlspecialchars($application['customer_email']) . '). Review it in the admin dashboard.</p>'
    );
    json_out([
        'success' => true,
        'applicationId' => $application['id'],
        'status' => 'pending',
        'vehicle' => $application['vehicle_name'],
        'total' => $total,
        'termMonths' => $termMonths,
    ]);
}

// ── GET/PATCH /admin/financing-applications ----------------------------
if ($seg0 === 'admin' && $seg1 === 'financing-applications' && $seg2 === '' && $method === 'GET') {
    require_admin();
    $db = get_db();
    json_out($db->query('SELECT * FROM financing_applications ORDER BY created_at DESC')->fetchAll());
}
if ($seg0 === 'admin' && $seg1 === 'financing-applications' && $seg2 !== '' && $method === 'PATCH') {
    require_admin();
    $b = body();
    $status = (string)($b['status'] ?? '');
    $note = trim((string)($b['adminNote'] ?? ''));
    if (!in_array($status, ['approved', 'declined'], true)) {
        json_out(['error'=>'Financing status must be approved or declined'], 400);
    }
    $db = get_db();
    $st = $db->prepare('SELECT * FROM financing_applications WHERE id=?');
    $st->execute([$seg2]);
    $application = $st->fetch();
    if (!$application) json_out(['error'=>'Financing application not found'], 404);
    if ($application['status'] !== 'pending') {
        json_out(['error'=>'Only pending financing applications can be reviewed'], 409);
    }
    $db->prepare('UPDATE financing_applications SET status=?, admin_note=? WHERE id=?')
       ->execute([$status, $note !== '' ? $note : null, $seg2]);
    $application['status'] = $status;
    $application['admin_note'] = $note;
    telegram_financing_status($application, $status);
    json_out(['success'=>true, 'status'=>$status, 'applicationId'=>$seg2]);
}

// ── GET /admin/vehicle-orders and PATCH /admin/vehicle-orders/:id
if ($seg0 === 'admin' && $seg1 === 'vehicle-orders' && $seg2 === '' && $method === 'GET') {
    require_admin();
    $db = get_db();
    $rows = $db->query('SELECT * FROM vehicle_orders ORDER BY created_at DESC')->fetchAll();
    json_out($rows);
}
if ($seg0 === 'admin' && $seg1 === 'vehicle-orders' && $seg2 !== '' && $method === 'PATCH') {
    require_admin();
    $b = body();
    $status = (string)($b['status'] ?? '');
    if (!in_array($status, ['pending_payment', 'payment_review', 'confirmed', 'cancelled'], true)) {
        json_out(['error'=>'Invalid vehicle order status'], 400);
    }
    $db = get_db();
    $st = $db->prepare('UPDATE vehicle_orders SET status=? WHERE id=?');
    $st->execute([$status, $seg2]);
    if ($st->rowCount() < 1) json_out(['error'=>'Not found'], 404);
    json_out(['success'=>true, 'status'=>$status]);
}

// ── GET /stocks ───────────────────────────────────────────────
if ($uri === '/stocks' && $method === 'GET') {

    // Fetch helper: tries cURL first (available on most cPanel hosts even when
    // allow_url_fopen is disabled), then falls back to file_get_contents.
    function ttinc_fetch_url(string $url, int $timeoutSec = 6): ?string {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => $timeoutSec,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; TeslaTradeInc/1.0)',
                CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            ]);
            $body   = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($body !== false && $status >= 200 && $status < 300 && strlen((string)$body) > 20) {
                return (string)$body;
            }
        }
        // Fallback: PHP stream (needs allow_url_fopen = On)
        $ctx = stream_context_create(['http' => [
            'timeout'       => $timeoutSec,
            'ignore_errors' => false,
            'header'        => "User-Agent: Mozilla/5.0 (compatible; TeslaTradeInc/1.0)\r\nAccept: application/json\r\n",
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        return ($body !== false && strlen((string)$body) > 20) ? (string)$body : null;
    }

    // Market cap is the live share price multiplied by the latest reported
    // shares outstanding. The price updates with the exchange quote; the
    // share count is intentionally shown as the calculation basis in the UI.
    $tslaSharesOutstanding = 3215000000.0;
    $tsla = null;

    // Try primary then secondary Yahoo Finance endpoints.
    $raw = ttinc_fetch_url('https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1d&range=2d');
    if (!$raw) {
        $raw = ttinc_fetch_url('https://query2.finance.yahoo.com/v8/finance/chart/TSLA?interval=1d&range=2d');
    }
    if ($raw) {
        $yf   = json_decode($raw, true);
        $meta = $yf['chart']['result'][0]['meta'] ?? null;
        if ($meta) {
            $price   = (float)($meta['regularMarketPrice']         ?? 0);
            $prev    = (float)($meta['chartPreviousClose']         ?? $meta['regularMarketPreviousClose'] ?? $price);
            $high    = (float)($meta['regularMarketDayHigh']       ?? $price);
            $low     = (float)($meta['regularMarketDayLow']        ?? $price);
            $open    = (float)($meta['regularMarketOpen']          ?? $prev);
            $change  = round($price - $prev, 2);
            $chgPct  = $prev > 0 ? round($change / $prev * 100, 2) : 0;
            $quoteAt = !empty($meta['regularMarketTime'])
                ? gmdate('c', (int)$meta['regularMarketTime'])
                : date('c');
            if ($price > 0) $tsla = [
                'symbol'    => 'TSLA',
                'name'      => 'Tesla, Inc.',
                'exchange'  => 'NASDAQ',
                'price'     => round($price, 2),
                'change'    => $change,
                'changePct' => $chgPct,
                'high'      => round($high, 2),
                'low'       => round($low, 2),
                'open'      => round($open, 2),
                'prevClose' => round($prev, 2),
                'live'      => true,
                'private'   => false,
                'marketCap' => round($price * $tslaSharesOutstanding, 2),
                'sharesOutstanding' => $tslaSharesOutstanding,
                'marketCapLive' => true,
                'marketCapSource' => 'Live NASDAQ price × latest reported shares outstanding',
                'marketCapAsOf' => $quoteAt,
            ];
        }
    }

    if (!$tsla) {
        $slot  = (int)(time() / 300);
        mt_srand($slot * 7);
        $base  = 248.50;
        $price = round($base + (mt_rand(-800, 800) / 100), 2);
        mt_srand($slot * 7 - 1);
        $prev  = round($base + (mt_rand(-600, 600) / 100), 2);
        $chg   = round($price - $prev, 2);
        $tsla  = [
            'symbol' => 'TSLA', 'name' => 'Tesla, Inc.', 'exchange' => 'NASDAQ',
            'price' => $price, 'change' => $chg,
            'changePct' => $prev > 0 ? round($chg / $prev * 100, 2) : 0,
            'high' => round($price + mt_rand(30, 150) / 100, 2),
            'low'  => round($price - mt_rand(30, 150) / 100, 2),
            'open' => $prev, 'prevClose' => $prev,
            'live' => false, 'private' => false,
            'marketCap' => round($price * $tslaSharesOutstanding, 2),
            'sharesOutstanding' => $tslaSharesOutstanding,
            'marketCapLive' => false,
            'marketCapSource' => 'Estimated price × latest reported shares outstanding',
            'marketCapAsOf' => date('c'),
        ];
    }

    function sim_stock(string $sym, string $name, float $base, int $salt): array {
        $slot   = (int)(time() / 300);
        mt_srand($slot * 13 + $salt);
        $noise  = $base * 0.018;
        $price  = round($base + (mt_rand((int)(-$noise*100), (int)($noise*100)) / 100), 2);
        mt_srand(($slot - 1) * 13 + $salt);
        $prev   = round($base + (mt_rand((int)(-$noise*100), (int)($noise*100)) / 100), 2);
        $chg    = round($price - $prev, 2);
        mt_srand($slot * 13 + $salt + 99);
        $spread = max(0.05, round($base * 0.008, 2));
        return [
            'symbol'    => $sym,
            'name'      => $name,
            'exchange'  => 'Private',
            'price'     => $price,
            'change'    => $chg,
            'changePct' => $prev > 0 ? round($chg / $prev * 100, 2) : 0,
            'high'      => round($price + $spread + mt_rand(0, (int)($spread * 100)) / 100, 2),
            'low'       => round($price - $spread, 2),
            'open'      => $prev,
            'prevClose' => $prev,
            'live'      => false,
            'private'   => true,
        ];
    }

    json_out([
        'stocks' => [
            $tsla,
            sim_stock('SPACEX', 'Space Exploration Technologies Corp.', 185.40,  11),
            sim_stock('X',      'X Corp.',                              54.20,   22),
            sim_stock('XAI',    'xAI Corp. (Grok)',                     48.75,   33),
            sim_stock('NEURA',  'Neuralink Corporation',                22.10,   44),
            sim_stock('TBC',    'The Boring Company',                   12.80,   55),
        ],
        'updatedAt' => date('c'),
        'nextUpdate' => (int)(ceil(time() / 300) * 300 - time()),
    ]);
}

// ── GET /profile?email=&id= ────────────────────────────────────
if ($uri === '/profile' && $method === 'GET') {
    $email = trim($_GET['email'] ?? '');
    $invId = trim($_GET['id']    ?? '');
    if (!$email) json_out(['error'=>'email required'], 400);
    require_investor_session(normalize_email($email));

    $db = get_db();

    $st = $db->prepare(
        'SELECT user_name, user_email, portfolio, created_at FROM investments
         WHERE user_email=? ' . ($invId ? 'AND id=?' : '') . ' LIMIT 1'
    );
    $params = $invId ? [$email, $invId] : [$email];
    $st->execute($params);
    $inv = $st->fetch();
    if (!$inv) json_out(['error'=>'Account not found'], 404);

    $stP = $db->prepare('SELECT phone, country, address FROM user_profiles WHERE email=?');
    $stP->execute([$email]);
    $prof = $stP->fetch() ?: ['phone'=>'','country'=>'','address'=>''];

    json_out([
        'user_name'  => $inv['user_name'],
        'user_email' => $inv['user_email'],
        'portfolio'  => $inv['portfolio'],
        'created_at' => $inv['created_at'],
        'phone'      => $prof['phone'],
        'country'    => $prof['country'],
        'address'    => $prof['address'],
    ]);
}

// ── PATCH /profile ─────────────────────────────────────────────
if ($uri === '/profile' && $method === 'PATCH') {
    $b       = body();
    $email   = trim($b['email']   ?? '');
    $invId   = trim($b['id']      ?? '');
    $name    = trim($b['name']    ?? '');
    $phone   = trim($b['phone']   ?? '');
    $country = trim($b['country'] ?? '');
    $address = trim($b['address'] ?? '');

    if (!$email) json_out(['error'=>'email required'], 400);
    if (!$name)  json_out(['error'=>'name required'],  400);
    require_investor_session(normalize_email($email));

    $db = get_db();

    $stCheck = $db->prepare(
        'SELECT id FROM investments WHERE user_email=?' . ($invId ? ' AND id=?' : '') . ' LIMIT 1'
    );
    $params = $invId ? [$email, $invId] : [$email];
    $stCheck->execute($params);
    if (!$stCheck->fetch()) json_out(['error'=>'Account not found'], 404);

    $stName = $db->prepare('UPDATE investments SET user_name=? WHERE user_email=?');
    $stName->execute([$name, $email]);

    $stProf = $db->prepare(
        'INSERT INTO user_profiles (email, phone, country, address)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE phone=VALUES(phone), country=VALUES(country), address=VALUES(address)'
    );
    $stProf->execute([$email, $phone, $country, $address]);

    json_out(['success'=>true]);
}

// ── POST /wallet/connect  ─────────────────────────────────────
if ($seg0 === 'wallet' && $seg1 === 'connect' && $method === 'POST') {
    $b    = body();
    $email  = normalize_email((string)($b['email'] ?? ''));
    $wallet = trim($b['wallet'] ?? '');
    if (!$email || !$wallet) json_out(['error'=>'email and wallet required'], 400);
    if (strlen($wallet) > 100) json_out(['error'=>'wallet name is too long'], 400);
    require_investor_session($email);
    $db = get_db();
    $db->prepare('INSERT INTO connected_wallets (user_email, wallet_name) VALUES (?,?)
                  ON DUPLICATE KEY UPDATE wallet_name=VALUES(wallet_name), connected_at=NOW()')
       ->execute([$email, $wallet]);
    $db->prepare("UPDATE investments SET method=? WHERE user_email=? ORDER BY created_at DESC LIMIT 1")
       ->execute([$wallet, $email]);
    json_out(['success'=>true, 'wallet'=>$wallet]);
}

// ── GET /wallet?email=xxx  ────────────────────────────────────
if ($seg0 === 'wallet' && $seg1 === '' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    if (!$email) json_out(['error'=>'email required'], 400);
    require_investor_session($email);
    $db = get_db();
    $st = $db->prepare('SELECT wallet_name, connected_at FROM connected_wallets WHERE user_email=?');
    $st->execute([$email]);
    $row = $st->fetch();
    if (!$row) json_out(['wallet'=>null]);
    json_out(['wallet'=>$row['wallet_name'], 'connectedAt'=>$row['connected_at']]);
}

// ── GET /chat/session?email=xxx&name=xxx  ─────────────────────
if ($seg0 === 'chat' && $seg1 === 'session' && $method === 'GET') {
    $email = normalize_email((string)($_GET['email'] ?? ''));
    $name  = trim((string)($_GET['name'] ?? 'Visitor'));
    $db = get_db();
    if ($email) {
        require_active_investor($email);
        $stAccount = $db->prepare('SELECT name FROM investor_accounts WHERE email=? LIMIT 1');
        $stAccount->execute([$email]);
        $account = $stAccount->fetch();
        if ($account && !empty($account['name'])) $name = (string)$account['name'];
        if (!$name) $name = $email;
        $name = substr($name, 0, 255);
        $st = $db->prepare('SELECT id FROM chat_sessions WHERE user_email=? ORDER BY updated_at DESC LIMIT 1');
        $st->execute([$email]);
        $row = $st->fetch();
        if ($row) json_out(['sessionId'=>$row['id']]);
    } else {
        $name = 'Visitor';
    }
    $sid = uuid();
    $db->prepare('INSERT INTO chat_sessions (id,user_email,user_name) VALUES (?,?,?)')->execute([$sid,$email,$name]);
    json_out(['sessionId'=>$sid]);
}

// ── POST /chat/message  ───────────────────────────────────────
if ($seg0 === 'chat' && $seg1 === 'message' && $method === 'POST') {
    $b       = body();
    $sid     = trim($b['sessionId'] ?? '');
    $msg     = trim($b['message']   ?? '');
    if (!$sid || !$msg) json_out(['error'=>'sessionId and message required'], 400);
    if (strlen($msg) > 4000) json_out(['error'=>'Message is too long'], 400);
    $db = get_db();
    $st = $db->prepare('SELECT id,user_email,user_name FROM chat_sessions WHERE id=?');
    $st->execute([$sid]);
    $sess = $st->fetch();
    if (!$sess) json_out(['error'=>'Session not found'], 404);
    if (!empty($sess['user_email'])) {
        require_active_investor(normalize_email((string)$sess['user_email']));
    }
    // Public chat can submit only as the visitor. Admin replies use the
    // authenticated /chat/admin-reply route below.
    $db->prepare('INSERT INTO chat_messages (session_id,sender,message) VALUES (?,?,?)')->execute([$sid,'user',$msg]);
    $db->prepare('UPDATE chat_sessions SET unread_admin=unread_admin+1, updated_at=NOW() WHERE id=?')->execute([$sid]);
    json_out(['success'=>true]);
}

// ── GET /chat/messages?sessionId=xxx  ─────────────────────────
if ($seg0 === 'chat' && $seg1 === 'messages' && $method === 'GET') {
    $sid   = trim($_GET['sessionId'] ?? '');
    $since = (int)($_GET['since']    ?? 0);
    if (!$sid) json_out(['error'=>'sessionId required'], 400);
    $db = get_db();
    $stSession = $db->prepare('SELECT user_email FROM chat_sessions WHERE id=?');
    $stSession->execute([$sid]);
    $chatSession = $stSession->fetch();
    if (!$chatSession) json_out(['error'=>'Session not found'], 404);
    // Admins need to read every conversation from the dashboard, including
    // investor sessions that do not exist in the admin's investor session.
    if (!is_admin() && !empty($chatSession['user_email'])) {
        require_active_investor(normalize_email((string)$chatSession['user_email']));
    }
    $st = $db->prepare('SELECT id,sender,message,created_at FROM chat_messages WHERE session_id=? AND id>? ORDER BY id ASC');
    $st->execute([$sid, $since]);
    $rows = $st->fetchAll();
    json_out(['messages'=>$rows]);
}

// ── GET /chat/sessions (admin)  ───────────────────────────────
if ($seg0 === 'chat' && $seg1 === 'sessions' && $method === 'GET') {
    require_admin();
    $db   = get_db();
    $rows = $db->query(
        'SELECT s.id, s.user_email, s.user_name, s.status, s.unread_admin, s.updated_at,
                (SELECT message FROM chat_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) as last_msg,
                (SELECT sender  FROM chat_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) as last_sender,
                (SELECT COUNT(*) FROM chat_messages WHERE session_id=s.id) as msg_count
         FROM chat_sessions s ORDER BY s.updated_at DESC LIMIT 200'
    )->fetchAll();
    json_out($rows);
}

// ── POST /chat/admin-reply (admin)  ──────────────────────────
if ($seg0 === 'chat' && $seg1 === 'admin-reply' && $method === 'POST') {
    require_admin();
    $b   = body();
    $sid = trim($b['sessionId'] ?? '');
    $msg = trim($b['message']   ?? '');
    if (!$sid || !$msg) json_out(['error'=>'sessionId and message required'], 400);
    $db = get_db();
    $st = $db->prepare('SELECT id FROM chat_sessions WHERE id=?');
    $st->execute([$sid]);
    if (!$st->fetch()) json_out(['error'=>'Session not found'], 404);
    $db->prepare('INSERT INTO chat_messages (session_id,sender,message) VALUES (?,?,?)')->execute([$sid,'admin',$msg]);
    $db->prepare('UPDATE chat_sessions SET updated_at=NOW() WHERE id=?')->execute([$sid]);
    json_out(['success'=>true]);
}

// ── POST /chat/read (admin) — mark session read  ──────────────
if ($seg0 === 'chat' && $seg1 === 'read' && $method === 'POST') {
    require_admin();
    $b   = body();
    $sid = trim($b['sessionId'] ?? '');
    if (!$sid) json_out(['error'=>'sessionId required'], 400);
    $db = get_db();
    $db->prepare('UPDATE chat_sessions SET unread_admin=0 WHERE id=?')->execute([$sid]);
    json_out(['success'=>true]);
}

// ── POST /admin/reset-investors ───────────────────────────────
if ($seg0 === 'admin' && $seg1 === 'reset-investors' && $method === 'POST') {
    require_admin();
    $b = body();
    if (($b['confirm'] ?? '') !== 'CONFIRM_RESET') {
        json_out(['error' => 'Missing confirmation. Send confirm=CONFIRM_RESET.'], 400);
    }
    $db = get_db();
    try {
        $db->beginTransaction();
        foreach ([
            'chat_messages','chat_sessions','connected_wallets','referral_earnings',
            'referral_bonuses','kyc_submissions','withdrawals','investments',
            'investor_credentials','investor_accounts','user_profiles','otps',
            'referral_codes','marketing_emails_log'
        ] as $table) {
            $db->exec("DELETE FROM {$table}");
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
    $uploadDir = __DIR__ . '/../uploads/kyc/';
    if (is_dir($uploadDir)) {
        foreach (glob($uploadDir . '*') ?: [] as $file) {
            if (is_file($file) && basename($file) !== '.htaccess') @unlink($file);
        }
    }
    json_out(['success' => true, 'message' => 'All investor accounts and related data were deleted. Investors can now sign up fresh.']);
}

// ── 404 ───────────────────────────────────────────────────────
json_out(['error'=>'Not found'], 404);

} catch (Throwable $e) {
    json_out(['error'=>'Server error','detail'=>$e->getMessage()], 500);
}

// ── Type casting helpers ──────────────────────────────────────
function cast_investment(array $r): array {
    $r['total']               = (float)$r['total'];
    $r['earnings']            = (float)($r['earnings'] ?? 0);
    $r['total_current_value'] = (float)($r['total_current_value'] ?? 0);
    // Older records may have a funded principal but no current-value field.
    // The principal is the user's available balance until an admin sets ROI.
    if ($r['total_current_value'] <= 0 && $r['total'] > 0) {
        $r['total_current_value'] = $r['total'];
    }
    // An admin credit changes the principal. Before ROI is configured there
    // is no separate performance value, so never expose an older,
    // lower current-value snapshot as the investor's balance.
    if ($r['roi_percent'] === null && $r['total_current_value'] < $r['total']) {
        $r['total_current_value'] = $r['total'];
    }
    $r['roi_percent']         = $r['roi_percent'] !== null ? (float)$r['roi_percent'] : null;
    $r['profit_min']          = (float)($r['profit_min'] ?? 0.5);
    $r['loss_min']            = (float)($r['loss_min']  ?? 0.3);
    $r['trading_status']      = $r['trading_status'] ?? 'idle';
    $r['trading_amount']      = (float)($r['trading_amount'] ?? 0);
    $r['trading_current_value'] = (float)($r['trading_current_value'] ?? 0);
    $r['can_withdraw']        = (bool)$r['can_withdraw'];
    $r['totalCurrentValue']   = $r['total_current_value'];
    $r['roiPercent']          = $r['roi_percent'];
    $r['profitMin']           = $r['profit_min'];
    $r['lossMin']             = $r['loss_min'];
    $r['tradingStatus']       = $r['trading_status'];
    $r['tradingAmount']       = $r['trading_amount'];
    $r['tradingCurrentValue'] = $r['trading_current_value'];
    $r['tradingStartedAt']    = $r['trading_started_at'] ?? null;
    $r['canWithdraw']         = $r['can_withdraw'];
    $r['txId']                = $r['tx_id'];
    $r['userId']              = $r['user_id'];
    $r['userName']            = $r['user_name'];
    $r['userEmail']           = $r['user_email'];
    $r['kycStatus']           = $r['kyc_status'];
    $r['planId']              = $r['plan_id'] ?? null;
    $r['planName']            = $r['plan_name'] ?? null;
    $r['planCycle']           = (!empty($r['plan_id']) && isset(PLANS[$r['plan_id']]))
        ? (string)(PLANS[$r['plan_id']]['cycle'] ?? '')
        : null;
    $r['projectedRoi']        = $r['projected_roi'] !== null ? (float)$r['projected_roi'] : null;
    $r['paymentConfirmed']    = (bool)($r['payment_confirmed'] ?? false);
    $r['paymentReference']    = $r['payment_reference'] ?? null;
    $r['paymentProofPath']    = $r['payment_proof_path'] ?? null;
    $r['paymentProofName']    = $r['payment_proof_name'] ?? null;
    $r['paymentProofMime']    = $r['payment_proof_mime'] ?? null;
    $r['paymentProofSize']    = isset($r['payment_proof_size']) ? (int)$r['payment_proof_size'] : null;
    $r['paymentProofUploadedAt'] = $r['payment_proof_uploaded_at'] ?? null;
    $r['paymentSubmittedAt']  = $r['payment_submitted_at'] ?? null;
    $r['depositPurpose']       = $r['deposit_purpose'] ?? 'investment';
    $r['depositParentId']      = $r['deposit_parent_id'] ?? null;
    $r['availableBalance']    = $r['total_current_value'];
    $r['createdAt']           = $r['created_at'];
    return $r;
}
function cast_withdrawal(array $r): array {
    $r['amount']        = (float)$r['amount'];
    $r['investmentId']  = $r['investment_id'];
    $r['userId']        = $r['user_id'];
    $r['userName']      = $r['user_name'];
    $r['createdAt']     = $r['created_at'];
    $r['walletAddress'] = $r['wallet_address'] ?? '';
    return $r;
}
function cast_transaction(array $r): array {
    $r['amount']        = (float)$r['amount'];
    $r['investmentId']  = $r['investment_id'];
    $r['referenceId']   = $r['reference_id'] ?? null;
    $r['createdAt']     = $r['created_at'];
    $r['type']          = strtolower((string)$r['type']);
    $r['method']        = $r['method'] ?? '';
    $r['note']          = $r['note'] ?? '';
    return $r;
}
