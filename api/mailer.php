<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

// ══════════════════════════════════════════════════════════════
//  TELEGRAM NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

function send_telegram(string $message): array {
    $cfg     = get_setting('telegram_settings', []);
    $token   = $cfg['botToken']  ?? TELEGRAM_BOT_TOKEN;
    $chatId  = $cfg['chatId']    ?? TELEGRAM_CHAT_ID;

    if (empty($token) || empty($chatId)) {
        return ['ok' => false, 'error' => 'Telegram not configured (token or chat ID missing).'];
    }

    $url     = 'https://api.telegram.org/bot' . $token . '/sendMessage';
    $payload = json_encode([
        'chat_id'    => $chatId,
        'text'       => $message,
        'parse_mode' => 'HTML',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $resp   = curl_exec($ch);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($err) return ['ok' => false, 'error' => 'cURL error: ' . $err];
    $decoded = json_decode($resp, true);
    if (!empty($decoded['ok'])) return ['ok' => true];
    return ['ok' => false, 'error' => $decoded['description'] ?? 'Unknown Telegram error'];
}

function send_telegram_document(string $filePath, string $caption = ''): array {
    $cfg     = get_setting('telegram_settings', []);
    $token   = $cfg['botToken']  ?? TELEGRAM_BOT_TOKEN;
    $chatId  = $cfg['chatId']    ?? TELEGRAM_CHAT_ID;

    if (empty($token) || empty($chatId)) {
        return ['ok' => false, 'error' => 'Telegram not configured (token or chat ID missing).'];
    }
    if (!is_file($filePath) || !is_readable($filePath)) {
        return ['ok' => false, 'error' => 'The payment proof file is not readable.'];
    }

    $url = 'https://api.telegram.org/bot' . $token . '/sendDocument';
    $payload = [
        'chat_id'  => $chatId,
        'document' => new CURLFile($filePath),
    ];
    if ($caption !== '') {
        $payload['caption'] = $caption;
        $payload['parse_mode'] = 'HTML';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($err) return ['ok' => false, 'error' => 'cURL error: ' . $err];
    $decoded = json_decode($resp, true);
    if (!empty($decoded['ok'])) return ['ok' => true];
    return ['ok' => false, 'error' => $decoded['description'] ?? 'Unknown Telegram error'];
}

function telegram_payment_proof(string $name, string $email, string $portfolio,
                                string $amount, string $method, string $reference,
                                string $filePath): void {
    $caption = implode("\n", [
        '📎 <b>Payment Proof Uploaded</b>',
        '',
        '👤 <b>Name:</b> '      . htmlspecialchars($name),
        '📧 <b>Email:</b> '     . htmlspecialchars($email),
        '📊 <b>Portfolio:</b> ' . htmlspecialchars($portfolio),
        '💰 <b>Amount:</b> '    . htmlspecialchars($amount),
        '💳 <b>Method:</b> '    . htmlspecialchars($method),
        '🔖 <b>Reference:</b> ' . htmlspecialchars($reference !== '' ? $reference : 'Not provided'),
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
        '',
        '👉 Review the payment proof in the admin dashboard.',
    ]);
    $result = send_telegram_document($filePath, $caption);
    if (empty($result['ok'])) {
        error_log('Tesla Wealth Telegram payment proof notification failed: ' . ($result['error'] ?? 'Unknown error'));
    }
}

function telegram_new_registration(string $name, string $email,
                                   string $portfolio, string $amount,
                                   string $method): void {
    $msg = implode("\n", [
        '🚨 <b>New Investor Registration</b>',
        '',
        '👤 <b>Name:</b> ' . htmlspecialchars($name),
        '📧 <b>Email:</b> ' . htmlspecialchars($email),
        '📊 <b>Portfolio:</b> ' . htmlspecialchars($portfolio),
        '💰 <b>Amount:</b> ' . htmlspecialchars($amount),
        '💳 <b>Method:</b> ' . htmlspecialchars(ucfirst($method)),
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
        '',
        '👉 Login to admin panel to review.',
    ]);
    send_telegram($msg);
}

function telegram_withdrawal_request(string $name, string $email,
                                     string $amount, string $method): void {
    $msg = implode("\n", [
        '💸 <b>New Withdrawal Request</b>',
        '',
        '👤 <b>Name:</b> '   . htmlspecialchars($name),
        '📧 <b>Email:</b> '  . htmlspecialchars($email),
        '💰 <b>Amount:</b> ' . htmlspecialchars($amount),
        '💳 <b>Method:</b> ' . htmlspecialchars(ucfirst($method)),
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
        '',
        '👉 Login to admin panel to approve or decline.',
    ]);
    send_telegram($msg);
}

function telegram_investment_status(string $name, string $email,
                                     string $portfolio, string $amount,
                                     string $status): void {
    $icon  = $status === 'active' ? '✅' : '❌';
    $label = $status === 'active' ? 'APPROVED' : strtoupper($status);
    $msg = implode("\n", [
        "{$icon} <b>Investment {$label}</b>",
        '',
        '👤 <b>Name:</b> '      . htmlspecialchars($name),
        '📧 <b>Email:</b> '     . htmlspecialchars($email),
        '📊 <b>Portfolio:</b> ' . htmlspecialchars($portfolio),
        '💰 <b>Amount:</b> '    . htmlspecialchars($amount),
        '📌 <b>Status:</b> '    . $label,
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
    ]);
    send_telegram($msg);
}

function telegram_funds_added(string $name, string $email,
                               string $added, string $newTotal): void {
    $msg = implode("\n", [
        '💳 <b>Funds Added to Account</b>',
        '',
        '👤 <b>Name:</b> '         . htmlspecialchars($name),
        '📧 <b>Email:</b> '        . htmlspecialchars($email),
        '➕ <b>Amount Added:</b> ' . htmlspecialchars($added),
        '💰 <b>New Balance:</b> '  . htmlspecialchars($newTotal),
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
    ]);
    send_telegram($msg);
}

function telegram_financing_application(array $application): void {
    $base = '';
    if (!empty($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
        $base = $scheme . '://' . $_SERVER['HTTP_HOST'];
    }
    $reviewLink = $base !== '' ? $base . '/admin.php#financing' : '';
    $lines = [
        '🚘 <b>New Financing Applicant</b>',
        '',
        '👤 <b>Name:</b> ' . htmlspecialchars((string)($application['customer_name'] ?? '')),
        '📧 <b>Email:</b> ' . htmlspecialchars((string)($application['customer_email'] ?? '')),
        '📱 <b>Phone:</b> ' . htmlspecialchars((string)($application['customer_phone'] ?? '')),
        '🚗 <b>Vehicle:</b> ' . htmlspecialchars((string)($application['vehicle_name'] ?? '')),
        '🎨 <b>Color:</b> ' . htmlspecialchars((string)($application['vehicle_color'] ?? '')),
        '💰 <b>Price:</b> $' . number_format((float)($application['vehicle_total'] ?? 0), 2),
        '📆 <b>Term:</b> ' . (int)($application['term_months'] ?? 0) . ' months',
        '💵 <b>Down payment:</b> $' . number_format((float)($application['down_payment'] ?? 0), 2),
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
        '',
        '👉 Review and approve or decline in Admin → Financing.',
    ];
    $result = send_telegram(implode("\n", $lines));
    if (empty($result['ok'])) {
        error_log('Tesla Trade financing Telegram notification failed: ' . ($result['error'] ?? 'Unknown error'));
    }
}

function telegram_financing_status(array $application, string $status): void {
    $approved = $status === 'approved';
    $label = $approved ? 'APPROVED' : 'DECLINED';
    $icon = $approved ? '✅' : '❌';
    send_telegram(implode("\n", [
        "{$icon} <b>Financing {$label}</b>",
        '',
        '👤 <b>Name:</b> ' . htmlspecialchars((string)($application['customer_name'] ?? '')),
        '📧 <b>Email:</b> ' . htmlspecialchars((string)($application['customer_email'] ?? '')),
        '🚗 <b>Vehicle:</b> ' . htmlspecialchars((string)($application['vehicle_name'] ?? '')),
        '📌 <b>Status:</b> ' . $label,
        '',
        '⏰ ' . date('D, d M Y H:i:s') . ' UTC',
    ]));
}

// ══════════════════════════════════════════════════════════════
//  EMAIL — Resend API
// ══════════════════════════════════════════════════════════════

function email_logo_html(): string {
    return <<<HTML
<div style="text-align:center;margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #2a2a2a">
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:10px">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" width="48" height="48" style="display:block">
          <rect width="54" height="54" rx="9" fill="#0a0a0a"/>
          <rect x="7" y="10" width="40" height="8" rx="3" fill="#e31937"/>
          <rect x="23" y="10" width="8" height="36" rx="3" fill="#e31937"/>
          <rect x="16" y="42" width="22" height="3" rx="1.5" fill="#c0102a"/>
        </svg>
      </td>
      <td style="vertical-align:middle">
        <div style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px">
          Tesla <span style="color:#e31937">Trade</span> Inc
        </div>
        <div style="font-family:Arial,sans-serif;font-size:11px;color:#555555;letter-spacing:1px;text-transform:uppercase;margin-top:2px">
          Secure Investment Platform
        </div>
      </td>
    </tr>
  </table>
</div>
HTML;
}

function email_footer_html(): string {
    return <<<HTML
<hr style="border:none;border-top:1px solid #222;margin:28px 0 20px"/>
<p style="color:#444;font-size:11px;text-align:center;line-height:1.6;margin:0">
  Tesla Trade Inc &middot; Secure Investment Platform<br/>
  This email was sent to you because you registered on Tesla Trade Inc.<br/>
  If you did not register, please ignore this email.
</p>
HTML;
}

/**
 * Portfolio values from the legacy payment screen may be stored as a JSON
 * array/object instead of the human-readable plan label. Email clients should
 * never receive that raw payload as the visible plan name.
 */
function email_portfolio_label(string $portfolio): string {
    $raw = trim(html_entity_decode($portfolio, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($raw === '') return 'Investment plan';

    $decoded = json_decode($raw, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
        $candidate = isset($decoded[0]) && is_array($decoded[0]) ? $decoded[0] : $decoded;
        foreach (['label', 'name', 'planName', 'title', 'id'] as $key) {
            if (isset($candidate[$key]) && trim((string)$candidate[$key]) !== '') {
                return trim((string)$candidate[$key]);
            }
        }
    }

    return $raw;
}

function email_escape(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function send_email(string $toEmail, string $toName, string $subject, string $htmlBody): array {
    // Transactional mail must always use the verified no-reply sender.
    // Admin email settings may still control the recipient and UI labels,
    // but cannot change the authenticated sender identity.
    return send_via_resend(SENDER_NAME, SENDER_EMAIL, '', $toEmail, $toName, $subject, $htmlBody);
}

/**
 * The four onboarding notifications must always originate from the verified
 * Tesla Wealth sender, even if an administrator has changed general email
 * settings in the panel.
 */
function send_onboarding_email(string $toEmail, string $toName, string $subject, string $htmlBody): array {
    return send_via_resend(SENDER_NAME, SENDER_EMAIL, '', $toEmail, $toName, $subject, $htmlBody);
}

/**
 * Claim an onboarding email event before delivery and record success only
 * after Resend accepts it. A failed send is removed so a later retry can
 * deliver it without creating duplicate successful notifications.
 */
function send_onboarding_email_once(
    string $eventKey,
    string $emailType,
    string $toEmail,
    string $toName,
    string $subject,
    string $htmlBody,
    ?string $investmentId = null
): array {
    try {
        $db = get_db();
        $claim = $db->prepare(
            'INSERT INTO onboarding_email_events
             (event_key,email_type,recipient,investment_id,status)
             VALUES (?,?,?,?,?)'
        );
        try {
            $claim->execute([$eventKey, $emailType, $toEmail, $investmentId, 'sending']);
        } catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                return ['ok' => true, 'skipped' => true];
            }
            throw $e;
        }

        $result = send_onboarding_email($toEmail, $toName, $subject, $htmlBody);
        if (!empty($result['ok'])) {
            $db->prepare(
                "UPDATE onboarding_email_events SET status='sent', sent_at=NOW() WHERE event_key=?"
            )->execute([$eventKey]);
        } else {
            $db->prepare('DELETE FROM onboarding_email_events WHERE event_key=?')->execute([$eventKey]);
        }
        return $result;
    } catch (Throwable $e) {
        error_log('Tesla Wealth onboarding email failed: ' . $e->getMessage());
        return ['ok' => false, 'error' => 'Onboarding email delivery failed'];
    }
}

function custom_marketing_email_html(string $name, string $bodyText): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safeBody = nl2br(htmlspecialchars($bodyText));
    $safeName = htmlspecialchars($name);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a;overflow:hidden">
      <tr><td style="padding:32px 32px 0">
        {$logo}
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <div style="color:#aaaaaa;font-size:14px;line-height:1.75;margin:0 0 24px">{$safeBody}</div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="padding:10px 0">
            <a href="/" style="display:inline-block;background:#e31937;color:#fff;text-decoration:none;border-radius:10px;padding:13px 28px;font-size:15px;font-weight:800;font-family:Arial,sans-serif">Log In to Dashboard</a>
          </td></tr>
        </table>
        <div style="padding-bottom:32px">{$footer}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function send_via_resend(string $fromName,  string $fromEmail,
                         string $replyTo,   string $toEmail,
                         string $toName,     string $subject,
                         string $htmlBody): array {
    $apiKey = defined('RESEND_API_KEY') ? trim((string)RESEND_API_KEY) : '';
    if ($apiKey === '') {
        return ['ok' => false, 'error' => 'Email delivery is not configured on the server. Set RESEND_API_KEY in cPanel.'];
    }
    if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'The configured Resend sender email is invalid.'];
    }
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'The recipient email is invalid.'];
    }

    $payload = [
        'from'    => $fromName . ' <' . $fromEmail . '>',
        'to'      => [$toEmail],
        'subject' => $subject,
        'html'    => $htmlBody,
    ];
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $payload['reply_to'] = [$replyTo];
    }

    $ch = curl_init('https://api.resend.com/emails');
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Unable to initialize the server HTTP client.'];
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 20,
    ]);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $curlError !== '') {
        return ['ok' => false, 'error' => 'Resend request failed: ' . ($curlError ?: 'empty response')];
    }

    $decoded = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300 && !empty($decoded['id'])) {
        return ['ok' => true, 'id' => $decoded['id'], 'error' => null];
    }

    $message = is_array($decoded)
        ? ($decoded['message'] ?? $decoded['name'] ?? null)
        : null;
    return [
        'ok' => false,
        'error' => 'Resend rejected the email' . ($httpCode ? ' (HTTP ' . $httpCode . ')' : '') . ': ' . ($message ?: 'unknown error'),
    ];
}

// ══════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════

function otp_email_html(string $name, string $code): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a;overflow:hidden">
      <tr><td style="padding:32px 32px 0">
        {$logo}
        <h2 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 6px">Email Verification Code</h2>
        <p style="color:#888;font-size:13px;margin:0 0 24px">Verifying your identity before completing registration</p>
        <p style="color:#cccccc;font-size:15px;margin:0 0 4px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:8px 0 24px">Your one-time verification code is:</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px">
            <div style="font-size:46px;font-weight:800;letter-spacing:14px;color:#e31937;font-family:Courier,monospace">{$code}</div>
            <div style="color:#555;font-size:12px;margin-top:10px">Valid for 10 minutes &bull; Do not share this code</div>
          </td></tr>
        </table>
        <p style="color:#666;font-size:12px;margin:18px 0 0;line-height:1.6">
          If you did not request this code, you can safely ignore this email. Did not receive it?
          <strong style="color:#e31937">Use the "Resend OTP" button</strong> on the sign-in page to request a new code.
        </p>
        <div style="padding-bottom:32px">{$footer}</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function registration_success_email_html(string $name, string $portfolio,
                                          string $amount, string $method): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#0a2a0a;border:1px solid #22c55e44;border-radius:10px;padding:20px 16px">
            <div style="font-size:32px;margin-bottom:8px">&#10003;</div>
            <div style="color:#22c55e;font-size:18px;font-weight:800">Registration Successful!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Welcome to Tesla Trade Inc</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 8px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 24px;line-height:1.6">
          Congratulations — you have successfully registered and submitted your investment application.
          Our team will review your submission and activate your account shortly.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-weight:700">Investment Summary</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Portfolio Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$portfolio}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Payment Method</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;text-transform:capitalize">{$method}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:#2d2000;color:#f59e0b;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">PENDING REVIEW</span></td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          You will receive another email once your account is approved and your investment becomes active.
          If you have any questions, please contact our support team.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function welcome_email_html(string $name): string {
    $logo = email_logo_html();
    $footer = email_footer_html();
    $safeName = htmlspecialchars($name);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#fff;font-size:21px;margin:0 0 12px">Welcome to Tesla Trade Inc</h2>
        <p style="color:#ccc;font-size:15px;margin:0 0 14px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 22px">
          Your investor account has been created successfully. Choose an investment plan,
          review the payment instructions, and submit your payment for admin approval.
        </p>
        <div style="background:#171305;border:1px solid #4a3c0d;border-radius:10px;padding:15px;color:#cbbd79;font-size:13px;line-height:1.7">
          Your dashboard will unlock only after a submitted payment is reviewed and your investment is activated.
        </div>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function welcome_bonus_email_html(string $name, string $amount): string {
    $logo = email_logo_html();
    $footer = email_footer_html();
    $safeName = email_escape($name);
    $safeAmount = email_escape($amount);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#22c55e;font-size:21px;margin:0 0 12px">Your Deposit Match Promotion</h2>
        <p style="color:#ccc;font-size:15px;margin:0 0 14px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 20px">
          Your approved deposit of <strong style="color:#22c55e">{$safeAmount}</strong> may qualify for a 100% matching bonus under the current promotion.
        </p>
        <div style="background:#0d1a0d;border:1px solid #22c55e44;border-radius:10px;padding:15px;color:#a7d7ad;font-size:13px;line-height:1.7">
          The promotion applies to the first two approved deposits for eligible new accounts. No upfront payment is required to request a withdrawal; complete KYC if requested and wait for the normal admin review.
        </div>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function pending_deposit_email_html(string $name, string $amount, string $portfolio, string $method): string {
    $logo = email_logo_html();
    $footer = email_footer_html();
    $safeName = htmlspecialchars($name);
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    $safeMethod = email_escape($method);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#f59e0b;font-size:21px;margin:0 0 12px">Payment submitted for review</h2>
        <p style="color:#ccc;font-size:15px;margin:0 0 14px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 20px">
          We received your payment confirmation. Your investment is now <strong style="color:#f59e0b">pending approval</strong>.
          Your dashboard remains locked until an administrator verifies the payment.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:18px">
             <div style="color:#888;font-size:13px;padding:6px 0">Plan <strong style="float:right;color:#fff;max-width:62%;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</strong></div>
             <div style="color:#888;font-size:13px;padding:6px 0">Amount <strong style="float:right;color:#e31937">{$amount}</strong></div>
             <div style="color:#888;font-size:13px;padding:6px 0">Method <strong style="float:right;color:#fff;max-width:62%;text-align:right;overflow-wrap:anywhere">{$safeMethod}</strong></div>
             <div style="color:#888;font-size:13px;padding:6px 0">Status <strong style="float:right;color:#f59e0b">PENDING APPROVAL</strong></div>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">We will email you again as soon as the review is complete.</p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function approval_email_html(string $name, string $amount, string $portfolio): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safeName = email_escape($name);
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#002d12;border:1px solid #22c55e44;border-radius:10px;padding:20px 16px">
            <div style="font-size:42px;margin-bottom:8px">🎉</div>
            <div style="color:#22c55e;font-size:20px;font-weight:800">Account Approved &amp; Active!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Your investment is now earning returns</div>
          </td></tr>
        </table>
         <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Great news! Your account has been <strong style="color:#22c55e">approved</strong> by our team and is now live.
          Your investment is actively generating returns. Log in to your dashboard to track your portfolio performance.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
               <tr><td style="color:#888;font-size:13px;padding:6px 0;width:42%">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Invested Amount</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:#002d12;color:#22c55e;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">ACTIVE</span></td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          Remember to complete your <strong style="color:#fff">KYC verification</strong> to unlock withdrawal access when you are ready.
          Share your unique referral link to earn commissions for every investor you bring on board.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function deposit_email_html(string $name, string $amount,
                             string $newBalance, string $note): string {
    $logo     = email_logo_html();
    $footer   = email_footer_html();
    $noteHtml = $note
        ? "<p style='color:#aaa;font-size:13px;margin:0 0 8px'><strong>Note:</strong> {$note}</p>"
        : '';
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#22c55e;font-size:20px;font-weight:700;margin:0 0 6px">&#8593; Funds Deposited to Your Account</h2>
        <p style="color:#888;font-size:13px;margin:0 0 24px">Your wallet has been credited</p>
        <p style="color:#cccccc;font-size:15px;margin:0 0 20px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Funds have been credited to your Tesla Trade Inc account and are immediately reflected in your dashboard.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount Credited</td><td style="color:#22c55e;font-size:18px;font-weight:800;text-align:right">+{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">New Balance</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$newBalance}</td></tr>
            </table>
          </td></tr>
        </table>
        {$noteHtml}
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function first_deposit_email_html(string $name, string $amount, string $portfolio): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#0a1a2d;border:1px solid #3b82f644;border-radius:10px;padding:20px 16px">
            <div style="font-size:42px;margin-bottom:8px">🚀</div>
            <div style="color:#3b82f6;font-size:20px;font-weight:800">First Deposit Received!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Your investment journey has begun</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
           Welcome aboard! Your first deposit of <strong style="color:#22c55e">{$amount}</strong> has been received and is now working for you in your <strong style="color:#fff">{$safePortfolio}</strong> portfolio.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-weight:700">What happens next</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#aaa;font-size:13px;padding:8px 0;border-bottom:1px solid #222"><span style="color:#22c55e;font-weight:700">1.</span> Our team reviews and activates your account</td></tr>
              <tr><td style="color:#aaa;font-size:13px;padding:8px 0;border-bottom:1px solid #222"><span style="color:#22c55e;font-weight:700">2.</span> Your investment starts generating returns</td></tr>
              <tr><td style="color:#aaa;font-size:13px;padding:8px 0;border-bottom:1px solid #222"><span style="color:#22c55e;font-weight:700">3.</span> Complete KYC to unlock withdrawals</td></tr>
              <tr><td style="color:#aaa;font-size:13px;padding:8px 0"><span style="color:#22c55e;font-weight:700">4.</span> Share your referral code to earn extra rewards</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          Questions? Our support team is available 24/7 via the live chat on your dashboard.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function referral_bonus_email_html(string $name, string $bonusAmount, string $referrerEmail, int $maturityDays, string $maturedDate): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $maskedReferrer = preg_replace('/(?<=.{2}).(?=.*@)/', '*', $referrerEmail);
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#002d12;border:1px solid #22c55e44;border-radius:10px;padding:20px 16px">
            <div style="font-size:42px;margin-bottom:8px">🎁</div>
            <div style="color:#22c55e;font-size:22px;font-weight:800">{$bonusAmount} Referral Bonus Credited!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Welcome gift from Tesla Trade Inc</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          A <strong style="color:#22c55e">{$bonusAmount} referral bonus</strong> has been credited to your account because you joined Tesla Trade Inc through a referral from <strong style="color:#fff">{$maskedReferrer}</strong>.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Bonus Amount</td><td style="color:#22c55e;font-size:18px;font-weight:800;text-align:right">{$bonusAmount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Maturity Period</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$maturityDays} days</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Available to Withdraw</td><td style="color:#f59e0b;font-size:13px;font-weight:700;text-align:right">{$maturedDate}</td></tr>
            </table>
          </td></tr>
        </table>
        <div style="background:#0a1a2d;border:1px solid #3b82f644;border-radius:10px;padding:14px 16px;margin-bottom:16px;font-size:13px;color:#3b82f6;line-height:1.6">
          ℹ️ <strong>About Maturity:</strong> Your referral bonus matures after {$maturityDays} days to ensure the security of your account. After <strong style="color:#fff">{$maturedDate}</strong>, it will be fully available to withdraw or reinvest.
        </div>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          In the meantime, your bonus is part of your active portfolio and generating returns. Earn even more by sharing <em>your</em> referral code with friends!
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function marketing_no_deposit_email_html(string $name, string $email): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#2d2000;border:1px solid #f59e0b44;border-radius:10px;padding:18px 16px">
            <div style="font-size:38px;margin-bottom:8px">⏳</div>
            <div style="color:#f59e0b;font-size:18px;font-weight:800">Your Investment is Waiting</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Don't miss out on daily returns</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          You registered with Tesla Trade Inc but haven't made your first deposit yet. Every day you wait is a day your money isn't growing.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-weight:700">Our Investment Plans</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="color:#fff;font-size:13px;font-weight:700;padding:8px 0;border-bottom:1px solid #222">Explorer</td>
                <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:8px 0;border-bottom:1px solid #222">50% projected ROI</td>
              </tr>
              <tr>
                <td style="color:#fff;font-size:13px;font-weight:700;padding:8px 0;border-bottom:1px solid #222">Pioneer</td>
                <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:8px 0;border-bottom:1px solid #222">80% projected ROI</td>
              </tr>
              <tr>
                <td style="color:#fff;font-size:13px;font-weight:700;padding:8px 0;border-bottom:1px solid #222">Visionary</td>
                <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:8px 0;border-bottom:1px solid #222">120% projected ROI</td>
              </tr>
              <tr>
                <td style="color:#fff;font-size:13px;font-weight:700;padding:8px 0;border-bottom:1px solid #222">Pioneer Plus</td>
                <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:8px 0;border-bottom:1px solid #222">180% projected ROI</td>
              </tr>
              <tr>
                <td style="color:#fff;font-size:13px;font-weight:700;padding:8px 0">Dogecoin Reserve Fund</td>
                <td style="color:#22c55e;font-size:13px;font-weight:700;text-align:right;padding:8px 0">40%–120% projected ROI</td>
              </tr>
            </table>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px">
          <tr><td align="center">
            <a href="#" style="display:inline-block;background:#e31937;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:800;letter-spacing:-0.2px">Start Investing Now →</a>
          </td></tr>
        </table>
        <p style="color:#555;font-size:12px;line-height:1.6;margin:0;text-align:center">
          Questions? Reply to this email or use the live chat on your dashboard.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function marketing_referral_email_html(string $name, string $referralCode, string $referralLink, string $bonusAmount): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#002d12;border:1px solid #22c55e44;border-radius:10px;padding:18px 16px">
            <div style="font-size:38px;margin-bottom:8px">💰</div>
            <div style="color:#22c55e;font-size:20px;font-weight:800">Earn {$bonusAmount} Per Referral — Free!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Share your link, earn real money</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Did you know? Every person you refer to Tesla Trade Inc earns <strong style="color:#22c55e">you a commission on their deposits</strong>. New investors may also qualify for the current <strong style="color:#22c55e">100% match on their first two approved deposits</strong>.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;font-weight:700">Your Referral Code</div>
            <div style="font-size:30px;font-weight:800;color:#e31937;letter-spacing:6px;text-align:center;font-family:Courier,monospace;padding:14px 0">{$referralCode}</div>
            <div style="margin-top:12px;padding:10px;background:#0d0d0d;border-radius:8px;font-size:11px;color:#555;word-break:break-all;text-align:center">{$referralLink}</div>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a1a2d;border:1px solid #3b82f644;border-radius:10px;padding:0;margin-bottom:20px">
          <tr><td style="padding:16px">
            <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;font-weight:700">How it works</div>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#aaa;font-size:13px;padding:6px 0;border-bottom:1px solid #1a2a3d"><span style="color:#3b82f6;font-weight:700">1.</span> Share your referral code or link with friends</td></tr>
              <tr><td style="color:#aaa;font-size:13px;padding:6px 0;border-bottom:1px solid #1a2a3d"><span style="color:#3b82f6;font-weight:700">2.</span> They sign up and make their first deposit</td></tr>
              <tr><td style="color:#aaa;font-size:13px;padding:6px 0"><span style="color:#3b82f6;font-weight:700">3.</span> They get {$bonusAmount} bonus · You earn 20% commission automatically</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#555;font-size:12px;line-height:1.6;margin:0;text-align:center">
          No limit on referrals — earn unlimited commissions!
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function declined_email_html(string $name, string $amount, string $portfolio): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safeName = email_escape($name);
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#2d0000;border:1px solid #ef444444;border-radius:10px;padding:20px 16px">
            <div style="font-size:32px;margin-bottom:8px">&#10007;</div>
            <div style="color:#ef4444;font-size:18px;font-weight:800">Investment Not Approved</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Tesla Trade Inc</div>
          </td></tr>
        </table>
         <p style="color:#cccccc;font-size:15px;margin:0 0 8px">Hi <strong style="color:#fff">{$safeName}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          After reviewing your application, we are unable to approve your investment at this time.
          This may be due to incomplete information, compliance requirements, or eligibility criteria.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
               <tr><td style="color:#888;font-size:13px;padding:6px 0;width:42%">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:#2d0000;color:#ef4444;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">NOT APPROVED</span></td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0 0 16px">
          If you believe this was a mistake or would like to discuss further, please contact our support team and reference your registered email address.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function withdrawal_email_html(string $name, string $amount, string $status): string {
    $logo        = email_logo_html();
    $footer      = email_footer_html();
    $statusColor = $status === 'processed' ? '#22c55e' : ($status === 'declined' ? '#ef4444' : '#f59e0b');
    $statusBg    = $status === 'processed' ? '#002d12' : ($status === 'declined' ? '#2d0000' : '#2d2000');
    $statusLabel = $status === 'processed' ? 'Processed' : ($status === 'declined' ? 'Declined' : ucfirst($status));
    $statusIcon  = $status === 'processed' ? '&#10003;' : ($status === 'declined' ? '&#10007;' : '&#9200;');
    $statusMsg   = $status === 'processed'
        ? 'Your withdrawal has been processed. Funds will arrive at your destination within 1–3 business days.'
        : ($status === 'declined'
            ? 'Unfortunately, your withdrawal request has been declined. Please contact our support team for more information or to submit a new request.'
            : 'Your withdrawal request is being reviewed. We will update you once it is processed.');
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 6px">Withdrawal Update</h2>
        <p style="color:#888;font-size:13px;margin:0 0 24px">Status update on your withdrawal request</p>
        <p style="color:#cccccc;font-size:15px;margin:0 0 20px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">{$statusMsg}</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#fff;font-size:15px;font-weight:700;text-align:right">{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:{$statusBg};color:{$statusColor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">{$statusIcon} {$statusLabel}</span></td></tr>
            </table>
          </td></tr>
        </table>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function withdrawal_request_confirm_email_html(string $name, string $amount, string $method): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#f59e0b;font-size:20px;font-weight:700;margin:0 0 6px">&#128197; Withdrawal Request Received</h2>
        <p style="color:#888;font-size:13px;margin:0 0 24px">We've received your withdrawal request</p>
        <p style="color:#cccccc;font-size:15px;margin:0 0 20px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Your withdrawal request has been submitted and is now under review. Our team will process it as soon as possible.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount Requested</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Payment Method</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;text-transform:capitalize">{$method}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:#2d2000;color:#f59e0b;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">UNDER REVIEW</span></td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          You will receive another email once your withdrawal has been processed. Processing typically takes 1–3 business days.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function roi_update_email_html(string $name, string $portfolio,
                                string $principal, string $roi,
                                string $currentValue, string $earnings): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#3b82f6;font-size:20px;font-weight:700;margin:0 0 6px">&#128200; Your Portfolio Has Been Updated</h2>
        <p style="color:#888;font-size:13px;margin:0 0 24px">Your investment returns have been calculated</p>
        <p style="color:#cccccc;font-size:15px;margin:0 0 20px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Your investment portfolio has been updated with the latest returns. Log in to your dashboard to see the full performance breakdown.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
               <tr><td style="color:#888;font-size:13px;padding:6px 0;width:42%">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Principal Invested</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$principal}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Return Rate</td><td style="color:#3b82f6;font-size:15px;font-weight:800;text-align:right">{$roi}%</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Total Earnings</td><td style="color:#22c55e;font-size:15px;font-weight:800;text-align:right">+{$earnings}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Current Portfolio Value</td><td style="color:#e31937;font-size:16px;font-weight:800;text-align:right">{$currentValue}</td></tr>
            </table>
          </td></tr>
        </table>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function withdrawal_enabled_email_html(string $name, string $portfolio,
                                        string $currentValue): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#002d12;border:1px solid #22c55e44;border-radius:10px;padding:20px 16px">
            <div style="font-size:36px;margin-bottom:8px">&#128275;</div>
            <div style="color:#22c55e;font-size:18px;font-weight:800">Withdrawals Now Available!</div>
            <div style="color:#aaa;font-size:13px;margin-top:6px">Your account has been unlocked for withdrawals</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 8px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaaaaa;font-size:14px;margin:0 0 20px;line-height:1.6">
          Great news! Withdrawal access has been enabled on your account. You can now request a withdrawal of your earnings directly from your dashboard.
        </p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
          <tr><td style="padding:20px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
               <tr><td style="color:#888;font-size:13px;padding:6px 0;width:42%">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
              <tr><td style="color:#888;font-size:13px;padding:6px 0">Available Balance</td><td style="color:#22c55e;font-size:16px;font-weight:800;text-align:right">{$currentValue}</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0">
          Log in to your dashboard and navigate to the Withdraw section to submit your request. Make sure your KYC is verified first. Withdrawals are typically processed within 1–3 business days.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function transcript_email_html(string $name, string $transcript): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $safe   = nl2br(htmlspecialchars($transcript));
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <h2 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 6px">Support Chat Transcript</h2>
        <p style="color:#cccccc;font-size:15px;margin:20px 0 8px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaa;font-size:14px;margin:0 0 20px">Here is a copy of your support conversation:</p>
        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:20px;font-size:14px;line-height:1.7;color:#ccc">{$safe}</div>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

// ══════════════════════════════════════════════════════════════
//  ADMIN EMAIL NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

function send_admin_email(string $subject, string $htmlBody): void {
    $cfg        = get_setting('email_settings', []);
    $adminEmail = $cfg['adminEmail'] ?? ADMIN_EMAIL;
    if (empty($adminEmail)) return;
    send_email($adminEmail, 'Admin', $subject, $htmlBody);
}

function admin_email_wrap(string $iconEmoji, string $accentColor, string $accentBg,
                           string $badgeLabel, string $bodyHtml): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:{$accentBg};border:1px solid {$accentColor}44;border-radius:10px;padding:18px 16px">
            <div style="font-size:36px;margin-bottom:8px">{$iconEmoji}</div>
            <div style="color:{$accentColor};font-size:16px;font-weight:800">{$badgeLabel}</div>
          </td></tr>
        </table>
        {$bodyHtml}
        <p style="color:#555;font-size:12px;margin:16px 0 0;text-align:center">
          This is an automated notification from Tesla Trade Inc admin system.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function admin_signup_email_html(string $name, string $email,
                                  string $portfolio, string $amount,
                                  string $method): string {
    $ts = date('D, d M Y H:i') . ' UTC';
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    $rows = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
  <tr><td style="padding:20px">
    <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-weight:700">Registration Details</div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
       <tr><td style="color:#888;font-size:13px;padding:6px 0">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Payment Method</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;text-transform:capitalize">{$method}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Status</td><td style="text-align:right"><span style="background:#2d2000;color:#f59e0b;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">PENDING REVIEW</span></td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
<p style="color:#aaa;font-size:14px;line-height:1.6;margin:0">
  Log in to the admin panel to <strong style="color:#22c55e">approve</strong> or <strong style="color:#ef4444">decline</strong> this application.
</p>
HTML;
    return admin_email_wrap('🚨', '#f59e0b', '#2d2000', 'New Investor Sign-Up', $rows);
}

function admin_investment_status_email_html(string $name, string $email,
                                             string $portfolio, string $amount,
                                             string $newStatus): string {
    $ts     = date('D, d M Y H:i') . ' UTC';
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    $sColor = $newStatus === 'active' ? '#22c55e' : '#ef4444';
    $sBg    = $newStatus === 'active' ? '#002d12'  : '#2d0000';
    $sLabel = strtoupper($newStatus);
    $icon   = $newStatus === 'active' ? '✅' : '❌';
    $badge  = $newStatus === 'active' ? 'Investment Approved' : 'Investment ' . ucfirst($newStatus);
    $rows   = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
       <tr><td style="color:#888;font-size:13px;padding:6px 0">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">New Status</td><td style="text-align:right"><span style="background:{$sBg};color:{$sColor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">{$sLabel}</span></td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    return admin_email_wrap($icon, $sColor, $sBg, $badge, $rows);
}

function admin_roi_update_email_html(string $name, string $email,
                                      string $portfolio, string $amount,
                                      string $roi, string $currentValue): string {
    $ts   = date('D, d M Y H:i') . ' UTC';
    $safePortfolio = email_escape(email_portfolio_label($portfolio));
    $rows = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
       <tr><td style="color:#888;font-size:13px;padding:6px 0">Investment Plan</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;overflow-wrap:anywhere">{$safePortfolio}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Principal</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">ROI Set</td><td style="color:#3b82f6;font-size:15px;font-weight:800;text-align:right">{$roi}%</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Current Value</td><td style="color:#22c55e;font-size:15px;font-weight:800;text-align:right">{$currentValue}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    return admin_email_wrap('📈', '#3b82f6', '#0a1a2d', 'ROI Updated', $rows);
}

function admin_funds_added_email_html(string $name, string $email,
                                       string $added, string $newTotal): string {
    $ts   = date('D, d M Y H:i') . ' UTC';
    $rows = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount Added</td><td style="color:#22c55e;font-size:16px;font-weight:800;text-align:right">+{$added}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">New Balance</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$newTotal}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    return admin_email_wrap('💰', '#22c55e', '#002d12', 'Funds Added to Account', $rows);
}

function admin_withdrawal_request_email_html(string $name, string $email,
                                              string $amount, string $method): string {
    $ts   = date('D, d M Y H:i') . ' UTC';
    $rows = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount Requested</td><td style="color:#e31937;font-size:15px;font-weight:800;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Payment Method</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right;text-transform:capitalize">{$method}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
<p style="color:#aaa;font-size:14px;line-height:1.6;margin:0">
  Log in to the admin panel to <strong style="color:#22c55e">approve</strong> or <strong style="color:#ef4444">decline</strong> this withdrawal.
</p>
HTML;
    return admin_email_wrap('💸', '#f59e0b', '#2d2000', 'New Withdrawal Request', $rows);
}

function admin_withdrawal_status_email_html(string $name, string $email,
                                             string $amount, string $status): string {
    $ts     = date('D, d M Y H:i') . ' UTC';
    $sColor = $status === 'processed' ? '#22c55e' : '#ef4444';
    $sBg    = $status === 'processed' ? '#002d12'  : '#2d0000';
    $sLabel = strtoupper($status);
    $icon   = $status === 'processed' ? '✅' : '❌';
    $rows   = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Amount</td><td style="color:#fff;font-size:14px;font-weight:700;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">New Status</td><td style="text-align:right"><span style="background:{$sBg};color:{$sColor};border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700">{$sLabel}</span></td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    return admin_email_wrap($icon, $sColor, $sBg, 'Withdrawal ' . ucfirst($status), $rows);
}

function admin_withdraw_toggle_email_html(string $name, string $email,
                                           string $amount, bool $enabled): string {
    $ts     = date('D, d M Y H:i') . ' UTC';
    $label  = $enabled ? 'Withdrawal Access ENABLED' : 'Withdrawal Access DISABLED';
    $color  = $enabled ? '#22c55e' : '#f59e0b';
    $bg     = $enabled ? '#002d12'  : '#2d2000';
    $icon   = $enabled ? '🔓' : '🔒';
    $rows   = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:16px">
  <tr><td style="padding:20px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Balance</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$amount}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
HTML;
    return admin_email_wrap($icon, $color, $bg, $label, $rows);
}

// ══════════════════════════════════════════════════════════════
//  KYC EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════

function kyc_admin_email_html(string $name, string $email, string $fullName,
                               string $dob, string $nationality,
                               string $idType, string $idNumber, string $address): string {
    $ts   = date('D, d M Y H:i') . ' UTC';
    $addr = nl2br(htmlspecialchars($address));
    $rows = <<<HTML
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px">
  <tr><td style="padding:20px">
    <div style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-weight:700">KYC Submission Details</div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Account Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Email</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$email}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Full Name</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$fullName}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date of Birth</td><td style="color:#fff;font-size:13px;text-align:right">{$dob}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Nationality</td><td style="color:#fff;font-size:13px;text-align:right">{$nationality}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">ID Type</td><td style="color:#fff;font-size:13px;font-weight:700;text-align:right">{$idType}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">ID Number</td><td style="color:#3b82f6;font-size:13px;font-weight:700;text-align:right">{$idNumber}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0;vertical-align:top">Address</td><td style="color:#aaa;font-size:12px;text-align:right">{$addr}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:6px 0">Date</td><td style="color:#555;font-size:12px;text-align:right">{$ts}</td></tr>
    </table>
  </td></tr>
</table>
<p style="color:#aaa;font-size:14px;line-height:1.6;margin:0">
  Log in to the <strong style="color:#fff">Admin Panel → KYC tab</strong> to review all submitted documents (ID scan, selfie, video), then <strong style="color:#22c55e">Verify</strong> or <strong style="color:#ef4444">Reject</strong> this submission.
</p>
HTML;
    return admin_email_wrap('🪪', '#3b82f6', '#0a1a2d', 'New KYC Submission', $rows);
}

function kyc_approved_email_html(string $name): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#002d12;border:1px solid #22c55e44;border-radius:10px;padding:20px 16px">
            <div style="font-size:42px;margin-bottom:8px">✅</div>
            <div style="color:#22c55e;font-size:18px;font-weight:800">Identity Verified!</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 16px">
          Great news — your KYC identity verification has been <strong style="color:#22c55e">approved</strong>. Your account is now fully verified and you are eligible to request withdrawals from your dashboard.
        </p>
        <p style="color:#555;font-size:13px;line-height:1.6;margin:0">
          Log in to your dashboard to manage your portfolio and request withdrawals.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}

function kyc_rejected_email_html(string $name, string $note): string {
    $logo   = email_logo_html();
    $footer = email_footer_html();
    $reason = $note ? '<p style="color:#aaa;font-size:13px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;margin:14px 0 0"><strong style="color:#fff">Reason:</strong> ' . htmlspecialchars($note) . '</p>' : '';
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a">
  <tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:500px;background:#111111;border-radius:14px;border:1px solid #2a2a2a">
      <tr><td style="padding:32px">
        {$logo}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
          <tr><td align="center" style="background:#2d0000;border:1px solid #ef444444;border-radius:10px;padding:20px 16px">
            <div style="font-size:42px;margin-bottom:8px">❌</div>
            <div style="color:#ef4444;font-size:18px;font-weight:800">KYC Verification Update</div>
          </td></tr>
        </table>
        <p style="color:#cccccc;font-size:15px;margin:0 0 16px">Hi <strong style="color:#fff">{$name}</strong>,</p>
        <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 0">
          Unfortunately your KYC submission could not be approved at this time. Please resubmit your documents on the KYC page with clearer images or correct information.
        </p>
        {$reason}
        <p style="color:#555;font-size:13px;line-height:1.6;margin:14px 0 0">
          Visit the KYC verification page on your dashboard to resubmit.
        </p>
        {$footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;
}
