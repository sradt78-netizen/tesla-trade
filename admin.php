<?php
if (file_exists(__DIR__ . '/api/config.php')) {
    require_once __DIR__ . '/api/config.php';
    require_once __DIR__ . '/api/db.php';
    require_once __DIR__ . '/api/mailer.php';
} else {
    require_once __DIR__ . '/php-backend/config.php';
    require_once __DIR__ . '/php-backend/db.php';
    require_once __DIR__ . '/php-backend/mailer.php';
}
session_start();

// ── Admin auth (direct access enabled, no password screen) ───
$is_auth = true;

// ── Fetch helpers ──────────────────────────────────────────────
function api_db_investments(): array {
    try {
        $db = get_db();
        return $db->query('SELECT * FROM investments ORDER BY created_at DESC')->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_withdrawals(): array {
    try {
        $db = get_db();
        return $db->query(
            'SELECT w.*, i.user_email FROM withdrawals w
             LEFT JOIN investments i ON i.id=w.investment_id
             ORDER BY w.created_at DESC'
        )->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_kyc(): array {
    try {
        $db = get_db();
        return $db->query('SELECT * FROM kyc_submissions ORDER BY created_at DESC')->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_referral_leaderboard(): array {
    try {
        $db = get_db();
        return $db->query(
            'SELECT referrer_email, COUNT(DISTINCT referred_email) as unique_refs,
                    COUNT(*) as total_deposits, COALESCE(SUM(commission),0) as total_earned
             FROM referral_earnings
             GROUP BY referrer_email
             ORDER BY total_earned DESC LIMIT 50'
        )->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_referral_bonuses(): array {
    try {
        $db = get_db();
        return $db->query(
            'SELECT rb.*, i.user_name FROM referral_bonuses rb
             LEFT JOIN investments i ON i.id=rb.investment_id
             ORDER BY rb.credited_at DESC'
        )->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_chat_sessions(): array {
    try {
        $db = get_db();
        return $db->query(
            'SELECT s.id, s.user_email, s.user_name, s.status, s.unread_admin, s.updated_at,
                    (SELECT message FROM chat_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1) as last_msg,
                    (SELECT COUNT(*) FROM chat_messages WHERE session_id=s.id) as msg_count
             FROM chat_sessions s ORDER BY s.updated_at DESC LIMIT 200'
        )->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_financing_applications(): array {
    try {
        $db = get_db();
        return $db->query('SELECT * FROM financing_applications ORDER BY created_at DESC')->fetchAll();
    } catch (Throwable $e) { return []; }
}
function api_db_store_orders(): array {
    try {
        $db = get_db();
        $orders = $db->query(
            'SELECT id, customer_name, customer_email, customer_phone, delivery_location,
                    customer_note, payment_method, payment_proof_path, payment_proof_name,
                    payment_proof_uploaded_at, payment_reference, status, created_at
             FROM ev_orders ORDER BY created_at DESC LIMIT 200'
        )->fetchAll();
        $items = $db->prepare(
            'SELECT product_name, quantity FROM ev_order_items WHERE order_id=? ORDER BY id ASC'
        );
        foreach ($orders as &$order) {
            $items->execute([(int)$order['id']]);
            $order['items'] = $items->fetchAll();
        }
        unset($order);
        return $orders;
    } catch (Throwable $e) { return []; }
}
function fmtd(string $d): string {
    if (!$d) return '-';
    return date('M j, Y g:ia', strtotime($d));
}
function fmtu(float $v): string { return '$' . number_format($v, 2); }
function admin_trading_settings(): array {
    $saved = get_setting('trading_settings', []);
    return [
        'profitIntervalSeconds' => max(1, (int)($saved['profitIntervalSeconds'] ?? 10)),
        'lossIntervalSeconds'   => max(1, (int)($saved['lossIntervalSeconds'] ?? 10)),
        'profitRatePercent'     => max(0, (float)($saved['profitRatePercent'] ?? 0.5)),
        'lossRatePercent'       => max(0, (float)($saved['lossRatePercent'] ?? 0.3)),
    ];
}
function admin_investment_badge_class(string $status): string {
    $classes = [
        'active' => 'bp-active',
        'pending_approval' => 'bp-pending',
        'pending' => 'bp-pending',
        'declined' => 'bp-declined',
        'cancelled' => 'bp-cancelled',
    ];
    return $classes[$status] ?? 'bp-default';
}
function admin_kyc_badge_class(string $status): string {
    $classes = [
        'verified' => 'bp-verified',
        'pending' => 'bp-pending',
        'rejected' => 'bp-rejected',
        'none' => 'bp-none',
    ];
    return $classes[$status] ?? 'bp-default';
}
function admin_financing_badge_class(string $status): string {
    $classes = [
        'approved' => 'bp-active',
        'declined' => 'bp-declined',
    ];
    return $classes[$status] ?? 'bp-pending';
}
function admin_invitation_link(string $code): string {
    $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'yourdomain.com'));
    return $scheme . '://' . $host . '/' . rawurlencode($code);
}

// ── Admin actions ──────────────────────────────────────────────
$action_msg  = '';
$action_type = 'ok';

if ($is_auth && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $db = null;
    try {
        $db = get_db();
    } catch (Throwable $e) {
        error_log('Tesla Trade admin database connection failed: ' . $e->getMessage());
        $action_type = 'error';
        if (!extension_loaded('pdo_mysql')) {
            $action_msg = 'Admin login succeeded, but PDO MySQL is not enabled for the PHP version serving this Hestia domain.';
        } elseif (DB_NAME === '' || DB_USER === '' || DB_PASS === '') {
            $action_msg = 'Admin login succeeded, but the active SetEnv database values were not read from public_html/.htaccess. Check TT_DB_HOST, TT_DB_NAME, TT_DB_USER, and TT_DB_PASS.';
        } else {
            $action_msg = 'Admin login succeeded, but MySQL rejected the connection (' .
                tt_db_failure_category($e) .
                '). Check the Hestia database name, user, password, host, and that the user is assigned to the database.';
        }
    }

    if ($db instanceof PDO) {

    // Approve / decline investment
    if (isset($_POST['investment_action'], $_POST['investment_id'])) {
        $id     = $_POST['investment_id'];
        $action = $_POST['investment_action'];
        $st     = $db->prepare('SELECT * FROM investments WHERE id=?');
        $st->execute([$id]);
        $inv    = $st->fetch();
        if ($inv && $inv['status'] === 'pending_approval'
            && in_array($action, ['active', 'declined'], true)) {
            $db->prepare('UPDATE investments SET status=? WHERE id=?')->execute([$action, $id]);
            if ($action === 'active') {
                // Approval must move the paid principal into the same
                // current-value field used by the investor dashboard.
                sync_approved_investment_balance($db, $id);
                merge_approved_deposit_into_primary($db, $id);
            }
            $db->prepare(
                'UPDATE account_transactions SET status=? WHERE reference_id=? AND type=?'
            )->execute([
                $action === 'active' ? 'processed' : 'declined',
                $inv['tx_id'],
                'deposit',
            ]);
            if ($action === 'active') {
                $matchedBonus = credit_deposit_match_bonus($db, $inv);
                $db->prepare('UPDATE investments SET activated_at=NOW() WHERE id=?')->execute([$id]);
                $db->prepare("UPDATE investor_accounts SET onboarding_status='active', activated_at=NOW() WHERE email=?")
                   ->execute([$inv['user_email']]);
            }
            $amtFmt = fmtu((float)$inv['total']);
            if ($action === 'active') {
                send_onboarding_email_once(
                    'activation:' . $id,
                    'activation',
                    $inv['user_email'], $inv['user_name'],
                    'Your Account is Now Approved & Active — Tesla Trade Inc',
                    approval_email_html($inv['user_name'], $amtFmt, $inv['portfolio']),
                    $id
                );
                telegram_investment_status($inv['user_name'], $inv['user_email'], $inv['portfolio'], $amtFmt, 'active');
            } else {
                if (!find_primary_active_investment_id($db, (string)$inv['user_email'])) {
                    $db->prepare("UPDATE investor_accounts SET onboarding_status='declined', updated_at=NOW() WHERE email=?")
                       ->execute([$inv['user_email']]);
                }
                send_email($inv['user_email'], $inv['user_name'],
                    'Investment Application Update — Tesla Trade Inc',
                    declined_email_html($inv['user_name'], $amtFmt, $inv['portfolio']));
            }
            $action_msg  = 'Investment ' . htmlspecialchars($action) . ' and investor notified.';
        } elseif ($inv) {
            $action_type = 'error';
            $action_msg = 'Only payments in pending approval can be approved or declined.';
        }
    }

    // Approve / decline vehicle financing
    if (isset($_POST['financing_action'], $_POST['financing_id'])) {
        $id = trim((string)$_POST['financing_id']);
        $action = (string)$_POST['financing_action'];
        $note = trim((string)($_POST['financing_note'] ?? ''));
        $st = $db->prepare('SELECT * FROM financing_applications WHERE id=?');
        $st->execute([$id]);
        $application = $st->fetch();
        if ($application && $application['status'] === 'pending'
            && in_array($action, ['approved', 'declined'], true)) {
            $db->prepare('UPDATE financing_applications SET status=?,admin_note=? WHERE id=?')
               ->execute([$action, $note !== '' ? $note : null, $id]);
            $application['status'] = $action;
            $application['admin_note'] = $note;
            telegram_financing_status($application, $action);
            if ($action === 'approved') {
                send_email(
                    $application['customer_email'],
                    $application['customer_name'],
                    'Financing Application Approved — Tesla Trade Inc',
                    '<p>Your financing application for <strong>' . htmlspecialchars($application['vehicle_name']) .
                    '</strong> has been approved. Our team will contact you with the next steps.</p>' .
                    ($note !== '' ? '<p>Note: ' . nl2br(htmlspecialchars($note)) . '</p>' : '')
                );
            } else {
                send_email(
                    $application['customer_email'],
                    $application['customer_name'],
                    'Financing Application Update — Tesla Trade Inc',
                    '<p>Your financing application for <strong>' . htmlspecialchars($application['vehicle_name']) .
                    '</strong> was not approved at this time.</p>' .
                    ($note !== '' ? '<p>Note: ' . nl2br(htmlspecialchars($note)) . '</p>' : '')
                );
            }
            $action_msg = 'Financing application ' . $action . ' and applicant notified.';
        } elseif ($application) {
            $action_type = 'error';
            $action_msg = 'Only pending financing applications can be reviewed.';
        }
    }

    // Update ROI
    if (isset($_POST['update_roi'], $_POST['inv_id_roi'])) {
        $id  = $_POST['inv_id_roi'];
        $roi = (float)$_POST['roi_percent'];
        $st  = $db->prepare('SELECT * FROM investments WHERE id=?');
        $st->execute([$id]);
        $inv = $st->fetch();
        if ($inv) {
            $tcv  = round((float)$inv['total'] * (1 + $roi/100), 2);
            $earn = round($tcv - (float)$inv['total'], 2);
            $db->prepare('UPDATE investments SET roi_percent=?,total_current_value=?,earnings=? WHERE id=?')
               ->execute([$roi, $tcv, $earn, $id]);
            $principalFmt = fmtu((float)$inv['total']);
            $tcvFmt       = fmtu($tcv);
            $earnFmt      = fmtu($earn);
            send_email($inv['user_email'], $inv['user_name'],
                'Your Portfolio Has Been Updated — Tesla Trade Inc',
                roi_update_email_html($inv['user_name'], $inv['portfolio'], $principalFmt, number_format($roi,2), $tcvFmt, $earnFmt));
            send_admin_email('📈 ROI Updated — ' . $inv['user_name'],
                admin_roi_update_email_html($inv['user_name'], $inv['user_email'], $inv['portfolio'], $principalFmt, number_format($roi,2), $tcvFmt));
            $action_msg = 'ROI updated to ' . $roi . '% and investor notified.';
        }
    }

    // Add funds
    if (isset($_POST['add_funds_submit'], $_POST['inv_id_funds'])) {
        $id     = $_POST['inv_id_funds'];
        $amount = (float)$_POST['add_amount'];
        $note   = trim($_POST['add_note'] ?? '');
        if ($amount > 0) {
            $st = $db->prepare('SELECT * FROM investments WHERE id=?');
            $st->execute([$id]);
            $inv = $st->fetch();
            if ($inv) {
                $new_total = round((float)$inv['total'] + $amount, 2);
                if ($inv['roi_percent'] !== null) {
                    $roi  = (float)$inv['roi_percent'];
                    $tcv  = round($new_total * (1 + $roi/100), 2);
                    $earn = round($tcv - $new_total, 2);
                    $db->prepare('UPDATE investments SET total=?,total_current_value=?,earnings=? WHERE id=?')
                       ->execute([$new_total, $tcv, $earn, $id]);
                } else {
                    $db->prepare('UPDATE investments SET total=?,total_current_value=? WHERE id=?')
                       ->execute([$new_total, $new_total, $id]);
                }
                record_account_transaction(
                    $db, $id, $inv['user_email'], 'deposit', $amount,
                    'Admin adjustment', 'processed', null, $note ?: 'Admin funds added'
                );
                $addedFmt  = fmtu($amount);
                $newTotFmt = fmtu($new_total);
                $isFirst   = ((float)$inv['total'] == 0 && !$inv['first_deposit_emailed']);
                if ($isFirst) {
                    send_email($inv['user_email'], $inv['user_name'],
                        'First Deposit Received — Tesla Trade Inc',
                        first_deposit_email_html($inv['user_name'], $addedFmt, $inv['portfolio']));
                    $db->prepare('UPDATE investments SET first_deposit_emailed=1 WHERE id=?')->execute([$id]);
                }
                send_email($inv['user_email'], $inv['user_name'],
                    'Funds Added to Your Account — Tesla Trade Inc',
                    deposit_email_html($inv['user_name'], $addedFmt, $newTotFmt, $note));
                send_admin_email('💰 Funds Added — ' . $inv['user_name'],
                    admin_funds_added_email_html($inv['user_name'], $inv['user_email'], $addedFmt, $newTotFmt));
                telegram_funds_added($inv['user_name'], $inv['user_email'], $addedFmt, $newTotFmt);
                credit_referral_commission($inv['user_email'], $id, $amount, 'Funds added by admin');
                if ($isFirst) {
                    credit_referral_bonus_to_referred($inv['user_email'], $id);
                }
                $action_msg = 'Funds added and investor notified.';
            }
        }
    }

    // Toggle can_withdraw
    if (isset($_POST['toggle_withdraw'], $_POST['inv_id_wd'])) {
        $id = $_POST['inv_id_wd'];
        $st = $db->prepare('SELECT * FROM investments WHERE id=?');
        $st->execute([$id]);
        $inv = $st->fetch();
        if ($inv) {
            $newVal = $inv['can_withdraw'] ? 0 : 1;
            $db->prepare('UPDATE investments SET can_withdraw=? WHERE id=?')->execute([$newVal, $id]);
            if ($newVal) {
                $tcvFmt = fmtu((float)($inv['total_current_value'] ?: $inv['total']));
                send_email($inv['user_email'], $inv['user_name'],
                    'Withdrawals Now Available on Your Account — Tesla Trade Inc',
                    withdrawal_enabled_email_html($inv['user_name'], $inv['portfolio'], $tcvFmt));
            }
            $action_msg = 'Withdrawal access ' . ($newVal ? 'enabled' : 'disabled') . '.';
        }
    }

    // Trading simulator settings used by every active investor trade
    if (isset($_POST['save_trading_settings'])) {
        $trading_settings = [
            'profitIntervalSeconds' => max(1, min(86400, (int)($_POST['profit_interval_seconds'] ?? 10))),
            'lossIntervalSeconds'   => max(1, min(86400, (int)($_POST['loss_interval_seconds'] ?? 10))),
            'profitRatePercent'     => max(0, min(100, (float)($_POST['profit_rate_percent'] ?? 0.5))),
            'lossRatePercent'       => max(0, min(100, (float)($_POST['loss_rate_percent'] ?? 0.3))),
        ];
        set_setting('trading_settings', $trading_settings);
        $action_msg = 'Trading timing and movement settings saved.';
    }

    // Process/decline withdrawal
    if (isset($_POST['withdrawal_action'], $_POST['withdrawal_id'])) {
        $wid    = $_POST['withdrawal_id'];
        $status = $_POST['withdrawal_action'];
        $stGet  = $db->prepare('SELECT w.*, i.user_name, i.user_email FROM withdrawals w LEFT JOIN investments i ON i.id=w.investment_id WHERE w.id=?');
        $stGet->execute([$wid]);
        $wd = $stGet->fetch();
        $db->prepare('UPDATE withdrawals SET status=? WHERE id=?')->execute([$status, $wid]);
        if ($wd) {
            $amtFmt = fmtu((float)$wd['amount']);
            send_email($wd['user_email'], $wd['user_name'] ?? 'Investor',
                'Withdrawal Update — Tesla Trade Inc',
                withdrawal_email_html($wd['user_name'] ?? 'Investor', $amtFmt, $status));
        }
        $action_msg = 'Withdrawal marked as ' . $status . '.';
    }

    // KYC verify/reject
    if (isset($_POST['kyc_action'], $_POST['kyc_id'])) {
        $kycId  = $_POST['kyc_id'];
        $status = $_POST['kyc_action'];
        $note   = trim($_POST['kyc_note'] ?? '');
        $st     = $db->prepare('SELECT * FROM kyc_submissions WHERE id=?');
        $st->execute([$kycId]);
        $kyc    = $st->fetch();
        if ($kyc) {
            $db->prepare('UPDATE kyc_submissions SET status=?,admin_note=? WHERE id=?')->execute([$status,$note,$kycId]);
            $db->prepare('UPDATE investments SET kyc_status=? WHERE id=?')->execute([$status, $kyc['investment_id']]);
            if ($status === 'verified') {
                send_email($kyc['user_email'], $kyc['user_name'], '✅ KYC Verified — Tesla Trade Inc', kyc_approved_email_html($kyc['user_name']));
            } else {
                send_email($kyc['user_email'], $kyc['user_name'], '❌ KYC Update — Tesla Trade Inc', kyc_rejected_email_html($kyc['user_name'], $note));
            }
            $action_msg = 'KYC ' . $status . ' and investor notified.';
        }
    }

    // Payment settings save
    if (isset($_POST['save_payment_settings'])) {
        $cur = get_setting('payment_settings', []);
        $fields = ['usdt','eth','btc','bank','venmo','cashapp','paypal','alipay','wechat'];
        foreach ($fields as $f) {
            if (isset($_POST[$f]) && is_array($_POST[$f])) {
                $cur[$f] = array_map('trim', $_POST[$f]);
            }
        }
        set_setting('payment_settings', $cur);
        $action_msg = 'Payment settings saved.';
    }

    // Referral settings save
    if (isset($_POST['save_referral_settings'])) {
        $cur = get_setting('referral_settings', []);
        if (isset($_POST['referral_bonus_amount']))  $cur['bonus_amount']  = max(0, (float)$_POST['referral_bonus_amount']);
        if (isset($_POST['referral_maturity_days'])) $cur['maturity_days'] = max(1, (int)$_POST['referral_maturity_days']);
        set_setting('referral_settings', $cur);
        $action_msg = 'Referral settings saved.';
    }

    // Invitation-code lifecycle
    if (isset($_POST['invitation_action'])) {
        $invitationAction = strtolower(trim((string)$_POST['invitation_action']));
        try {
            if ($invitationAction === 'generate') {
                $created = tt_create_invitation_code($db);
                $action_msg = 'New invitation code generated: ' . $created['code'];
            } elseif ($invitationAction === 'rotate') {
                $created = tt_rotate_invitation_codes($db);
                $action_msg = 'Invitation codes rotated. The new active code is ' . $created['code'] . '.';
            } elseif (in_array($invitationAction, ['revoke', 'reinstate'], true)) {
                $codeId = (int)($_POST['invitation_code_id'] ?? 0);
                $updated = tt_set_invitation_code_status(
                    $db,
                    $codeId,
                    $invitationAction === 'revoke' ? 'revoked' : 'active'
                );
                $action_msg = 'Invitation code ' . $updated['code'] . ' ' .
                    ($invitationAction === 'revoke' ? 'revoked.' : 'reinstated.');
            } else {
                throw new InvalidArgumentException('Unsupported invitation action.');
            }
        } catch (Throwable $e) {
            $action_type = 'error';
            $action_msg = 'Invitation-code action failed: ' . $e->getMessage();
        }
    }

    // Telegram settings save
    if (isset($_POST['save_telegram_settings'])) {
        $cur = get_setting('telegram_settings', []);
        if (!empty($_POST['telegram_bot_token'])) $cur['botToken'] = trim($_POST['telegram_bot_token']);
        if (!empty($_POST['telegram_chat_id']))   $cur['chatId']   = trim($_POST['telegram_chat_id']);
        set_setting('telegram_settings', $cur);
        $action_msg = 'Telegram settings saved.';
    }

    // Test Telegram
    if (isset($_POST['test_telegram'])) {
        $r = send_telegram("✅ <b>Tesla Trade Inc Admin Panel</b>\n\nTelegram test successful!\n\n⏰ " . date('D, d M Y H:i:s') . ' UTC');
        $action_msg  = $r['ok'] ? '✅ Telegram test message sent!' : '❌ Telegram test failed: ' . ($r['error'] ?? 'Unknown error');
        $action_type = $r['ok'] ? 'ok' : 'error';
    }

    // Email settings save
    if (isset($_POST['save_email_settings'])) {
        $cur = get_setting('email_settings', []);
        foreach (['senderName','senderEmail','replyTo','adminEmail'] as $k) {
            if (!empty($_POST[$k])) $cur[$k] = trim($_POST[$k]);
        }
        set_setting('email_settings', $cur);
        $action_msg = 'Email settings saved.';
    }

    // Test email
    if (isset($_POST['test_email'])) {
        $to = trim($_POST['test_email_to'] ?? SENDER_EMAIL);
        $r  = send_email($to, 'Admin', 'Tesla Trade Inc — Test Email',
              '<p style="font-family:sans-serif;font-size:16px">Your Tesla Trade Inc email is working correctly. ✅</p>');
        $action_msg  = $r['ok'] ? '✅ Test email sent to ' . $to : '❌ Email failed: ' . ($r['error'] ?? 'Unknown error');
        $action_type = $r['ok'] ? 'ok' : 'error';
    }

    // Marketing email blast
    if (isset($_POST['marketing_blast'])) {
        $type       = $_POST['marketing_type'] ?? '';
        $force_send = !empty($_POST['force_send']);
        $rs         = get_referral_settings();
        $sent = 0; $failed = 0; $throttled = 0; $first_err = '';
        $do_send = true;

        if ($type === 'no_deposit') {
            $rows = $db->query("SELECT DISTINCT user_email, user_name FROM investments WHERE total=0 AND status IN ('pending','active') ORDER BY created_at DESC")->fetchAll();
            foreach ($rows as $r) {
                if (!$force_send && marketing_email_sent_recently($r['user_email'], 'no_deposit', 7)) { $throttled++; continue; }
                $res = send_email($r['user_email'], $r['user_name'],
                    'Your Investment Account is Ready — Make Your First Deposit',
                    marketing_no_deposit_email_html($r['user_name'], $r['user_email']));
                if ($res['ok']) { log_marketing_email($r['user_email'], 'no_deposit'); $sent++; }
                else { $failed++; if (!$first_err) $first_err = $res['error'] ?? 'Resend failed'; }
            }
        } elseif ($type === 'referral_share') {
            $rows = $db->query("SELECT DISTINCT user_email, user_name FROM investments WHERE status='active' ORDER BY created_at DESC")->fetchAll();
            $bonusAmt = fmtu($rs['bonus_amount']);
            $proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on') ? 'https' : 'http';
            $host  = $_SERVER['HTTP_HOST'] ?? 'yourdomain.com';
            foreach ($rows as $r) {
                if (!$force_send && marketing_email_sent_recently($r['user_email'], 'referral_share', 14)) { $throttled++; continue; }
                $code = get_or_create_referral_code($r['user_email']);
                $link = $proto . '://' . $host . '/?ref=' . $code;
                $res  = send_email($r['user_email'], $r['user_name'],
                    'Earn ' . $bonusAmt . ' — Share Your Referral Code!',
                    marketing_referral_email_html($r['user_name'], $code, $link, $bonusAmt));
                if ($res['ok']) { log_marketing_email($r['user_email'], 'referral_share'); $sent++; }
                else { $failed++; if (!$first_err) $first_err = $res['error'] ?? 'Resend failed'; }
            }
        } elseif ($type === 'all_investors') {
            // Custom message blast to all investor accounts
            $custom_subject = trim($_POST['custom_subject'] ?? '');
            $custom_body    = trim($_POST['custom_body']    ?? '');
            if (!$custom_subject || !$custom_body) {
                $action_msg  = '❌ Please fill in both Subject and Message before sending.';
                $action_type = 'error';
                $do_send = false;
            } else {
                $rows = $db->query("SELECT DISTINCT user_email, user_name FROM investments WHERE user_email <> '' ORDER BY created_at DESC")->fetchAll();
                foreach ($rows as $r) {
                    if (!$force_send && marketing_email_sent_recently($r['user_email'], 'all_investors', 1)) { $throttled++; continue; }
                    $personalized_html = custom_marketing_email_html($r['user_name'], $custom_body);
                    $res = send_email($r['user_email'], $r['user_name'], $custom_subject, $personalized_html);
                    if ($res['ok']) { log_marketing_email($r['user_email'], 'all_investors'); $sent++; }
                    else { $failed++; if (!$first_err) $first_err = $res['error'] ?? 'Resend failed'; }
                }
            }
        }

        if ($do_send) {
            $parts = [];
            if ($sent > 0)      $parts[] = "✅ Sent to {$sent} investor(s).";
            if ($throttled > 0) $parts[] = "⏸ {$throttled} skipped (throttle — use Force Send to override).";
            if ($failed > 0)    $parts[] = "❌ {$failed} failed.";
            if (empty($parts))  $parts[] = 'ℹ️ No eligible investors found for this campaign.';
            $action_msg  = implode(' ', $parts);
            $action_type = $failed > 0 ? 'error' : 'ok';
            if ($first_err) $action_msg .= ' Server error: ' . htmlspecialchars($first_err);
        }
    }

    // Clear marketing throttle log
    if (isset($_POST['clear_marketing_log'])) {
        try {
            $db->exec('DELETE FROM marketing_emails_log');
            $action_msg = '✅ Marketing throttle log cleared. You can now re-send to all investors.';
        } catch (Throwable $e) {
            $action_msg  = '❌ Could not clear log: ' . htmlspecialchars($e->getMessage());
            $action_type = 'error';
        }
    }

    // Chat reply
    if (isset($_POST['chat_reply_submit'])) {
        $sid = $_POST['chat_session_id'] ?? '';
        $msg = trim($_POST['chat_reply'] ?? '');
        if ($sid && $msg) {
            $db->prepare('INSERT INTO chat_messages (session_id,sender,message) VALUES (?,?,?)')->execute([$sid,'admin',$msg]);
            $db->prepare('UPDATE chat_sessions SET updated_at=NOW() WHERE id=?')->execute([$sid]);
            $action_msg = 'Reply sent.';
        }
    }
    }
}

// ── Data load ─────────────────────────────────────────────────
$investments    = [];
$withdrawals    = [];
$kyc_list       = [];
$referral_board = [];
$referral_bonuses = [];
$chat_sessions  = [];
$financing_applications = [];
$store_orders   = [];
$payment_settings = [];
$referral_settings = [];
$email_settings = [];
$telegram_settings = [];
$trading_settings = admin_trading_settings();
$invitation_codes = [];

if ($is_auth) {
    $investments       = api_db_investments();
    $withdrawals       = api_db_withdrawals();
    $kyc_list          = api_db_kyc();
    $referral_board    = api_db_referral_leaderboard();
    $referral_bonuses  = api_db_referral_bonuses();
    $chat_sessions     = api_db_chat_sessions();
    $financing_applications = api_db_financing_applications();
    $store_orders      = api_db_store_orders();
    $payment_settings  = get_setting('payment_settings', []);
    $referral_settings = get_referral_settings();
    $email_settings    = get_setting('email_settings', []);
    $telegram_settings = get_setting('telegram_settings', []);
    $trading_settings = admin_trading_settings();
    try {
        $invitation_codes = tt_invitation_codes(get_db());
    } catch (Throwable $e) {
        $invitation_codes = [];
    }
}

// Stat helpers
$total_investors  = count($investments);
$active_investors = count(array_filter($investments, function ($i) { return $i['status'] === 'active'; }));
$pending_investors= count(array_filter($investments, function ($i) { return $i['status'] === 'pending_approval'; }));
$total_deposits   = array_sum(array_column($investments, 'total'));
$pending_wds      = array_filter($withdrawals, function ($w) { return $w['status'] === 'pending'; });
$completed_wds    = array_filter($withdrawals, function ($w) { return in_array($w['status'], ['processed', 'declined'], true); });
$total_wd_amount  = array_sum(array_filter(array_column($withdrawals, 'amount'), function ($a) { return true; }));
$unread_chat      = array_sum(array_column($chat_sessions, 'unread_admin'));
$pending_kyc      = count(array_filter($kyc_list, function ($k) { return $k['status'] === 'pending'; }));
$pending_financing = count(array_filter($financing_applications, function ($a) { return $a['status'] === 'pending'; }));
$store_receipts    = count(array_filter($store_orders, function ($o) { return !empty($o['payment_proof_path']); }));
$active_invitation_codes = count(array_filter($invitation_codes, function ($c) { return $c['status'] === 'active'; }));
$revoked_invitation_codes = count(array_filter($invitation_codes, function ($c) { return $c['status'] === 'revoked'; }));
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Admin Panel — Tesla Trade Inc</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0a; --bg2: #111; --bg3: #1a1a1a; --border: #222; --border2: #2a2a2a;
      --text: #e0e0e0; --muted: #888; --faint: #444;
      --red: #e31937; --green: #22c55e; --blue: #3b82f6; --amber: #f59e0b;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; }
    a { color: var(--red); }

    /* ── LOGIN ── */
    .login-wrap {
      min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .login-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 16px;
      padding: 40px 32px; width: 100%; max-width: 380px; text-align: center;
    }
    .login-card h2 { font-size: 20px; font-weight: 800; color: #fff; margin: 16px 0 6px; }
    .login-card p  { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
    .login-card input[type=password] {
      width: 100%; background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 10px; color: #fff; padding: 12px 14px; font-size: 14px; outline: none;
      margin-bottom: 12px; transition: border-color .15s;
    }
    .login-card input:focus { border-color: var(--red); }
    .login-card button {
      width: 100%; background: var(--red); color: #fff; border: none;
      border-radius: 10px; padding: 12px; font-size: 15px; font-weight: 800; cursor: pointer;
    }
    .err-msg { color: #f87171; font-size: 12px; margin-bottom: 12px; }

    /* ── LAYOUT ── */
    .admin-wrap { display: flex; min-height: 100vh; }

    /* ── SIDEBAR ── */
    .sidebar {
      width: 220px; flex-shrink: 0;
      background: var(--bg2); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; z-index: 50;
    }
    .sidebar-logo {
      padding: 20px 16px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .sidebar-logo-text { font-size: 15px; font-weight: 800; color: #fff; }
    .sidebar-logo-text span { color: var(--red); }
    .sidebar-nav { padding: 12px 0; flex: 1; }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--muted);
      cursor: pointer; border: none; background: none; width: 100%; text-align: left;
      transition: all .12s; border-left: 3px solid transparent;
    }
    .nav-item:hover { background: var(--bg3); color: #fff; }
    .nav-item.active { background: #1a0005; color: var(--red); border-left-color: var(--red); }
    .nav-item .badge {
      margin-left: auto; background: var(--red); color: #fff;
      font-size: 10px; font-weight: 800; border-radius: 10px; padding: 2px 6px;
    }
    .nav-item .badge.amber { background: var(--amber); }
    .sidebar-footer { padding: 12px 16px; border-top: 1px solid var(--border); }
    .sidebar-footer form button {
      width: 100%; background: var(--bg3); border: 1px solid var(--border2); color: var(--muted);
      border-radius: 8px; padding: 8px; font-size: 12px; cursor: pointer;
    }

    /* ── MAIN CONTENT ── */
    .main-content { margin-left: 220px; padding: 28px; flex: 1; max-width: 100%; }
    .panel { display: none; }
    .panel.active { display: block; }
    .panel-header { margin-bottom: 24px; }
    .panel-header h1 { font-size: 22px; font-weight: 900; color: #fff; }
    .panel-header p  { color: var(--muted); font-size: 13px; margin-top: 4px; }

    /* ── ACTION MSG ── */
    .action-msg {
      background: #002d12; border: 1px solid #22c55e44;
      border-radius: 10px; padding: 12px 16px; margin-bottom: 20px;
      color: var(--green); font-size: 13px; font-weight: 600;
    }
    .action-msg.error { background: #1a0005; border-color: #e3193733; color: #f87171; }

    /* ── STATS ── */
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr));
      gap: 12px; margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px; display: flex; flex-direction: column; gap: 4px;
    }
    .stat-card .s-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .7px; }
    .stat-card .s-value { font-size: 24px; font-weight: 900; color: #fff; }
    .stat-card .s-value.green { color: var(--green); }
    .stat-card .s-value.red   { color: var(--red);   }
    .stat-card .s-value.amber { color: var(--amber);  }
    .stat-card .s-value.blue  { color: var(--blue);   }

    /* ── TABLE ── */
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%; border-collapse: collapse; font-size: 13px;
    }
    th {
      background: var(--bg3); color: var(--muted);
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
      padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td { padding: 11px 12px; border-bottom: 1px solid #1a1a1a; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #131313; }
    .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 20px; }

    /* ── BADGES ── */
    .badge-pill {
      display: inline-block; border-radius: 20px;
      padding: 3px 10px; font-size: 11px; font-weight: 700;
      white-space: nowrap;
    }
    .bp-active  { background: #002d12; color: var(--green); }
    .bp-pending { background: #2d2000; color: var(--amber); }
    .bp-declined,.bp-rejected,.bp-cancelled { background: #1a0000; color: #f87171; }
    .bp-processed { background: #002d12; color: var(--green); }
    .bp-verified  { background: #002d12; color: var(--green); }
    .bp-none      { background: #1a1a1a; color: #555; }
    .bp-default   { background: #1a1a1a; color: #aaa; }

    /* ── BUTTONS ── */
    .btn {
      display: inline-flex; align-items: center; gap: 5px;
      border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700;
      cursor: pointer; border: none; transition: opacity .12s;
    }
    .btn:hover { opacity: .8; }
    .btn-green  { background: #002d12; color: var(--green); border: 1px solid #22c55e44; }
    .btn-red    { background: #1a0005; color: var(--red);   border: 1px solid #e3193733; }
    .btn-amber  { background: #2d2000; color: var(--amber); border: 1px solid #f59e0b44; }
    .btn-blue   { background: #0a1a2d; color: var(--blue);  border: 1px solid #3b82f633; }
    .btn-neutral { background: #171717; color: #c7c7c7; border: 1px solid var(--border2); }
    .btn-solid  { background: var(--red); color: #fff; }
    .btn-solid-green { background: var(--green); color: #000; }

    /* ── FORMS ── */
    .form-inline { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .finput {
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 8px; color: #fff; padding: 8px 10px; font-size: 13px; outline: none;
    }
    .finput:focus { border-color: var(--red); }
    .fselect { appearance: none; cursor: pointer; }

    /* ── SETTINGS ── */
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .settings-group { margin-bottom: 16px; }
    .settings-group label { display: block; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
    .settings-group input, .settings-group select {
      width: 100%; background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 8px; color: #fff; padding: 10px 12px; font-size: 13px; outline: none;
    }
    .settings-group input:focus { border-color: var(--red); }
    .save-btn {
      background: var(--red); color: #fff; border: none;
      border-radius: 8px; padding: 10px 22px; font-size: 14px; font-weight: 800; cursor: pointer;
    }
    .save-btn:hover { opacity: .85; }

    /* ── INVITATION ACCESS ── */
    .access-hero {
      display: flex; align-items: flex-start; gap: 14px; padding: 20px;
      background: linear-gradient(135deg, #151515 0%, #1d090d 100%);
      border: 1px solid #e3193733; border-radius: 14px; margin-bottom: 20px;
    }
    .access-hero-icon {
      width: 40px; height: 40px; display: grid; place-items: center; flex-shrink: 0;
      border-radius: 12px; background: #e319371c; font-size: 19px;
    }
    .access-hero h2 { color: #fff; font-size: 16px; margin-bottom: 5px; }
    .access-hero p { color: var(--muted); font-size: 12px; line-height: 1.6; max-width: 760px; }
    .access-actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 16px; }
    .access-actions form { margin: 0; }
    .code-token {
      display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px;
      border-radius: 8px; background: #080808; border: 1px solid var(--border2);
      color: #fff; font: 700 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .5px; white-space: nowrap;
    }
    .code-token::before { content: 'KEY'; color: var(--red); font: 800 9px/1 sans-serif; letter-spacing: .7px; }
    .code-link { display: block; color: var(--muted); font-size: 11px; margin-top: 5px; max-width: 270px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .code-link:hover { color: #fff; }
    .code-history { min-width: 760px; }
    .access-status { display: inline-flex; align-items: center; gap: 6px; }
    .access-status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .access-status.active { color: var(--green); }
    .access-status.revoked { color: #f87171; }
    .access-note { color: var(--muted); font-size: 12px; line-height: 1.55; margin-top: 12px; }
    .access-note strong { color: #fff; }

    /* ── SECTION DIVIDER ── */
    .section-title { font-size: 15px; font-weight: 800; color: #fff; margin: 20px 0 12px; padding-top: 4px; }
    .sub-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .sub-tab {
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 8px; color: var(--muted);
      padding: 7px 16px; font-size: 12px; font-weight: 700;
      cursor: pointer; border-bottom-left-radius: 0; border-bottom-right-radius: 0;
    }
    .sub-tab.active { background: #1a0005; color: var(--red); border-color: var(--red); }

    /* ── CHAT ── */
    .chat-list { display: flex; flex-direction: column; gap: 0; }
    .chat-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-bottom: 1px solid var(--border);
      cursor: pointer; transition: background .12s;
    }
    .chat-item:hover { background: #131313; }
    .chat-item.selected { background: #1a0005; }
    .chat-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: #1a1a1a; border: 1px solid #333;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 800; color: var(--muted); flex-shrink: 0;
    }
    .chat-item-name { font-size: 13px; font-weight: 700; color: #fff; }
    .chat-item-preview { font-size: 12px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
    .chat-item-meta { margin-left: auto; text-align: right; flex-shrink: 0; }
    .chat-item-time { font-size: 11px; color: var(--faint); }
    .chat-unread { background: var(--red); color: #fff; border-radius: 10px; font-size: 10px; font-weight: 800; padding: 2px 6px; display: inline-block; margin-top: 3px; }

    .chat-main { display: flex; gap: 0; height: calc(100vh - 180px); min-height: 400px; }
    .chat-sidebar-pane { width: 300px; flex-shrink: 0; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px 0 0 12px; overflow-y: auto; }
    .chat-messages-pane { flex: 1; background: var(--bg2); border: 1px solid var(--border); border-left: none; border-radius: 0 12px 12px 0; display: flex; flex-direction: column; }
    .chat-msgs-header { padding: 14px 16px; border-bottom: 1px solid var(--border); font-weight: 800; color: #fff; font-size: 14px; }
    .chat-msgs-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .chat-msg { max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; }
    .chat-msg.user { background: var(--bg3); border: 1px solid var(--border2); color: var(--text); align-self: flex-start; border-bottom-left-radius: 4px; }
    .chat-msg.admin { background: var(--red); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
    .chat-msg-time { font-size: 10px; opacity: .6; margin-top: 3px; }
    .chat-reply-area { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
    .chat-reply-area textarea { flex: 1; background: var(--bg3); border: 1px solid var(--border2); border-radius: 8px; color: #fff; padding: 10px 12px; font-size: 13px; resize: none; outline: none; height: 80px; }
    .chat-reply-area button { background: var(--red); color: #fff; border: none; border-radius: 8px; padding: 0 20px; font-weight: 800; cursor: pointer; align-self: flex-end; height: 38px; }

    /* ── KYC DOCS ── */
    .doc-links a { color: var(--blue); font-size: 12px; display: block; }
    .doc-links a:hover { text-decoration: underline; }

    @media (max-width: 900px) {
      .sidebar { width: 60px; }
      .sidebar-logo-text, .nav-item span { display: none; }
      .main-content { margin-left: 60px; }
      .settings-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      body { overflow-x: hidden; }
      .admin-wrap { display: block; }
      .sidebar {
        position: sticky; top: 0; left: auto; width: 100%; height: auto;
        max-height: none; overflow: visible; border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .sidebar-logo { padding: 12px 14px; }
      .sidebar-logo-text { display: block; }
      .sidebar-nav {
        display: flex; gap: 6px; overflow-x: auto; padding: 8px 10px;
        -webkit-overflow-scrolling: touch; scrollbar-width: thin;
      }
      .nav-item {
        width: auto; flex: 0 0 auto; min-height: 38px; padding: 9px 11px;
        border-left: none; border-bottom: 2px solid transparent;
        border-radius: 8px; font-size: 11px; white-space: nowrap;
      }
      .nav-item span { display: inline; }
      .nav-item.active { border-bottom-color: var(--red); }
      .nav-item .badge { margin-left: 3px; }
      .sidebar-footer { padding: 8px 10px 10px; border-top: none; }
      .sidebar-footer form button { width: auto; padding: 8px 12px; }
      .main-content { margin-left: 0; padding: 18px 12px 28px; }
      .panel-header { margin-bottom: 18px; }
      .panel-header h1 { font-size: 20px; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .stat-card { padding: 13px; }
      .stat-card .s-value { font-size: 20px; }
      .table-wrap { margin: 0 -1px; }
      .form-inline { align-items: stretch; }
      .form-inline .finput, .form-inline .btn { width: 100%; min-height: 38px; }
      .settings-grid { gap: 12px; }
      .access-hero { padding: 16px; }
      .access-actions, .access-actions .btn { width: 100%; }
      .access-actions .btn { justify-content: center; min-height: 38px; }
      .code-history { min-width: 680px; }
      .chat-main { flex-direction: column; }
      .chat-sidebar-pane { width: 100%; height: 200px; border-radius: 12px 12px 0 0; }
      .chat-messages-pane { border-left: 1px solid var(--border); border-radius: 0 0 12px 12px; }
      .chat-reply-area { flex-direction: column; }
      .chat-reply-area textarea { width: 100%; height: 90px; }
      .chat-reply-area button { width: 100%; height: 40px; padding: 0 14px; }
    }
  </style>
</head>
<body>

<?php if (!$is_auth): ?>
<!-- ══════════════════════════════════════════════════════════ -->
<!--  LOGIN                                                     -->
<!-- ══════════════════════════════════════════════════════════ -->
<div class="login-wrap">
  <div class="login-card">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" width="52" height="52" style="margin:0 auto">
      <rect width="54" height="54" rx="10" fill="#0a0a0a"/>
      <rect x="7" y="10" width="40" height="8" rx="3" fill="#e31937"/>
      <rect x="23" y="10" width="8" height="36" rx="3" fill="#e31937"/>
      <rect x="16" y="42" width="22" height="3" rx="1.5" fill="#c0102a"/>
    </svg>
    <h2>Tesla Trade Inc</h2>
    <p>Admin Panel — Restricted Access</p>
    <?php if (!empty($auth_error)): ?>
      <div class="err-msg"><?= htmlspecialchars($auth_error) ?></div>
    <?php endif; ?>
    <form method="POST">
      <input type="password" name="admin_password" placeholder="Enter admin password" autofocus required/>
      <button type="submit">Access Admin Panel →</button>
    </form>
  </div>
</div>

<?php else: ?>
<!-- ══════════════════════════════════════════════════════════ -->
<!--  ADMIN PANEL                                               -->
<!-- ══════════════════════════════════════════════════════════ -->
<div class="admin-wrap">

  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="sidebar-logo">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="26" height="26">
        <rect x="4" y="6" width="28" height="6" rx="2.5" fill="#e31937"/>
        <rect x="15" y="6" width="6" height="24" rx="2.5" fill="#e31937"/>
        <rect x="10" y="28" width="16" height="2.5" rx="1.25" fill="#c0102a"/>
      </svg>
      <div class="sidebar-logo-text">Tesla <span>Trade</span></div>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-item active" onclick="showPanel('investors')">
        <span>👥</span> <span>Investors</span>
        <?php if ($pending_investors > 0): ?><span class="badge amber"><?= $pending_investors ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('store-orders')">
        <span>🧾</span> <span>Shop receipts</span>
        <?php if ($store_receipts > 0): ?><span class="badge amber"><?= $store_receipts ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('financing')">
        <span>🚘</span> <span>Financing</span>
        <?php if ($pending_financing > 0): ?><span class="badge amber"><?= $pending_financing ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('kyc')">
        <span>🪪</span> <span>KYC</span>
        <?php if ($pending_kyc > 0): ?><span class="badge"><?= $pending_kyc ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('withdrawals')">
        <span>💸</span> <span>Withdrawals</span>
        <?php if (count($pending_wds) > 0): ?><span class="badge"><?= count($pending_wds) ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('referrals')">
        <span>🔗</span> <span>Referrals</span>
      </button>
      <button class="nav-item" onclick="showPanel('chat')">
        <span>💬</span> <span>Live Chat</span>
        <?php if ($unread_chat > 0): ?><span class="badge"><?= $unread_chat ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('marketing')">
        <span>📣</span> <span>Marketing</span>
      </button>
      <button class="nav-item" onclick="showPanel('access')">
        <span>🔐</span> <span>Invitation access</span>
        <?php if ($active_invitation_codes > 0): ?><span class="badge"><?= $active_invitation_codes ?></span><?php endif; ?>
      </button>
      <button class="nav-item" onclick="showPanel('settings')">
        <span>⚙️</span> <span>Settings</span>
      </button>
    </nav>
    <div class="sidebar-footer">
      <form method="POST"><button type="submit" name="admin_logout">← Logout</button></form>
    </div>
  </aside>

  <!-- MAIN CONTENT -->
  <main class="main-content">

    <?php if ($action_msg): ?>
    <div class="action-msg <?= $action_type === 'error' ? 'error' : '' ?>">
      <?= htmlspecialchars($action_msg) ?>
    </div>
    <?php endif; ?>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  INVESTORS TAB                                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel active" id="panel-investors">
      <div class="panel-header">
        <h1>Investors</h1>
        <p>Manage all investor accounts, approve/decline, set ROI, and add funds.</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="s-label">Total Investors</div><div class="s-value"><?= $total_investors ?></div></div>
        <div class="stat-card"><div class="s-label">Active</div><div class="s-value green"><?= $active_investors ?></div></div>
        <div class="stat-card"><div class="s-label">Pending</div><div class="s-value amber"><?= $pending_investors ?></div></div>
        <div class="stat-card"><div class="s-label">Total Deposits</div><div class="s-value red"><?= fmtu($total_deposits) ?></div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Portfolio</th>
                <th>Deposit</th>
                <th>Proof</th>
                <th>Balance</th>
                <th>ROI%</th>
                <th>Status</th>
                <th>KYC</th>
                <th>Withdraw</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($investments)): ?>
              <tr><td colspan="11" style="text-align:center;color:var(--muted);padding:32px">No investors yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($investments as $inv): ?>
              <?php
                $st = $inv['status'];
                $bp = admin_investment_badge_class($st);
                $ks = $inv['kyc_status'] ?? 'none';
                $kbp = admin_kyc_badge_class($ks);
                $planConfig = !empty($inv['plan_id']) && isset(PLANS[$inv['plan_id']]) ? PLANS[$inv['plan_id']] : null;
                $planCycle = $planConfig['cycle'] ?? '';
              ?>
              <tr>
                <td>
                  <div style="font-weight:700;color:#fff"><?= htmlspecialchars($inv['user_name']) ?></div>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($inv['user_email']) ?></div>
                </td>
                <td>
                  <strong style="color:#fff"><?= htmlspecialchars($inv['plan_name'] ?: $inv['portfolio']) ?></strong>
                  <?php if (!empty($inv['plan_id'])): ?>
                    <div style="font-size:11px;color:var(--muted)">
                       <?= htmlspecialchars($inv['plan_id']) ?> · <?= number_format((float)($inv['projected_roi'] ?? 0), 0) ?>% projected
                       <?php if ($planCycle): ?> · <?= htmlspecialchars($planCycle) ?> term<?php endif; ?>
                    </div>
                  <?php endif; ?>
                </td>
                <td><span style="color:var(--red);font-weight:800"><?= fmtu((float)$inv['total']) ?></span></td>
                <td>
                  <?php if (!empty($inv['payment_proof_path'])): ?>
                    <a class="btn btn-blue" href="/api/payment-proof.php?id=<?= urlencode($inv['id']) ?>" target="_blank" rel="noopener">📎 View proof</a>
                    <?php if (!empty($inv['payment_proof_name'])): ?>
                      <div style="font-size:10px;color:var(--muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="<?= htmlspecialchars($inv['payment_proof_name']) ?>"><?= htmlspecialchars($inv['payment_proof_name']) ?></div>
                    <?php endif; ?>
                  <?php else: ?>
                    <span style="color:#555;font-size:12px">Not uploaded</span>
                  <?php endif; ?>
                </td>
                <td>
                  <?php if ($inv['roi_percent'] !== null): ?>
                    <span style="color:var(--green);font-weight:800"><?= fmtu((float)$inv['total_current_value']) ?></span>
                    <div style="font-size:11px;color:var(--muted)">Earn: <?= fmtu((float)$inv['earnings']) ?></div>
                  <?php else: ?>
                    <span style="color:var(--muted)">—</span>
                  <?php endif; ?>
                </td>
                <td>
                  <?php if ($inv['roi_percent'] !== null): ?>
                    <span style="color:var(--blue);font-weight:800"><?= number_format((float)$inv['roi_percent'],2) ?>%</span>
                  <?php else: ?>—<?php endif; ?>
                </td>
                <?php $statusLabel = $st === 'pending_approval' ? 'Pending approval' : ucfirst($st); ?>
                <td><span class="badge-pill <?= $bp ?>"><?= htmlspecialchars($statusLabel) ?></span></td>
                <td><span class="badge-pill <?= $kbp ?>"><?= ucfirst($ks) ?></span></td>
                <td>
                  <span style="color:<?= $inv['can_withdraw'] ? 'var(--green)' : '#555' ?>;font-size:16px">
                    <?= $inv['can_withdraw'] ? '🔓' : '🔒' ?>
                  </span>
                </td>
                <td style="color:var(--muted);font-size:11px"><?= date('M j, Y', strtotime($inv['created_at'])) ?></td>
                <td>
                  <div style="display:flex;flex-direction:column;gap:4px;min-width:140px">
                    <?php if ($st === 'pending_approval'): ?>
                    <form method="POST" style="display:inline">
                      <input type="hidden" name="investment_id" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <div style="display:flex;gap:4px">
                      <button class="btn btn-green" name="investment_action" value="active" type="submit">✓ Approve payment</button>
                      <button class="btn btn-red"   name="investment_action" value="declined" type="submit">✗ Decline payment</button>
                      </div>
                    </form>
                    <?php elseif ($st === 'active'): ?>
                    <form method="POST" style="display:inline">
                      <input type="hidden" name="investment_id" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <button class="btn btn-red" name="investment_action" value="declined" type="submit">✗ Deactivate</button>
                    </form>
                    <?php elseif (in_array($st,['declined','cancelled'])): ?>
                    <form method="POST" style="display:inline">
                      <input type="hidden" name="investment_id" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <button class="btn btn-green" name="investment_action" value="active" type="submit">✓ Reactivate</button>
                    </form>
                    <?php endif; ?>

                    <!-- ROI form -->
                    <form method="POST" class="form-inline" style="margin-top:2px">
                      <input type="hidden" name="inv_id_roi" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <input type="number" name="roi_percent" class="finput" style="width:70px" placeholder="ROI%" step="0.01" value="<?= htmlspecialchars($inv['roi_percent'] ?? '') ?>"/>
                      <button class="btn btn-blue" name="update_roi" value="1" type="submit">Set ROI</button>
                    </form>

                    <!-- Add funds -->
                    <form method="POST" class="form-inline" style="margin-top:2px">
                      <input type="hidden" name="inv_id_funds" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <input type="number" name="add_amount" class="finput" style="width:80px" placeholder="$Amount" step="0.01" min="0.01"/>
                      <input type="text" name="add_note" class="finput" style="width:80px" placeholder="Note"/>
                      <button class="btn btn-amber" name="add_funds_submit" value="1" type="submit">+ Funds</button>
                    </form>

                    <!-- Toggle withdraw -->
                    <form method="POST" style="margin-top:2px">
                      <input type="hidden" name="inv_id_wd" value="<?= htmlspecialchars($inv['id']) ?>"/>
                      <button class="btn <?= $inv['can_withdraw'] ? 'btn-red' : 'btn-green' ?>" name="toggle_withdraw" value="1" type="submit">
                        <?= $inv['can_withdraw'] ? '🔒 Disable WD' : '🔓 Enable WD' ?>
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  STORE RECEIPTS TAB                                    -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-store-orders">
      <div class="panel-header">
        <h1>Shop payment receipts</h1>
        <p>Review storefront orders and open the receipt uploaded by each shopper.</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="s-label">Shop orders</div><div class="s-value"><?= count($store_orders) ?></div></div>
        <div class="stat-card"><div class="s-label">Receipts uploaded</div><div class="s-value amber"><?= $store_receipts ?></div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Shopper</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Receipt</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              <?php if (!$store_orders): ?>
                <tr><td colspan="7" style="color:var(--muted);text-align:center;padding:28px">No storefront orders have been submitted.</td></tr>
              <?php else: ?>
                <?php foreach ($store_orders as $order): ?>
                  <tr>
                    <td><strong style="color:#fff">#<?= (int)$order['id'] ?></strong></td>
                    <td>
                      <div style="font-weight:700;color:#fff"><?= htmlspecialchars((string)$order['customer_name']) ?></div>
                      <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars((string)$order['customer_email']) ?></div>
                      <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars((string)$order['customer_phone']) ?></div>
                    </td>
                    <td>
                      <?php foreach (($order['items'] ?? []) as $item): ?>
                        <div><?= htmlspecialchars((string)$item['product_name']) ?> × <?= (int)$item['quantity'] ?></div>
                      <?php endforeach; ?>
                    </td>
                    <td>
                      <strong style="color:#fff"><?= htmlspecialchars((string)($order['payment_method'] ?: 'Payment requested')) ?></strong>
                      <?php if (!empty($order['payment_reference'])): ?>
                        <div style="font-size:11px;color:var(--muted)">Ref: <?= htmlspecialchars((string)$order['payment_reference']) ?></div>
                      <?php endif; ?>
                    </td>
                    <td>
                      <?php if (!empty($order['payment_proof_path'])): ?>
                        <a class="btn btn-blue" href="/store/api/payment-proof.php?id=<?= (int)$order['id'] ?>" target="_blank" rel="noopener">📎 View receipt</a>
                        <?php if (!empty($order['payment_proof_name'])): ?>
                          <div style="font-size:10px;color:var(--muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="<?= htmlspecialchars((string)$order['payment_proof_name']) ?>"><?= htmlspecialchars((string)$order['payment_proof_name']) ?></div>
                        <?php endif; ?>
                      <?php else: ?>
                        <span style="color:#555;font-size:12px">Not uploaded</span>
                      <?php endif; ?>
                    </td>
                    <td><span style="color:<?= !empty($order['payment_proof_path']) ? 'var(--amber)' : 'var(--muted)' ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', (string)$order['status']))) ?></span></td>
                    <td><?= htmlspecialchars(fmtd((string)$order['created_at'])) ?></td>
                  </tr>
                <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  FINANCING TAB                                          -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-financing">
      <div class="panel-header">
        <h1>Vehicle Financing</h1>
        <p>Review shop pre-qualification applications and approve or decline financing requests.</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="s-label">Applications</div><div class="s-value"><?= count($financing_applications) ?></div></div>
        <div class="stat-card"><div class="s-label">Pending Review</div><div class="s-value amber"><?= $pending_financing ?></div></div>
        <div class="stat-card"><div class="s-label">Approved</div><div class="s-value green"><?= count(array_filter($financing_applications, function ($a) { return $a['status'] === 'approved'; })) ?></div></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Vehicle</th>
                <th>Price / Down</th>
                <th>Income</th>
                <th>Term</th>
                <th>Address</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($financing_applications)): ?>
              <tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">No financing applications yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($financing_applications as $application): ?>
              <?php
                $fs = $application['status'];
                $fbp = admin_financing_badge_class($fs);
              ?>
              <tr>
                <td>
                  <div style="font-weight:700;color:#fff"><?= htmlspecialchars($application['customer_name']) ?></div>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($application['customer_email']) ?></div>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($application['customer_phone']) ?></div>
                </td>
                <td>
                  <strong style="color:#fff"><?= htmlspecialchars($application['vehicle_name']) ?></strong>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($application['vehicle_color']) ?></div>
                </td>
                <td>
                  <div style="color:#fff;font-weight:800"><?= fmtu((float)$application['vehicle_total']) ?></div>
                  <div style="font-size:11px;color:var(--muted)">Down: <?= fmtu((float)$application['down_payment']) ?></div>
                </td>
                <td>
                  <div style="color:#fff"><?= fmtu((float)$application['annual_income']) ?>/yr</div>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars(ucwords(str_replace('_', ' ', $application['employment_status']))) ?></div>
                </td>
                <td><?= (int)$application['term_months'] ?> mo</td>
                <td style="font-size:11px;color:var(--muted);min-width:150px">
                  <?= htmlspecialchars($application['street_address']) ?><br/>
                  <?= htmlspecialchars($application['city'] . ', ' . $application['state_region'] . ' ' . $application['postal_code']) ?><br/>
                  <?= htmlspecialchars($application['country']) ?>
                </td>
                <td>
                  <span class="badge-pill <?= $fbp ?>"><?= ucfirst($fs) ?></span>
                  <?php if (!empty($application['admin_note'])): ?>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px"><?= htmlspecialchars($application['admin_note']) ?></div>
                  <?php endif; ?>
                </td>
                <td style="color:var(--muted);font-size:11px"><?= fmtd($application['created_at']) ?></td>
                <td>
                  <?php if ($fs === 'pending'): ?>
                  <form method="POST" class="form-inline">
                    <input type="hidden" name="financing_id" value="<?= htmlspecialchars($application['id']) ?>"/>
                    <input type="text" name="financing_note" class="finput" style="width:130px" placeholder="Optional note"/>
                    <button class="btn btn-green" name="financing_action" value="approved" type="submit">✓ Approve</button>
                    <button class="btn btn-red" name="financing_action" value="declined" type="submit">✗ Decline</button>
                  </form>
                  <?php else: ?>
                    <span style="color:var(--muted);font-size:12px">Reviewed</span>
                  <?php endif; ?>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  KYC TAB                                               -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-kyc">
      <div class="panel-header">
        <h1>KYC Submissions</h1>
        <p>Review identity documents and approve or reject verification requests.</p>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Investor</th>
                <th>Full Name</th>
                <th>DOB</th>
                <th>Nationality</th>
                <th>ID Type</th>
                <th>ID Number</th>
                <th>Documents</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($kyc_list)): ?>
              <tr><td colspan="10" style="text-align:center;color:var(--muted);padding:32px">No KYC submissions yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($kyc_list as $k): ?>
              <?php
                $ks = $k['status'];
                $kbp = admin_kyc_badge_class($ks);
              ?>
              <tr>
                <td>
                  <div style="font-weight:700;color:#fff"><?= htmlspecialchars($k['user_name']) ?></div>
                  <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($k['user_email']) ?></div>
                </td>
                <td><?= htmlspecialchars($k['full_name']) ?></td>
                <td style="font-size:12px;color:var(--muted)"><?= htmlspecialchars($k['date_of_birth']) ?></td>
                <td><?= htmlspecialchars($k['nationality']) ?></td>
                <td><?= htmlspecialchars($k['id_type']) ?></td>
                <td><code style="color:var(--blue);font-size:12px"><?= htmlspecialchars($k['id_number']) ?></code></td>
                <td class="doc-links">
                  <?php if ($k['selfie_path']): ?><a href="/<?= htmlspecialchars($k['selfie_path']) ?>" target="_blank">📸 Selfie</a><?php endif; ?>
                  <?php if (!empty($k['id_doc_path'])): ?><a href="/<?= htmlspecialchars($k['id_doc_path']) ?>" target="_blank">🪪 ID Doc</a><?php endif; ?>
                  <?php if ($k['video_path']): ?><a href="/<?= htmlspecialchars($k['video_path']) ?>" target="_blank">📹 Video</a><?php endif; ?>
                </td>
                <td>
                  <span class="badge-pill <?= $kbp ?>"><?= ucfirst($ks) ?></span>
                  <?php if ($k['admin_note']): ?><div style="font-size:11px;color:var(--muted);margin-top:3px">Note: <?= htmlspecialchars($k['admin_note']) ?></div><?php endif; ?>
                </td>
                <td style="color:var(--muted);font-size:11px"><?= fmtd($k['created_at']) ?></td>
                <td>
                  <?php if ($ks === 'pending'): ?>
                  <form method="POST" class="form-inline">
                    <input type="hidden" name="kyc_id" value="<?= htmlspecialchars($k['id']) ?>"/>
                    <input type="text" name="kyc_note" class="finput" style="width:110px" placeholder="Rejection note"/>
                    <button class="btn btn-green" name="kyc_action" value="verified" type="submit">✓ Verify</button>
                    <button class="btn btn-red"   name="kyc_action" value="rejected" type="submit">✗ Reject</button>
                  </form>
                  <?php elseif ($ks === 'verified'): ?>
                    <span style="color:var(--green);font-size:12px">✅ Verified</span>
                  <?php else: ?>
                    <form method="POST" class="form-inline">
                      <input type="hidden" name="kyc_id" value="<?= htmlspecialchars($k['id']) ?>"/>
                      <input type="hidden" name="kyc_note" value=""/>
                      <button class="btn btn-green" name="kyc_action" value="verified" type="submit">✓ Re-verify</button>
                    </form>
                  <?php endif; ?>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  WITHDRAWALS TAB                                       -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-withdrawals">
      <div class="panel-header">
        <h1>Withdrawals</h1>
        <p>Manage pending and completed withdrawal requests.</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="s-label">Pending</div><div class="s-value amber"><?= count($pending_wds) ?></div></div>
        <div class="stat-card"><div class="s-label">Completed</div><div class="s-value green"><?= count($completed_wds) ?></div></div>
        <div class="stat-card"><div class="s-label">Total Requests</div><div class="s-value"><?= count($withdrawals) ?></div></div>
      </div>

      <!-- Sub-tabs: Pending / Completed -->
      <div class="sub-tabs">
        <button class="sub-tab active" id="wd-tab-pending"   onclick="switchWdTab('pending')">⏳ Pending (<?= count($pending_wds) ?>)</button>
        <button class="sub-tab"        id="wd-tab-completed" onclick="switchWdTab('completed')">✅ Completed (<?= count($completed_wds) ?>)</button>
      </div>

      <!-- PENDING WITHDRAWALS -->
      <div id="wd-panel-pending">
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <?php if (empty($pending_wds)): ?>
                <tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No pending withdrawals. ✅</td></tr>
                <?php endif; ?>
                <?php foreach ($pending_wds as $wd): ?>
                <tr>
                  <td>
                    <div style="font-weight:700;color:#fff"><?= htmlspecialchars($wd['user_name']) ?></div>
                    <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($wd['user_email'] ?? '') ?></div>
                  </td>
                  <td><span style="color:var(--red);font-weight:800"><?= fmtu((float)$wd['amount']) ?></span></td>
                  <td><span class="badge-pill bp-default" style="text-transform:capitalize"><?= htmlspecialchars($wd['method']) ?></span></td>
                  <td style="font-size:12px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis"><?= htmlspecialchars($wd['wallet_address'] ?? '') ?></td>
                  <td style="color:var(--muted);font-size:11px"><?= fmtd($wd['created_at']) ?></td>
                  <td>
                    <form method="POST" class="form-inline">
                      <input type="hidden" name="withdrawal_id" value="<?= htmlspecialchars($wd['id']) ?>"/>
                      <button class="btn btn-green" name="withdrawal_action" value="processed" type="submit">✓ Process</button>
                      <button class="btn btn-red"   name="withdrawal_action" value="declined"  type="submit">✗ Decline</button>
                    </form>
                  </td>
                </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- COMPLETED WITHDRAWALS -->
      <div id="wd-panel-completed" style="display:none">
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Processed</th>
                </tr>
              </thead>
              <tbody>
                <?php if (empty($completed_wds)): ?>
                <tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No completed withdrawals yet.</td></tr>
                <?php endif; ?>
                <?php foreach ($completed_wds as $wd): ?>
                <?php $wbp = $wd['status'] === 'processed' ? 'bp-processed' : 'bp-declined'; ?>
                <tr>
                  <td>
                    <div style="font-weight:700;color:#fff"><?= htmlspecialchars($wd['user_name']) ?></div>
                    <div style="font-size:11px;color:var(--muted)"><?= htmlspecialchars($wd['user_email'] ?? '') ?></div>
                  </td>
                  <td><span style="font-weight:800"><?= fmtu((float)$wd['amount']) ?></span></td>
                  <td style="text-transform:capitalize"><?= htmlspecialchars($wd['method']) ?></td>
                  <td style="font-size:12px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis"><?= htmlspecialchars($wd['wallet_address'] ?? '') ?></td>
                  <td><span class="badge-pill <?= $wbp ?>"><?= ucfirst($wd['status']) ?></span></td>
                  <td style="color:var(--muted);font-size:11px"><?= fmtd($wd['created_at']) ?></td>
                </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  REFERRALS TAB                                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-referrals">
      <div class="panel-header">
        <h1>Referral Program</h1>
        <p>Configure referral bonus settings and view the leaderboard.</p>
      </div>

      <!-- Referral Settings -->
      <div class="card" style="padding:24px;margin-bottom:20px">
        <div class="section-title" style="margin-top:0">⚙️ Referral Settings</div>
        <form method="POST">
          <div class="settings-grid">
            <div class="settings-group">
              <label>Referral Bonus Amount (USD) — credited to referred user on 1st deposit</label>
              <input type="number" name="referral_bonus_amount" value="<?= htmlspecialchars($referral_settings['bonus_amount']) ?>" min="0" step="1"/>
            </div>
            <div class="settings-group">
              <label>Bonus Maturity Period (Days) — days before bonus can be withdrawn</label>
              <input type="number" name="referral_maturity_days" value="<?= htmlspecialchars($referral_settings['maturity_days']) ?>" min="1" step="1"/>
            </div>
          </div>
          <button class="save-btn" name="save_referral_settings" value="1">Save Referral Settings</button>
        </form>
      </div>

      <div class="section-title">🏆 Referral Leaderboard (Top 50 referrers)</div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Referrer Email</th>
                <th>Unique Referrals</th>
                <th>Total Deposits</th>
                <th>Total Earned (Commission)</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($referral_board)): ?>
              <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">No referral activity yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($referral_board as $i => $r): ?>
              <tr>
                <td style="color:var(--muted)"><?= $i+1 ?></td>
                <td style="font-weight:700;color:#fff"><?= htmlspecialchars($r['referrer_email']) ?></td>
                <td><?= (int)$r['unique_refs'] ?></td>
                <td><?= (int)$r['total_deposits'] ?></td>
                <td><span style="color:var(--green);font-weight:800"><?= fmtu((float)$r['total_earned']) ?></span></td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>

      <div class="section-title" style="margin-top:28px">🎁 Referral Bonuses (Referred User $<?= htmlspecialchars($referral_settings['bonus_amount']) ?> credits)</div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Referred Email</th>
                <th>Referred By</th>
                <th>Bonus Amount</th>
                <th>Maturity Days</th>
                <th>Matures On</th>
                <th>Matured?</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($referral_bonuses)): ?>
              <tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No referral bonuses credited yet.</td></tr>
              <?php endif; ?>
              <?php foreach ($referral_bonuses as $rb): ?>
              <?php $matured = strtotime($rb['matured_at']) <= time(); ?>
              <tr>
                <td style="font-weight:700;color:#fff"><?= htmlspecialchars($rb['referred_email']) ?></td>
                <td style="color:var(--muted)"><?= htmlspecialchars($rb['referrer_email']) ?></td>
                <td><span style="color:var(--green);font-weight:800"><?= fmtu((float)$rb['bonus_amount']) ?></span></td>
                <td><?= (int)$rb['maturity_days'] ?> days</td>
                <td style="color:var(--amber)"><?= date('M j, Y', strtotime($rb['matured_at'])) ?></td>
                <td>
                  <?php if ($matured): ?>
                    <span class="badge-pill bp-active">✅ Matured</span>
                  <?php else: ?>
                    <span class="badge-pill bp-pending">⏳ Pending</span>
                  <?php endif; ?>
                </td>
              </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  LIVE CHAT TAB                                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-chat">
      <div class="panel-header">
        <h1>Live Chat</h1>
        <p>Reply to investor support messages in real time.</p>
      </div>
      <div class="chat-main">
        <!-- Session list -->
        <div class="chat-sidebar-pane">
          <div class="chat-list" id="chatSessionList">
            <?php if (empty($chat_sessions)): ?>
            <div style="padding:32px;text-align:center;color:var(--muted);font-size:13px">No chat sessions yet.</div>
            <?php endif; ?>
            <?php foreach ($chat_sessions as $sess): ?>
            <div class="chat-item" onclick="loadChatSession('<?= htmlspecialchars($sess['id']) ?>', '<?= htmlspecialchars(addslashes($sess['user_name'])) ?>', '<?= htmlspecialchars($sess['user_email']) ?>')" id="csess-<?= htmlspecialchars($sess['id']) ?>">
              <div class="chat-avatar"><?= mb_strtoupper(mb_substr($sess['user_name'], 0, 1)) ?></div>
              <div style="flex:1;min-width:0">
                <div class="chat-item-name"><?= htmlspecialchars($sess['user_name']) ?></div>
                <div class="chat-item-preview"><?= htmlspecialchars($sess['last_msg'] ?? 'No messages yet') ?></div>
              </div>
              <div class="chat-item-meta">
                <div class="chat-item-time"><?= date('M j', strtotime($sess['updated_at'])) ?></div>
                <?php if ($sess['unread_admin'] > 0): ?>
                <span class="chat-unread"><?= (int)$sess['unread_admin'] ?></span>
                <?php endif; ?>
              </div>
            </div>
            <?php endforeach; ?>
          </div>
        </div>

        <!-- Messages pane -->
        <div class="chat-messages-pane">
          <div class="chat-msgs-header" id="chatMsgsHeader">Select a conversation to start replying</div>
          <div class="chat-msgs-body" id="chatMsgsBody">
            <div style="text-align:center;color:var(--muted);padding:40px;font-size:13px">
              Click a conversation from the list on the left.
            </div>
          </div>
          <div class="chat-reply-area">
            <textarea id="chatReplyText" placeholder="Type your reply…"></textarea>
            <button onclick="sendChatReply()">Send</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  MARKETING TAB                                         -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-marketing">
      <div class="panel-header">
        <h1>Marketing Emails</h1>
        <p>Send targeted email campaigns to investors. Use <strong style="color:#fff">Force Send</strong> to bypass the throttle if emails aren't going out.</p>
      </div>

      <?php
        // Investor counts for display
        try {
          $db_mk = get_db();
          $no_dep_count    = (int)$db_mk->query("SELECT COUNT(DISTINCT user_email) FROM investments WHERE total=0 AND status IN ('pending','active')")->fetchColumn();
          $active_count    = (int)$db_mk->query("SELECT COUNT(DISTINCT user_email) FROM investments WHERE status='active'")->fetchColumn();
          $investor_count  = (int)$db_mk->query("SELECT COUNT(DISTINCT user_email) FROM investments WHERE user_email <> ''")->fetchColumn();
          $log_count       = (int)$db_mk->query("SELECT COUNT(*) FROM marketing_emails_log")->fetchColumn();
        } catch(Throwable $e) { $no_dep_count = $active_count = $log_count = 0; }
      ?>

      <!-- Force Send + Clear Throttle controls -->
      <div class="card" style="padding:20px;margin-bottom:24px;background:#0d1a0d;border:1px solid #22c55e33;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="font-size:18px;">⚙️</div>
          <div style="flex:1;">
            <div style="font-weight:700;color:#22c55e;font-size:14px;margin-bottom:4px;">Throttle Controls</div>
            <div style="color:var(--muted);font-size:12px;">Log has <strong style="color:#fff;"><?= $log_count ?></strong> recent email records. If campaigns are showing "0 sent", clear the throttle log and try again.</div>
          </div>
          <form method="POST" style="flex-shrink:0">
            <button name="clear_marketing_log" value="1" class="save-btn" style="background:#22c55e;padding:8px 16px;font-size:13px;" onclick="return confirm('Clear all throttle records? This lets you re-send to everyone.')">🗑 Clear Throttle Log</button>
          </form>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <!-- No deposit reminder -->
        <div class="card" style="padding:24px">
          <div style="font-size:22px;margin-bottom:12px">⏳</div>
          <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px">No Deposit Reminder</div>
          <div style="font-size:12px;color:var(--amber);margin-bottom:10px;">📊 <?= $no_dep_count ?> eligible investor(s)</div>
          <p style="color:var(--muted);font-size:13px;line-height:1.6;margin-bottom:20px">
            Send a reminder to investors who have registered but haven't made their first deposit yet.
            <br/><br/>
            <strong style="color:#fff">Throttle:</strong> Max once every 7 days (or check Force Send).
          </p>
          <form method="POST">
            <input type="hidden" name="marketing_type" value="no_deposit"/>
            <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:12px;cursor:pointer;">
              <input type="checkbox" name="force_send" value="1" style="accent-color:#e31937;width:15px;height:15px;"> Force Send (ignore throttle)
            </label>
            <button class="save-btn" name="marketing_blast" value="1">📧 Send No-Deposit Reminders</button>
          </form>
        </div>

        <!-- Referral share nudge -->
        <div class="card" style="padding:24px">
          <div style="font-size:22px;margin-bottom:12px">🔗</div>
          <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px">Referral Share Nudge</div>
          <div style="font-size:12px;color:var(--amber);margin-bottom:10px;">📊 <?= $active_count ?> eligible investor(s)</div>
          <p style="color:var(--muted);font-size:13px;line-height:1.6;margin-bottom:20px">
            Send referral promotion emails to active investors, reminding them to share their code.
            <br/><br/>
            <strong style="color:#fff">Throttle:</strong> Max once every 14 days (or check Force Send).
          </p>
          <form method="POST">
            <input type="hidden" name="marketing_type" value="referral_share"/>
            <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:12px;cursor:pointer;">
              <input type="checkbox" name="force_send" value="1" style="accent-color:#e31937;width:15px;height:15px;"> Force Send (ignore throttle)
            </label>
            <button class="save-btn" name="marketing_blast" value="1">📣 Send Referral Nudges</button>
          </form>
        </div>
      </div>

      <!-- Custom broadcast to ALL investor accounts -->
      <div class="section-title">📢 Custom Broadcast to All Investor Accounts</div>
      <div class="card" style="padding:24px;margin-bottom:0">
        <div style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.6;">
          Send a custom message directly to <strong style="color:#fff"><?= $investor_count ?></strong> investor account(s). Use this for announcements, new plan launches, etc.<br>
          <strong style="color:#f59e0b">Throttle:</strong> Max once per day per investor. Check Force Send to override.
        </div>
        <form method="POST">
          <input type="hidden" name="marketing_type" value="all_investors"/>
          <div class="settings-group">
            <label>Email Subject</label>
            <input type="text" name="custom_subject" placeholder="e.g. Important Update — Tesla Trade Inc" style="width:100%"/>
          </div>
          <div class="settings-group">
            <label>Message Body</label>
            <textarea name="custom_body" rows="6" placeholder="Write your message here. Use plain text — it will be formatted automatically. You can use line breaks." style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:#fff;padding:10px 12px;font-size:13px;resize:vertical;outline:none;"></textarea>
          </div>
          <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:16px;cursor:pointer;">
            <input type="checkbox" name="force_send" value="1" style="accent-color:#e31937;width:15px;height:15px;"> Force Send (ignore daily throttle)
          </label>
          <button class="save-btn" name="marketing_blast" value="1" onclick="return confirm('Send this custom email to all investor accounts?')">📨 Send Custom Broadcast</button>
        </form>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  INVITATION ACCESS TAB                                  -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-access">
      <div class="panel-header">
        <h1>Invitation access</h1>
        <p>Control who can create a new investor account without editing server files.</p>
      </div>

      <div class="access-hero">
        <div class="access-hero-icon">🔐</div>
        <div>
          <h2>Invitation codes are now managed here</h2>
          <p>
            Active codes work for new email and social signups. Revoking a code stops
            new registrations immediately, while existing investor accounts stay unchanged.
            Rotation revokes every active code and creates one fresh code.
          </p>
          <div class="access-actions">
            <form method="POST">
              <button class="save-btn" name="invitation_action" value="generate" type="submit">＋ Generate code</button>
            </form>
            <form method="POST">
              <button class="btn btn-red" name="invitation_action" value="rotate" type="submit"
                onclick="return confirm('Rotate all active invitation codes? Existing links will stop working immediately.')">
                ↻ Rotate active codes
              </button>
            </form>
          </div>
          <div class="access-note">
            <strong><?= $active_invitation_codes ?></strong> active code(s) ·
            <strong><?= $revoked_invitation_codes ?></strong> revoked code(s).
            Generate adds another usable code; rotate replaces all currently active codes.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="code-history">
            <thead>
              <tr>
                <th>Invitation code</th>
                <th>Status</th>
                <th>Source</th>
                <th>Created</th>
                <th>Last change</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($invitation_codes)): ?>
              <tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No invitation codes found. Generate one to open signup access.</td></tr>
              <?php endif; ?>
              <?php foreach ($invitation_codes as $codeRow): ?>
                <?php
                  $codeStatus = strtolower((string)$codeRow['status']);
                  $lastChange = $codeStatus === 'revoked' ? ($codeRow['revoked_at'] ?? '') : ($codeRow['reinstated_at'] ?? '');
                  $codeUrl = admin_invitation_link((string)$codeRow['code']);
                ?>
                <tr>
                  <td>
                    <span class="code-token"><?= htmlspecialchars($codeRow['code']) ?></span>
                    <a class="code-link" href="<?= htmlspecialchars($codeUrl) ?>" target="_blank" rel="noopener" title="<?= htmlspecialchars($codeUrl) ?>">
                      <?= htmlspecialchars($codeUrl) ?>
                    </a>
                    <button type="button" class="btn btn-neutral copy-link-button" data-copy="<?= htmlspecialchars($codeUrl) ?>">Copy link</button>
                  </td>
                  <td><span class="access-status <?= htmlspecialchars($codeStatus) ?>"><?= ucfirst($codeStatus) ?></span></td>
                  <td style="color:var(--muted);text-transform:capitalize"><?= htmlspecialchars((string)$codeRow['source']) ?></td>
                  <td style="color:var(--muted);font-size:11px"><?= fmtd((string)$codeRow['created_at']) ?></td>
                  <td style="color:var(--muted);font-size:11px"><?= $lastChange ? fmtd((string)$lastChange) : '—' ?></td>
                  <td>
                    <form method="POST">
                      <input type="hidden" name="invitation_code_id" value="<?= (int)$codeRow['id'] ?>"/>
                      <?php if ($codeStatus === 'active'): ?>
                        <button class="btn btn-red" name="invitation_action" value="revoke" type="submit"
                          onclick="return confirm('Revoke this invitation code? Existing signup links using it will stop working.')">Revoke</button>
                      <?php else: ?>
                        <button class="btn btn-green" name="invitation_action" value="reinstate" type="submit">Reinstate</button>
                      <?php endif; ?>
                    </form>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </div>
      <div class="access-note">
        <strong>Deployment note:</strong> the original <code>TT_INVITATION_CODE</code> value is
        imported automatically on first database connection. After that, this ledger controls
        signup validation, so rotations do not require a cPanel edit.
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════ -->
    <!--  SETTINGS TAB                                          -->
    <!-- ══════════════════════════════════════════════════════ -->
    <div class="panel" id="panel-settings">
      <div class="panel-header">
        <h1>Settings</h1>
        <p>Configure trading behavior, payment methods, email, and Telegram notifications.</p>
      </div>

      <!-- TRADING SETTINGS -->
      <div class="section-title">📈 Trading Timing &amp; Movement</div>
      <div class="card" style="padding:24px;margin-bottom:24px;background:linear-gradient(135deg,#111 0%,#0d1711 100%);border-color:#22c55e33">
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:20px">
          <div style="font-size:22px">⏱️</div>
          <div>
            <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px">Control the live trading phases</div>
            <div style="font-size:12px;line-height:1.6;color:var(--muted)">
              Active trades alternate between these profit and loss windows. The investor chart and current trade value use these settings on the next refresh.
              Rates are applied across each window; they are simulation controls, not a promise of returns.
            </div>
          </div>
        </div>
        <form method="POST">
          <div class="settings-grid">
            <div class="settings-group">
              <label>Profit phase interval (seconds)</label>
              <input type="number" name="profit_interval_seconds" min="1" max="86400" step="1" required value="<?= htmlspecialchars($trading_settings['profitIntervalSeconds']) ?>"/>
              <div style="font-size:11px;color:#22c55e;margin-top:5px">How long the graph remains in its green/up phase.</div>
            </div>
            <div class="settings-group">
              <label>Loss phase interval (seconds)</label>
              <input type="number" name="loss_interval_seconds" min="1" max="86400" step="1" required value="<?= htmlspecialchars($trading_settings['lossIntervalSeconds']) ?>"/>
              <div style="font-size:11px;color:#f87171;margin-top:5px">How long the graph remains in its red/down phase.</div>
            </div>
            <div class="settings-group">
              <label>Profit movement per phase (%)</label>
              <input type="number" name="profit_rate_percent" min="0" max="100" step="0.01" required value="<?= htmlspecialchars($trading_settings['profitRatePercent']) ?>"/>
            </div>
            <div class="settings-group">
              <label>Loss movement per phase (%)</label>
              <input type="number" name="loss_rate_percent" min="0" max="100" step="0.01" required value="<?= htmlspecialchars($trading_settings['lossRatePercent']) ?>"/>
            </div>
          </div>
          <button class="save-btn" name="save_trading_settings" value="1">💾 Save Trading Controls</button>
        </form>
      </div>

      <!-- PAYMENT SETTINGS -->
      <div class="section-title">💳 Payment Settings</div>
      <div class="card" style="padding:24px;margin-bottom:24px">
        <form method="POST">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">USDT (TRC-20)</div>
              <?php $usdt = $payment_settings['usdt'] ?? []; ?>
              <div class="settings-group"><label>Label</label><input type="text" name="usdt[label]" value="<?= htmlspecialchars($usdt['label'] ?? 'Tether (USDT)') ?>"/></div>
              <div class="settings-group"><label>Network</label><input type="text" name="usdt[network]" value="<?= htmlspecialchars($usdt['network'] ?? 'TRC-20') ?>"/></div>
              <div class="settings-group"><label>Wallet Address</label><input type="text" name="usdt[address]" value="<?= htmlspecialchars(($usdt['address'] ?? '') ?: (WALLET_USDT ?: 'SAMPLE-USDT-ADDRESS-UPDATE-IN-ADMIN')) ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Ethereum (ETH)</div>
              <?php $eth = $payment_settings['eth'] ?? []; ?>
              <div class="settings-group"><label>Label</label><input type="text" name="eth[label]" value="<?= htmlspecialchars($eth['label'] ?? 'Ethereum (ETH)') ?>"/></div>
              <div class="settings-group"><label>Network</label><input type="text" name="eth[network]" value="<?= htmlspecialchars($eth['network'] ?? 'ERC-20') ?>"/></div>
              <div class="settings-group"><label>Wallet Address</label><input type="text" name="eth[address]" value="<?= htmlspecialchars(($eth['address'] ?? '') ?: (WALLET_ETH ?: 'SAMPLE-ETH-ADDRESS-UPDATE-IN-ADMIN')) ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Bitcoin (BTC)</div>
              <?php $btc = $payment_settings['btc'] ?? []; ?>
              <div class="settings-group"><label>Label</label><input type="text" name="btc[label]" value="<?= htmlspecialchars($btc['label'] ?? 'Bitcoin (BTC)') ?>"/></div>
              <div class="settings-group"><label>Network</label><input type="text" name="btc[network]" value="<?= htmlspecialchars($btc['network'] ?? 'Bitcoin') ?>"/></div>
              <div class="settings-group"><label>Wallet Address</label><input type="text" name="btc[address]" value="<?= htmlspecialchars(($btc['address'] ?? '') ?: (WALLET_BTC ?: 'SAMPLE-BTC-ADDRESS-UPDATE-IN-ADMIN')) ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Bank Transfer</div>
              <?php $bank = $payment_settings['bank'] ?? []; ?>
              <div class="settings-group"><label>Bank Name</label><input type="text" name="bank[name]" value="<?= htmlspecialchars(($bank['name'] ?? '') ?: (BANK_NAME ?: 'Sample Bank (Replace in Admin)')) ?>"/></div>
              <div class="settings-group"><label>Account Number</label><input type="text" name="bank[account]" value="<?= htmlspecialchars(($bank['account'] ?? '') ?: (BANK_ACCOUNT ?: '0000000000')) ?>"/></div>
              <div class="settings-group"><label>Routing Number</label><input type="text" name="bank[routing]" value="<?= htmlspecialchars(($bank['routing'] ?? '') ?: (BANK_ROUTING ?: '000000000')) ?>"/></div>
              <div class="settings-group"><label>SWIFT / BIC Code</label><input type="text" name="bank[swift]" value="<?= htmlspecialchars(($bank['swift'] ?? '') ?: (BANK_SWIFT ?: 'SAMPLEXXX')) ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Venmo</div>
              <?php $venmo = $payment_settings['venmo'] ?? []; ?>
              <div class="settings-group"><label>Venmo Handle / Username</label><input type="text" name="venmo[handle]" value="<?= htmlspecialchars(($venmo['handle'] ?? '') ?: '@sample-venmo-update-in-admin') ?>" placeholder="@username"/></div>
              <div class="settings-group"><label>Display Label</label><input type="text" name="venmo[label]" value="<?= htmlspecialchars($venmo['label'] ?? 'Venmo') ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Cash App</div>
              <?php $cashapp = $payment_settings['cashapp'] ?? []; ?>
              <div class="settings-group"><label>Cash App Handle / Username</label><input type="text" name="cashapp[handle]" value="<?= htmlspecialchars(($cashapp['handle'] ?? '') ?: '$sampleCashApp-update-in-admin') ?>" placeholder="$username"/></div>
              <div class="settings-group"><label>Display Label</label><input type="text" name="cashapp[label]" value="<?= htmlspecialchars($cashapp['label'] ?? 'Cash App') ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">PayPal</div>
              <?php $paypal = $payment_settings['paypal'] ?? []; ?>
              <div class="settings-group"><label>PayPal Email / Handle</label><input type="text" name="paypal[handle]" value="<?= htmlspecialchars(($paypal['handle'] ?? '') ?: 'sample-paypal@update-in-admin.example') ?>" placeholder="payments@yourdomain.com"/></div>
              <div class="settings-group"><label>Display Label</label><input type="text" name="paypal[label]" value="<?= htmlspecialchars($paypal['label'] ?? 'PayPal') ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Alipay</div>
              <?php $alipay = $payment_settings['alipay'] ?? []; ?>
              <div class="settings-group"><label>Alipay Account / QR</label><input type="text" name="alipay[account]" value="<?= htmlspecialchars(($alipay['account'] ?? '') ?: 'sample-alipay-update-in-admin') ?>" placeholder="Phone / email / QR URL"/></div>
              <div class="settings-group"><label>Display Label</label><input type="text" name="alipay[label]" value="<?= htmlspecialchars($alipay['label'] ?? 'Alipay') ?>"/></div>
            </div>

            <div>
              <div style="color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">WeChat Pay</div>
              <?php $wechat = $payment_settings['wechat'] ?? []; ?>
              <div class="settings-group"><label>WeChat Account / QR</label><input type="text" name="wechat[account]" value="<?= htmlspecialchars(($wechat['account'] ?? '') ?: 'sample-wechat-update-in-admin') ?>" placeholder="WeChat ID / QR URL"/></div>
              <div class="settings-group"><label>Display Label</label><input type="text" name="wechat[label]" value="<?= htmlspecialchars($wechat['label'] ?? 'WeChat Pay') ?>"/></div>
            </div>

          </div>
          <div style="margin-top:20px">
            <button class="save-btn" name="save_payment_settings" value="1">💾 Save Payment Settings</button>
          </div>
        </form>
      </div>

      <!-- EMAIL SETTINGS -->
      <div class="section-title">📧 Email Settings</div>
      <div class="card" style="padding:24px;margin-bottom:24px">
        <?php
          $es_name  = $email_settings['senderName']  ?? SENDER_NAME;
          $es_email = $email_settings['senderEmail'] ?? SENDER_EMAIL;
          $es_admin = $email_settings['adminEmail']  ?? ADMIN_EMAIL;
        ?>
        <form method="POST">
          <div class="settings-grid">
            <div class="settings-group"><label>Sender Name</label><input type="text" name="senderName" value="<?= htmlspecialchars($es_name) ?>"/></div>
            <div class="settings-group"><label>Resend Sender Email (must be verified in Resend)</label><input type="email" name="senderEmail" value="<?= htmlspecialchars($es_email) ?>"/></div>
            <div class="settings-group"><label>Reply-To Email (optional)</label><input type="email" name="replyTo" value="<?= htmlspecialchars($email_settings['replyTo'] ?? '') ?>" placeholder="support@yourdomain.com"/></div>
            <div class="settings-group"><label>Admin Notification Email</label><input type="email" name="adminEmail" value="<?= htmlspecialchars($es_admin) ?>"/></div>
          </div>
          <button class="save-btn" name="save_email_settings" value="1">💾 Save Email Settings</button>
        </form>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px">Test your email configuration:</div>
          <form method="POST" class="form-inline">
            <input type="email" name="test_email_to" class="finput" placeholder="Send test to…" style="width:220px" value="<?= htmlspecialchars($es_admin) ?>"/>
            <button class="btn btn-blue" name="test_email" value="1" type="submit">📧 Send Test Email</button>
          </form>
        </div>
      </div>

      <!-- TELEGRAM SETTINGS -->
      <div class="section-title">📱 Telegram Settings</div>
      <div class="card" style="padding:24px">
        <?php
          $tg_masked = !empty($telegram_settings['botToken'])
            ? substr($telegram_settings['botToken'], 0, 8) . '••••••••'
            : '';
          $tg_chat   = $telegram_settings['chatId'] ?? '';
        ?>
        <form method="POST">
          <div class="settings-grid">
            <div class="settings-group">
              <label>Bot Token (leave blank to keep existing)</label>
              <input type="text" name="telegram_bot_token" placeholder="<?= $tg_masked ?: 'Enter a Telegram bot token' ?>"/>
            </div>
            <div class="settings-group">
              <label>Chat ID</label>
              <input type="text" name="telegram_chat_id" value="<?= htmlspecialchars($tg_chat) ?>" placeholder="e.g. -1001234567890"/>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:center">
            <button class="save-btn" name="save_telegram_settings" value="1">💾 Save Telegram Settings</button>
            <button class="save-btn" name="test_telegram" value="1" style="background:var(--blue)">📱 Test Telegram</button>
          </div>
        </form>
      </div>
    </div>

  </main>
</div>
<?php endif; ?>

<script>
// ── Panel switching ────────────────────────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const btn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + name + "'"));
  if (btn) btn.classList.add('active');
  // Scroll to top
  document.querySelector('.main-content')?.scrollTo({ top: 0 });
  if (window.location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

const initialPanel = (window.location.hash || '').replace(/^#panel-/, '').replace(/^#/, '');
if (initialPanel && document.getElementById('panel-' + initialPanel)) {
  showPanel(initialPanel);
}

// ── Withdrawal sub-tabs ────────────────────────────────────────
function switchWdTab(which) {
  document.getElementById('wd-panel-pending').style.display   = which === 'pending'   ? 'block' : 'none';
  document.getElementById('wd-panel-completed').style.display = which === 'completed' ? 'block' : 'none';
  document.getElementById('wd-tab-pending').classList.toggle('active',   which === 'pending');
  document.getElementById('wd-tab-completed').classList.toggle('active', which === 'completed');
}

// ── Chat ─────────────────────────────────────────────────────
let currentSessionId   = null;
let currentSessionName = '';
let lastMsgId          = 0;
let chatPollInterval   = null;

function loadChatSession(sessionId, name, email) {
  currentSessionId   = sessionId;
  currentSessionName = name;
  lastMsgId          = 0;

  document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('selected'));
  const el = document.getElementById('csess-' + sessionId);
  if (el) el.classList.add('selected');

  document.getElementById('chatMsgsHeader').textContent = name + (email ? ' — ' + email : '');
  document.getElementById('chatMsgsBody').innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px">Loading…</div>';

  // Mark read
  fetch('/api/chat/read', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': '<?= ADMIN_TOKEN ?>' },
    body: JSON.stringify({ sessionId })
  });

  // Remove unread badge
  const badge = el?.querySelector('.chat-unread');
  if (badge) badge.remove();

  fetchMessages(true);
  clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => fetchMessages(false), 4000);
}

function fetchMessages(reset) {
  if (!currentSessionId) return;
  fetch('/api/chat/messages?sessionId=' + encodeURIComponent(currentSessionId) + '&since=' + lastMsgId, {
    credentials: 'same-origin'
  })
    .then(r => r.json())
    .then(data => {
      const msgs = data.messages || [];
      const body = document.getElementById('chatMsgsBody');
      if (reset && msgs.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px">No messages yet. Start the conversation!</div>';
        return;
      }
      if (msgs.length === 0) return;
      if (reset) body.innerHTML = '';
      msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + (msg.sender === 'admin' ? 'admin' : 'user');
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = '<div>' + escHtml(msg.message) + '</div><div class="chat-msg-time">' + (msg.sender === 'admin' ? 'You' : currentSessionName) + ' · ' + time + '</div>';
        body.appendChild(div);
        lastMsgId = Math.max(lastMsgId, parseInt(msg.id));
      });
      body.scrollTop = body.scrollHeight;
    })
    .catch(() => {});
}

function sendChatReply() {
  const textarea = document.getElementById('chatReplyText');
  const msg = textarea.value.trim();
  if (!msg || !currentSessionId) return;
  textarea.value = '';
  textarea.disabled = true;
  fetch('/api/chat/admin-reply', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': '<?= ADMIN_TOKEN ?>' },
    body: JSON.stringify({ sessionId: currentSessionId, message: msg })
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success !== true) {
      throw new Error(data.error || 'The reply could not be sent.');
    }
    return fetchMessages(false);
  }).catch(error => {
    textarea.value = msg;
    window.alert(error.message || 'The reply could not be sent.');
  }).finally(() => {
    textarea.disabled = false;
    textarea.focus();
  });
}

document.getElementById('chatReplyText')?.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatReply();
  }
});

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

document.querySelectorAll('.copy-link-button').forEach(button => {
  button.addEventListener('click', async () => {
    const value = button.getAttribute('data-copy') || '';
    try {
      await navigator.clipboard.writeText(value);
      const previous = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = previous; }, 1400);
    } catch (error) {
      window.prompt('Copy this invitation link:', value);
    }
  });
});
</script>
</body>
</html>
