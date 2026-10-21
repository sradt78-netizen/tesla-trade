import { getDbConnection, loadDatabase } from './db.js';
import { logUserAction } from './logger.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

/**
 * Resolves Resend configuration from environment variables,
 * database app_settings, or in-memory persistent store.
 */
export async function getMailerConfig() {
  let apiKey = cleanString(
    process.env.RESEND_API_KEY || process.env.TT_RESEND_API_KEY || process.env.VITE_RESEND_API_KEY
  );
  let fromEmail = cleanString(
    process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || process.env.RESEND_SENDER_EMAIL
  ) || '';
  let adminEmail = cleanString(
    process.env.ADMIN_EMAIL || process.env.TT_ADMIN_EMAIL
  ) || 'admin@teslawealths.org';

  try {
    const db = loadDatabase();
    if (db && db.app_settings) {
      if (!apiKey && db.app_settings.resend_api_key) apiKey = cleanString(db.app_settings.resend_api_key);
      if (!fromEmail && db.app_settings.resend_from_email) fromEmail = cleanString(db.app_settings.resend_from_email);
      if (db.app_settings.admin_email) adminEmail = cleanString(db.app_settings.admin_email);
    }
  } catch (e) {}

  if (!fromEmail) {
    fromEmail = 'onboarding@resend.dev';
  }

  return { apiKey, fromEmail, adminEmail };
}

/**
 * Base email dispatcher with automatic fallback for unverified custom domains.
 * Logs all deliveries to the User Action Audit Log.
 */
export async function sendEmail({ to, name, subject, html, replyTo, category = 'notification' }) {
  const { apiKey, fromEmail } = await getMailerConfig();
  const safeName = name || 'Investor';

  if (!to || !to.includes('@')) {
    await logUserAction({
      user_email: to || 'unknown',
      action_type: 'email.failed',
      description: `Email dispatch failed: Invalid recipient address (${to})`,
      status: 'error',
      details: { subject, category }
    });
    return { ok: false, error: 'Invalid recipient email' };
  }

  if (!apiKey) {
    console.warn(`[Mailer] No RESEND_API_KEY configured. Email to ${to} ("${subject}") recorded in log.`);
    await logUserAction({
      user_email: to,
      action_type: 'email.simulated',
      description: `Email recorded (Sandbox Simulator): "${subject}" to ${to}`,
      status: 'warning',
      details: { subject, recipient: to, category, reason: 'RESEND_API_KEY not configured' }
    });
    return { ok: true, simulated: true, id: 'sim_' + Date.now().toString(36) };
  }

  async function postToResend(senderAddress) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Tesla Trade Inc <${senderAddress}>`,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: [replyTo] } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  try {
    let result = await postToResend(fromEmail);

    // If custom domain is not verified, automatically retry with onboarding@resend.dev
    if (!result.ok && fromEmail !== 'onboarding@resend.dev') {
      const msg = (result.data?.message || '').toLowerCase();
      if (result.status === 403 || msg.includes('domain') || msg.includes('verify') || msg.includes('from')) {
        console.warn(`[Mailer] Custom sender <${fromEmail}> failed (${result.data?.message}). Retrying with onboarding@resend.dev`);
        result = await postToResend('onboarding@resend.dev');
      }
    }

    if (result.ok && result.data?.id) {
      console.log(`[Mailer] Email sent successfully to ${to} (id: ${result.data.id}): "${subject}"`);
      await logUserAction({
        user_email: to,
        action_type: 'email.sent',
        description: `Email delivered to ${to}: "${subject}"`,
        status: 'success',
        details: { resend_id: result.data.id, subject, recipient: to, category }
      });
      return { ok: true, id: result.data.id };
    }

    const errorMsg = result.data?.message || `HTTP ${result.status}`;
    console.warn(`[Mailer] Resend rejected email to ${to}:`, errorMsg);
    await logUserAction({
      user_email: to,
      action_type: 'email.failed',
      description: `Resend email rejected for ${to}: ${errorMsg}`,
      status: 'error',
      details: { error: errorMsg, subject, recipient: to, category }
    });
    return { ok: false, error: errorMsg };
  } catch (err) {
    console.error(`[Mailer] Network exception sending email to ${to}:`, err.message);
    await logUserAction({
      user_email: to,
      action_type: 'email.failed',
      description: `Network exception sending email to ${to}: ${err.message}`,
      status: 'error',
      details: { error: err.message, subject, recipient: to, category }
    });
    return { ok: false, error: err.message };
  }
}

function emailWrapper(contentHtml) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;color:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;background-color:#0c0d10;border:1px solid #27272a;border-radius:12px;overflow:hidden;margin-top:24px;margin-bottom:24px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#18181b,#09090b);padding:28px 24px;border-bottom:1px solid #27272a;text-align:center;">
      <div style="display:inline-block;width:36px;height:36px;line-height:36px;background:#e31937;color:#ffffff;font-size:20px;font-weight:900;border-radius:8px;margin-bottom:8px;">T</div>
      <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:1px;">TESLA TRADE <span style="color:#e31937;">INC</span></div>
      <div style="color:#71717a;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">Institutional Investment &amp; Portfolio Management</div>
    </div>
    <!-- Content -->
    <div style="padding:28px 24px;">
      ${contentHtml}
    </div>
    <!-- Footer -->
    <div style="background-color:#09090b;padding:20px 24px;border-top:1px solid #27272a;text-align:center;color:#71717a;font-size:11px;line-height:1.6;">
      <p style="margin:0 0 4px 0;">Tesla Trade Inc &middot; 3500 Deer Creek Road, Palo Alto, CA 94304</p>
      <p style="margin:0;">This is an automated notification. For support, contact <a href="mailto:support@teslawealths.org" style="color:#e31937;text-decoration:none;">support@teslawealths.org</a></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Welcome email (to new investor)
 */
export async function sendWelcomeEmail(toEmail, toName) {
  const safeName = toName || 'Investor';
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#ffffff;font-weight:700;">Welcome to Tesla Trade Inc</h2>
    <p style="margin:0 0 16px 0;color:#94a3b8;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">Your investor account has been successfully created. You now have access to high-yield algorithmic arbitrage portfolios, automated trading allocations, and real-time capital reporting.</p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:18px;margin:20px 0;">
      <div style="color:#22c55e;font-weight:700;font-size:14px;margin-bottom:6px;">Next Step: Select &amp; Fund Your Portfolio</div>
      <div style="color:#94a3b8;font-size:13px;line-height:1.6;">Choose from our curated trading programs starting at $30 up to institutional allocations. Your first deposit qualifies for a 100% initial capital match!</div>
    </div>
    <div style="text-align:center;margin:28px 0 16px 0;">
      <a href="https://teslawealths.org/overview" style="display:inline-block;background:#e31937;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;">Go to Investor Dashboard &rarr;</a>
    </div>
  `);
  return sendEmail({
    to: toEmail,
    name: safeName,
    subject: 'Welcome to Tesla Trade Inc — Your Account is Ready',
    html,
    category: 'welcome'
  });
}

/**
 * 2. Payment received & pending approval email (to investor)
 */
export async function sendPaymentReceivedEmail(toEmail, toName, { amount, planName, method, reference }) {
  const safeName = toName || 'Investor';
  const fmtAmt = '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#ffffff;font-weight:700;">Deposit Receipt Received &mdash; Pending Review</h2>
    <p style="margin:0 0 16px 0;color:#94a3b8;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">We have received your deposit confirmation and transaction proof. Our financial operations team is currently reviewing your payment.</p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:18px;margin:20px 0;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:12px;font-weight:700;">Deposit Details</div>
      <table width="100%" style="font-size:13px;line-height:1.8;">
        <tr><td style="color:#64748b;">Plan:</td><td style="color:#ffffff;font-weight:600;text-align:right;">${planName || 'Investment Portfolio'}</td></tr>
        <tr><td style="color:#64748b;">Amount:</td><td style="color:#22c55e;font-weight:700;text-align:right;">${fmtAmt}</td></tr>
        <tr><td style="color:#64748b;">Payment Method:</td><td style="color:#ffffff;text-align:right;">${method || 'Crypto'}</td></tr>
        ${reference ? `<tr><td style="color:#64748b;">Transaction Reference:</td><td style="color:#38bdf8;font-family:monospace;text-align:right;">${reference}</td></tr>` : ''}
        <tr><td style="color:#64748b;">Status:</td><td style="color:#eab308;font-weight:700;text-align:right;">Pending Admin Approval</td></tr>
      </table>
    </div>
    <p style="margin:0 0 16px 0;color:#94a3b8;font-size:13px;">Deposits are typically verified within 15&ndash;60 minutes. You will receive an activation email as soon as your deposit is approved and credited to your balance.</p>
    <div style="text-align:center;margin:24px 0 12px 0;">
      <a href="https://teslawealths.org/overview" style="display:inline-block;background:#27272a;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:6px;border:1px solid #3f3f46;">View Deposit Status &rarr;</a>
    </div>
  `);
  return sendEmail({
    to: toEmail,
    name: safeName,
    subject: 'Deposit Received — Pending Approval | Tesla Trade Inc',
    html,
    category: 'deposit_received'
  });
}

/**
 * 3. Alert email to admin when a new deposit is submitted
 */
export async function sendAdminPaymentAlert({ userEmail, userName, amount, planName, method, reference, investmentId }) {
  const { adminEmail } = await getMailerConfig();
  if (!adminEmail) return { ok: false, error: 'No admin email configured' };
  const fmtAmt = '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#eab308;font-weight:700;">⚡ New Deposit Pending Approval</h2>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">A new investor deposit has been submitted and is waiting for your review and approval in the admin portal.</p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:18px;margin:20px 0;">
      <table width="100%" style="font-size:13px;line-height:1.8;">
        <tr><td style="color:#64748b;">Investor:</td><td style="color:#ffffff;font-weight:600;text-align:right;">${userName || 'Investor'} (${userEmail})</td></tr>
        <tr><td style="color:#64748b;">Plan:</td><td style="color:#ffffff;text-align:right;">${planName || 'Standard'}</td></tr>
        <tr><td style="color:#64748b;">Deposit Amount:</td><td style="color:#22c55e;font-weight:800;font-size:16px;text-align:right;">${fmtAmt}</td></tr>
        <tr><td style="color:#64748b;">Method:</td><td style="color:#ffffff;text-align:right;">${method || 'Crypto'}</td></tr>
        ${reference ? `<tr><td style="color:#64748b;">Reference / TX ID:</td><td style="color:#38bdf8;font-family:monospace;text-align:right;">${reference}</td></tr>` : ''}
        ${investmentId ? `<tr><td style="color:#64748b;">Deposit ID:</td><td style="color:#94a3b8;font-family:monospace;text-align:right;">${investmentId}</td></tr>` : ''}
      </table>
    </div>
    <div style="text-align:center;margin:24px 0 12px 0;">
      <a href="https://teslawealths.org/admin" style="display:inline-block;background:#22c55e;color:#000000;text-decoration:none;font-weight:800;font-size:14px;padding:12px 28px;border-radius:6px;">Open Admin Dashboard to Approve &rarr;</a>
    </div>
  `);
  return sendEmail({
    to: adminEmail,
    name: 'Admin',
    subject: `⚡ Action Required: New Deposit of ${fmtAmt} from ${userEmail}`,
    html,
    category: 'admin_alert'
  });
}

/**
 * 4. Payment approved email (to investor)
 */
export async function sendPaymentApprovedEmail(toEmail, toName, { amount, planName }) {
  const safeName = toName || 'Investor';
  const fmtAmt = '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#22c55e;font-weight:700;">✅ Deposit Approved &amp; Account Active!</h2>
    <p style="margin:0 0 16px 0;color:#94a3b8;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">Great news! Your deposit of <strong style="color:#22c55e;">${fmtAmt}</strong> for the <strong>${planName || 'Investment Portfolio'}</strong> has been verified and approved.</p>
    <div style="background:#064e3b22;border:1px solid #05966955;border-radius:8px;padding:18px;margin:20px 0;">
      <div style="color:#34d399;font-weight:700;font-size:14px;margin-bottom:6px;">Your Capital is Now Active</div>
      <div style="color:#a7f3d0;font-size:13px;line-height:1.6;">Your investment is officially earning compounding trading returns. You can view your real-time performance and portfolio accruals anytime in your live dashboard.</div>
    </div>
    <div style="text-align:center;margin:28px 0 16px 0;">
      <a href="https://teslawealths.org/overview" style="display:inline-block;background:#22c55e;color:#000000;text-decoration:none;font-weight:800;font-size:14px;padding:12px 28px;border-radius:6px;">Access Live Portfolio &rarr;</a>
    </div>
  `);
  return sendEmail({
    to: toEmail,
    name: safeName,
    subject: '✅ Your Deposit is Approved & Active — Tesla Trade Inc',
    html,
    category: 'deposit_approved'
  });
}

/**
 * 5. Payment declined email (to investor)
 */
export async function sendPaymentDeclinedEmail(toEmail, toName, { amount, planName }) {
  const safeName = toName || 'Investor';
  const fmtAmt = '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#ef4444;font-weight:700;">Investment Deposit Update</h2>
    <p style="margin:0 0 16px 0;color:#94a3b8;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">We were unable to verify your deposit of ${fmtAmt} for ${planName || 'your selected plan'} with the provided transaction proof.</p>
    <p style="margin:0 0 16px 0;color:#94a3b8;font-size:13px;">Please verify your transaction details, confirm the correct network or address was used, and re-submit your receipt from the Deposit section or contact support for assistance.</p>
    <div style="text-align:center;margin:24px 0 12px 0;">
      <a href="https://teslawealths.org/deposit" style="display:inline-block;background:#27272a;color:#ffffff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:6px;border:1px solid #3f3f46;">Go to Deposit Page &rarr;</a>
    </div>
  `);
  return sendEmail({
    to: toEmail,
    name: safeName,
    subject: 'Investment Application Update — Tesla Trade Inc',
    html,
    category: 'deposit_declined'
  });
}

/**
 * 6. Test email for admin verification
 */
export async function sendTestEmail(toEmail) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#38bdf8;font-weight:700;">🧪 Resend Email System Test</h2>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">This is a test notification confirming that your Resend email delivery pipeline is operational and delivering messages correctly.</p>
    <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:18px;margin:20px 0;">
      <div style="color:#38bdf8;font-weight:700;font-size:13px;margin-bottom:6px;">Delivery Audit Record</div>
      <div style="color:#94a3b8;font-size:12px;">Timestamp: ${new Date().toISOString()}</div>
      <div style="color:#94a3b8;font-size:12px;">Target: ${toEmail}</div>
    </div>
  `);
  return sendEmail({
    to: toEmail,
    name: 'Administrator',
    subject: '🧪 Resend Email Pipeline Test — Tesla Trade Inc',
    html,
    category: 'test_email'
  });
}

export default {
  getMailerConfig,
  sendEmail,
  sendWelcomeEmail,
  sendPaymentReceivedEmail,
  sendAdminPaymentAlert,
  sendPaymentApprovedEmail,
  sendPaymentDeclinedEmail,
  sendTestEmail
};
