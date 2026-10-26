<?php
/**
 * Tesla Trade Inc — Investor Profile Page
 * Investors can view and update their profile details here.
 *
 * The modal on the dashboard links here as a fallback; the primary
 * experience is the in-dashboard profile modal (no redirect needed).
 */

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/db.php';

if (session_status() === PHP_SESSION_NONE) session_start();

// ── Require authenticated investor session ────────────────────
$_sessionEmail = strtolower(trim($_SESSION['investor_email'] ?? ''));
if (!$_sessionEmail) {
    header('Location: /');
    exit;
}

// Normalize and lock down to the session owner — ignore any email in the URL
$email = $_sessionEmail;
$invId = trim($_GET['id'] ?? $_POST['id'] ?? '');

$inv   = null;
$prof  = ['phone'=>'','country'=>'','address'=>''];
$error = '';
$saved = false;

// ── Load investor data ────────────────────────────────────────
if ($email) {
    try {
        $db = get_db();

        $st = $db->prepare(
            'SELECT user_name, user_email, portfolio, created_at, kyc_status
             FROM investments
             WHERE user_email=?' . ($invId ? ' AND id=?' : '') . ' LIMIT 1'
        );
        $params = $invId ? [$email, $invId] : [$email];
        $st->execute($params);
        $inv = $st->fetch();

        if ($inv) {
            $stP = $db->prepare('SELECT phone, country, address FROM user_profiles WHERE email=?');
            $stP->execute([$email]);
            $prof = $stP->fetch() ?: $prof;
        }
    } catch (Throwable $e) {
        $error = 'Database error. Please try again later.';
    }
}

// ── Handle profile update ─────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $inv) {
    $name    = trim($_POST['name']    ?? '');
    $phone   = trim($_POST['phone']   ?? '');
    $country = trim($_POST['country'] ?? '');
    $address = trim($_POST['address'] ?? '');

    if (!$name) {
        $error = 'Full name is required.';
    } else {
        try {
            $db = get_db();

            // Update name in all investments for this email
            $stName = $db->prepare('UPDATE investments SET user_name=? WHERE user_email=?');
            $stName->execute([$name, $email]);

            // Upsert extended profile
            $stProf = $db->prepare(
                'INSERT INTO user_profiles (email, phone, country, address) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE phone=VALUES(phone), country=VALUES(country), address=VALUES(address)'
            );
            $stProf->execute([$email, $phone, $country, $address]);

            $inv['user_name'] = $name;
            $prof = ['phone'=>$phone,'country'=>$country,'address'=>$address];
            $saved = true;
        } catch (Throwable $e) {
            $error = 'Save failed. Please try again.';
        }
    }
}

$name     = htmlspecialchars($inv['user_name']  ?? '');
$emailStr = htmlspecialchars($inv['user_email'] ?? $email);
$plan     = htmlspecialchars($inv['portfolio']  ?? '');
$since    = $inv['created_at'] ? substr($inv['created_at'], 0, 10) : '';
$kycSt    = $inv['kyc_status'] ?? 'none';
$phone    = htmlspecialchars($prof['phone']   ?? '');
$country  = htmlspecialchars($prof['country'] ?? '');
$address  = htmlspecialchars($prof['address'] ?? '');

$kycBadge = match($kycSt) {
    'verified' => '<span style="background:#0a2e12;color:#22c55e;border:1px solid #22c55e44;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">✓ KYC Verified</span>',
    'pending'  => '<span style="background:#2d2000;color:#f59e0b;border:1px solid #f59e0b44;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">⏳ KYC Pending</span>',
    'rejected' => '<span style="background:#2d0000;color:#ef4444;border:1px solid #ef444444;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">✕ KYC Rejected</span>',
    default    => '<span style="background:#1a1a1a;color:#666;border:1px solid #2a2a2a;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">KYC Not Submitted</span>',
};
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Profile — Tesla Trade Inc</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/assets/trace-fund-experience.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #060606;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
      min-height: 100vh;
      padding: 0;
    }

    /* ── Top nav ── */
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: rgba(8,8,8,0.96);
      border-bottom: 1px solid #1c1c1c;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .nav-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: #fff;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -.2px;
    }
    .nav-logo svg { flex-shrink: 0; }
    .nav-back {
      background: #111;
      border: 1px solid #2a2a2a;
      border-radius: 9px;
      padding: 8px 16px;
      color: #aaa;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-back:hover { border-color: #3a3a3a; color: #fff; }

    /* ── Page shell ── */
    .page {
      max-width: 560px;
      margin: 0 auto;
      padding: 32px 16px 60px;
    }

    .page-title {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 4px;
    }
    .page-sub {
      font-size: 13px;
      color: #555;
      margin-bottom: 28px;
    }

    /* ── Cards ── */
    .card {
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 18px;
      padding: 22px 20px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: #888;
      text-transform: uppercase;
      letter-spacing: .6px;
      margin-bottom: 16px;
    }

    /* ── Account summary ── */
    .account-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e31937 0%, #7b0000 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
      font-weight: 800;
      color: #fff;
    }
    .account-name  { font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 3px; }
    .account-email { font-size: 12px; color: #555; }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .meta-item {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .meta-label { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
    .meta-val   { font-size: 13px; font-weight: 700; color: #ddd; }

    /* ── Form fields ── */
    label {
      display: block;
      font-size: 11px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 5px;
    }
    input[type="text"],
    input[type="tel"],
    input[type="email"] {
      width: 100%;
      background: #0d0d0d;
      border: 1px solid #252525;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      color: #ddd;
      outline: none;
      margin-bottom: 16px;
      font-family: inherit;
      transition: border-color .15s;
    }
    input:focus { border-color: #444; }
    input[readonly] { color: #4a4a4a; cursor: default; }

    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .btn-save {
      width: 100%;
      background: #e31937;
      color: #fff;
      border: none;
      border-radius: 11px;
      padding: 13px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      margin-top: 4px;
      transition: opacity .15s;
    }
    .btn-save:hover { opacity: .88; }

    /* ── Alerts ── */
    .alert {
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 13px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    .alert-success { background: #0a2e12; border: 1px solid #22c55e44; color: #22c55e; }
    .alert-error   { background: #2d0000; border: 1px solid #ef444444; color: #ef4444; }

    /* ── No-account screen ── */
    .empty {
      text-align: center;
      padding: 60px 20px;
    }
    .empty-icon  { font-size: 52px; margin-bottom: 16px; }
    .empty-title { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .empty-sub   { font-size: 13px; color: #555; }

    @media (max-width: 420px) {
      .meta-grid  { grid-template-columns: 1fr; }
      .field-row  { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<a class="trace-skip-link" href="#main-content">Skip to content</a>
<div class="trace-disclosure" role="note"></div>

<!-- Top nav -->
<nav class="nav">
  <a href="/" class="nav-logo">
    <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
      <path d="M50 5 L95 27V73L50 95L5 73V27L50 5Z" fill="#e31937"/>
      <path d="M35 38H65V44H54V68H46V44H35V38Z" fill="#fff"/>
    </svg>
    Tesla Trade Inc
  </a>
  <a href="javascript:history.back()" class="nav-back">← Back to Dashboard</a>
</nav>

<div class="page" id="main-content">

  <?php if (!$email): ?>
    <!-- No email provided — show instructions -->
    <div class="empty">
      <div class="empty-icon">🔗</div>
      <div class="empty-title">Link Required</div>
      <div class="empty-sub">Please use the Profile button on your investor dashboard to access this page.</div>
    </div>

  <?php elseif (!$inv): ?>
    <!-- Email provided but no account found -->
    <div class="empty">
      <div class="empty-icon">❌</div>
      <div class="empty-title">Account Not Found</div>
      <div class="empty-sub">No investment account was found for <strong><?= $emailStr ?></strong>.<br>Please contact support if you believe this is an error.</div>
    </div>

  <?php else: ?>

    <div class="page-title">My Profile</div>
    <div class="page-sub">View and update your account information</div>

    <?php if ($saved): ?>
      <div class="alert alert-success">✓ Profile updated successfully!</div>
    <?php endif; ?>
    <?php if ($error): ?>
      <div class="alert alert-error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <!-- Account summary card -->
    <div class="card">
      <div class="card-title">Account Overview</div>
      <div class="account-row">
        <div class="avatar"><?= mb_strtoupper(mb_substr($name ?: $emailStr, 0, 1)) ?></div>
        <div>
          <div class="account-name"><?= $name ?: 'Investor' ?></div>
          <div class="account-email"><?= $emailStr ?></div>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Investment Plan</div>
          <div class="meta-val"><?= $plan ?: '—' ?></div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Member Since</div>
          <div class="meta-val"><?= $since ?: '—' ?></div>
        </div>
        <div class="meta-item" style="grid-column:1/-1;">
          <div class="meta-label">KYC Status</div>
          <div class="meta-val" style="margin-top:4px;"><?= $kycBadge ?></div>
        </div>
      </div>
    </div>

    <!-- Edit profile form -->
    <div class="card">
      <div class="card-title">Edit Profile</div>

      <form method="POST">
        <input type="hidden" name="email" value="<?= htmlspecialchars($email) ?>" />
        <input type="hidden" name="id"    value="<?= htmlspecialchars($invId) ?>" />

        <label>Full Name *</label>
        <input type="text" name="name" value="<?= $name ?>" placeholder="Your full legal name" required />

        <label>Email Address</label>
        <input type="email" value="<?= $emailStr ?>" readonly title="Email cannot be changed" />

        <div class="field-row">
          <div>
            <label>Phone Number</label>
            <input type="tel" name="phone" value="<?= $phone ?>" placeholder="+1 555 000 0000" />
          </div>
          <div>
            <label>Country</label>
            <input type="text" name="country" value="<?= $country ?>" placeholder="United States" />
          </div>
        </div>

        <label>Residential Address</label>
        <input type="text" name="address" value="<?= $address ?>" placeholder="123 Main St, City, State" />

        <button type="submit" class="btn-save">Save Changes</button>
      </form>
    </div>

  <?php endif; ?>

</div><!-- /page -->
</body>
</html>
