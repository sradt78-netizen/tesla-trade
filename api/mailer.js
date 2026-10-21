import { getDbConnection } from './dbcheck.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

/**
 * Resolves Resend configuration from environment variables,
 * database app_settings, or in-memory fallback.
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
    const conn = await getDbConnection();
    const [rows] = await conn.query(
      'SELECT `key`, `value` FROM app_settings WHERE `key` IN ("resend_api_key", "resend_from_email", "admin_email")'
    );
    await conn.end();
    for (const r of rows) {
      if (r.key === 'resend_api_key' && r.value && !apiKey) apiKey = cleanString(r.value);
      if (r.key === 'resend_from_email' && r.value && !fromEmail) fromEmail = cleanString(r.value);
      if (r.key === 'admin_email' && r.value) adminEmail = cleanString(r.value);
    }
  } catch (e) {
    try {
      const { mockStore } = await import('./admin.js');
      if (mockStore?.settings) {
        if (!apiKey && mockStore.settings.resend_api_key) apiKey = mockStore.settings.resend_api_key;
        if (!fromEmail && mockStore.settings.resend_from_email) fromEmail = mockStore.settings.resend_from_email;
      }
    } catch (e2) {}
  }

  if (!fromEmail) {
    fromEmail = 'onboarding@resend.dev';
  }

  return { apiKey, fromEmail, adminEmail };
}

/**
 * Base email dispatcher with automatic fallback for unverified custom domains.
 */
export async function sendEmail({ to, name, subject, html, replyTo }) {
  const { apiKey, fromEmail } = await getMailerConfig();

  if (!apiKey) {
    console.warn(`[Mailer] No RESEND_API_KEY configured. Email to ${to} ("${subject}") simulated.`);
    return { ok: false, error: 'No RESEND_API_KEY configured', simulated: true };
  }

  if (!to || !to.includes('@')) {
    return { ok: false, error: 'Invalid recipient email' };
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
      return { ok: true, id: result.data.id };
    }

    console.warn(`[Mailer] Resend rejected email to ${to}:`, result.data?.message || result.status);
    return { ok: false, error: result.data?.message || `HTTP ${result.status}` };
  } catch (err) {
    console.error(`[Mailer] Network exception sending email to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

function emailWrapper(contentHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background-color:#121212;border-radius:12px;border:1px solid #222222;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 20px 28px;border-bottom:1px solid #1f1f1f;">
                  <span style="color:#e31937;font-size:20px;font-weight:900;letter-spacing:1px;">TESLA</span>
                  <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;"> TRADE INC</span>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;line-height:1.6;color:#e2e8f0;font-size:14px;">
                  ${contentHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px;border-top:1px solid #1f1f1f;text-align:center;font-size:11px;color:#64748b;">
                  Tesla Trade Inc &middot; Institutional Automated Trading & Wealth Management<br>
                  This is an automated notification. If you did not initiate this request, please contact support.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * 1. Welcome email upon investor registration
 */
export async function sendWelcomeEmail(toEmail, toName) {
  const safeName = toName || 'Investor';
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px 0;font-size:20px;color:#ffffff;font-weight:700;">Welcome to Tesla Trade Inc!</h2>
    <p style="margin:0 0 16px 0;color:#94a3b8;">Hello <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 16px 0;color:#cbd5e1;">Your investor account has been successfully registered and activated. You now have access to high-yield algorithmic trading portfolios powered by Tesla proprietary intelligence.</p>
    
    <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:16px;margin:20px 0;">
      <div style="font-size:13px;font-weight:700;color:#38bdf8;margin-bottom:8px;">🎁 Welcome Deposit Match Available</div>
      <div style="font-size:13px;color:#94a3b8;">Claim up to a <strong>100% bonus</strong> on your first qualifying deposit. Deposit and activate an investment plan to start generating daily compounding yields.</div>
    </div>

    <div style="text-align:center;margin:28px 0 16px 0;">
      <a href="https://teslawealths.org/overview" style="display:inline-block;background:#e31937;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;">Go to Investor Dashboard &rarr;</a>
    </div>
  `);

  return sendEmail({
    to: toEmail,
    name: safeName,
    subject: 'Welcome to Tesla Trade Inc — Your Account is Ready',
    html
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
    html
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
    html
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
    html
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
    html
  });
}
