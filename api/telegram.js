import { loadDatabase, saveDatabase, getDbConnection } from './db.js';

/**
 * Telegram Notification Bot Integration for Tesla Trade Inc.
 * Sends real-time administrative alerts for:
 * 1. Investor Signups & Account Registrations
 * 2. Deposit Submissions with Payment Receipts & Reference IDs
 * 3. Admin Deposit Approvals & Rejections
 * 4. Tracking Link Clicks (configurable toggle)
 * 5. Connection Test & Verification Pings
 */

// Retrieve effective Telegram credentials from process.env or persistent store
let telegramConfigCache = null;
let telegramConfigCacheUntil = 0;

export async function getTelegramConfig() {
  if (telegramConfigCache && Date.now() < telegramConfigCacheUntil) return telegramConfigCache;
  let dbSettings = {};
  try {
    const db = loadDatabase();
    dbSettings = db.app_settings || {};
  } catch (e) {
    dbSettings = {};
  }
  // Admin-panel settings are persisted in MySQL; read them when environment
  // variables are not supplied so serverless instances share one config.
  try {
    const conn = await getDbConnection();
    const [rows] = await conn.query('SELECT `key`, `value` FROM app_settings WHERE `key` IN (?, ?, ?)', [
      'telegram_bot_token', 'telegram_chat_id', 'telegram_alerts_enabled'
    ]);
    for (const row of rows || []) dbSettings[row.key] = row.value;
    await conn.end();
  } catch (e) {
    // Environment variables remain available if the settings table is offline.
  }

  const botToken = (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TT_TELEGRAM_BOT_TOKEN ||
    dbSettings.telegram_bot_token ||
    ''
  ).trim();

  const chatId = (
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TT_TELEGRAM_CHAT_ID ||
    dbSettings.telegram_chat_id ||
    ''
  ).trim();

  const alertsEnabledRaw = (
    process.env.TELEGRAM_ALERTS_ENABLED ||
    dbSettings.telegram_alerts_enabled ||
    'true'
  ).toString().toLowerCase();

  const notifyClicksRaw = (
    process.env.TELEGRAM_NOTIFY_CLICKS ||
    dbSettings.telegram_notify_clicks ||
    'false'
  ).toString().toLowerCase();

  const alertsEnabled = alertsEnabledRaw === 'true' || alertsEnabledRaw === '1' || alertsEnabledRaw === 'yes';
  const notifyClicks = notifyClicksRaw === 'true' || notifyClicksRaw === '1' || notifyClicksRaw === 'yes';

  telegramConfigCache = { botToken, chatId, alertsEnabled, notifyClicks, isConfigured: !!(botToken && chatId) };
  telegramConfigCacheUntil = Date.now() + 30000;
  return telegramConfigCache;
}

/**
 * Low-level dispatch to Telegram Bot API sendMessage endpoint
 */
export async function sendTelegramMessage(htmlContent, customConfig = null) {
  const config = customConfig || await getTelegramConfig();

  if (!config.botToken || !config.chatId) {
    console.log('[Telegram Bot] Skipped (Token or Chat ID not configured)');
    return { ok: false, error: 'Telegram Bot Token or Chat ID not configured', simulated: true };
  }

  if (!config.alertsEnabled && !customConfig) {
    console.log('[Telegram Bot] Skipped (Alerts toggled off by admin)');
    return { ok: false, error: 'Telegram alerts are disabled', disabled: true };
  }

  const endpoint = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: htmlContent,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok || !data.ok) {
      console.warn('[Telegram Bot] API error:', data.description || response.statusText);
      return { ok: false, error: data.description || 'Failed to dispatch Telegram message', details: data };
    }

    console.log('[Telegram Bot] Notification delivered successfully. Message ID:', data.result?.message_id);
    return { ok: true, messageId: data.result?.message_id, date: data.result?.date };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Telegram Bot] Network or timeout error:', err.message);
    return { ok: false, error: err.message, networkError: true };
  }
}


/**
 * Send a private receipt image to the configured admin chat.
 * Accepts a data URI generated from the uploaded receipt; never exposes it publicly.
 */
export async function sendTelegramPhoto(photoDataUri, caption, fileName = 'deposit-receipt.jpg') {
  const config = await getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    return { ok: false, error: 'Telegram Bot Token or Chat ID not configured' };
  }
  if (!config.alertsEnabled) return { ok: false, error: 'Telegram alerts are disabled' };
  const match = String(photoDataUri || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, error: 'Receipt is not a supported image data URI' };
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'Receipt image must be smaller than 10 MB' };
  }
  const form = new FormData();
  form.append('chat_id', config.chatId);
  form.append('caption', String(caption || '').slice(0, 1024));
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([bytes], { type: match[1] }), String(fileName || 'deposit-receipt.jpg').replace(/[^a-zA-Z0-9._-]/g, '_'));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, {
      method: 'POST', body: form, signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return { ok: false, error: data.description || 'Telegram receipt upload failed' };
    return { ok: true, messageId: data.result?.message_id };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
}


/** Generic escaped event alert for operational events beyond deposits. */
export async function notifyAdminEvent(eventName, details = {}) {
  const allowed = ['email', 'name', 'phone', 'amount', 'reference', 'status', 'reason', 'recordId'];
  const rows = allowed
    .filter((key) => details[key] !== undefined && details[key] !== null && String(details[key]).trim() !== '')
    .map((key) => `• <b>${escapeHtml(key)}:</b> ${escapeHtml(details[key])}`);
  const message = [
    `🔔 <b>${escapeHtml(String(eventName || 'SITE EVENT').toUpperCase())}</b>`,
    '━━━━━━━━━━━━━━━━━━━━',
    ...rows,
    `⏰ <b>Time (UTC):</b> ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`,
    '<a href="https://teslawealths.org/admin">Open Admin Dashboard</a>'
  ].join('\n');
  return sendTelegramMessage(message);
}

/**
 * Alert 1: New Investor Signup
 */
export async function notifySignup(investor = {}) {
  const name = investor.name || 'Investor';
  const email = investor.email || 'unknown@teslawealths.org';
  const phone = investor.phone || 'Not provided';
  const ip = investor.ip || '';
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const message = `
⚡ <b>NEW INVESTOR REGISTRATION</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Name:</b> ${escapeHtml(name)}
📧 <b>Email:</b> <code>${escapeHtml(email)}</code>
📱 <b>Phone:</b> <code>${escapeHtml(phone)}</code>
${ip ? '🌐 <b>IP Address:</b> <code>' + escapeHtml(ip) + '</code>\\n' : ''}⏰ <b>Time (UTC):</b> ${now}

🔗 <a href="https://teslawealths.org/admin">Open Admin Portal</a>
`.trim();

  return sendTelegramMessage(message);
}

/**
 * Alert 2: Payment Receipt Submitted for Approval
 */
export async function notifyPaymentSubmission(deposit = {}) {
  const email = deposit.user_email || deposit.email || 'investor@teslawealths.org';
  const name = deposit.user_name || deposit.name || 'Investor';
  const amount = Number(deposit.total || deposit.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const plan = deposit.plan_name || deposit.portfolio || 'Institutional Yield';
  const method = deposit.method || 'USDT (TRC-20)';
  const ref = deposit.payment_reference || deposit.ref || 'None provided';
  const hasProof = !!(deposit.payment_proof_path || deposit.proofDataUri);
  const proofFile = deposit.payment_proof_name || deposit.proofFileName || (hasProof ? 'Uploaded Receipt File' : 'No file');
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const message = `
💰 <b>DEPOSIT RECEIPT SUBMITTED</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Investor:</b> ${escapeHtml(name)} (<code>${escapeHtml(email)}</code>)
💵 <b>Amount:</b> <b>$${amount} USD</b>
📊 <b>Portfolio Tier:</b> ${escapeHtml(plan)}
💳 <b>Method:</b> <code>${escapeHtml(method)}</code>
🔖 <b>Reference / TXID:</b> <code>${escapeHtml(ref)}</code>
🧾 <b>Receipt Image:</b> ${hasProof ? '✅ Attached (' + escapeHtml(proofFile) + ')' : '⚠️ None'}
⏰ <b>Time (UTC):</b> ${now}

⚡ <b>Action Required:</b> Please review and verify this transaction in the Admin Dashboard.
👉 <a href="https://teslawealths.org/admin">Review & Approve Deposit</a>
`.trim();

  if (deposit.payment_proof_path && String(deposit.payment_proof_path).startsWith('data:image/')) {
    const caption = `💰 <b>DEPOSIT RECEIPT SUBMITTED</b>\n👤 ${escapeHtml(name)} — <code>${escapeHtml(email)}</code>\n💵 <b>${amount} USD</b> · ${escapeHtml(plan)}\n💳 ${escapeHtml(method)} · Ref: <code>${escapeHtml(ref)}</code>\n⚠️ Pending admin review\n<a href="https://teslawealths.org/admin">Open Admin Dashboard</a>`;
    const photoResult = await sendTelegramPhoto(deposit.payment_proof_path, caption, proofFile);
    if (photoResult.ok) return photoResult;
    console.warn('[Telegram Bot] Receipt image delivery failed; sending text alert:', photoResult.error);
    return sendTelegramMessage(message);
  }
  return sendTelegramMessage(message);
}

/**
 * Alert 3: Deposit Status Update (Approved or Declined)
 */
export async function notifyPaymentStatusUpdate(update = {}) {
  const email = update.user_email || 'investor@teslawealths.org';
  const name = update.user_name || 'Investor';
  const status = String(update.status || 'active').toLowerCase();
  const isApproved = status === 'active' || status === 'approved';
  const amount = Number(update.total || update.amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const plan = update.plan_name || 'Investment Plan';
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const icon = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'APPROVED & ACTIVATED' : 'DECLINED / REJECTED';

  const message = `
${icon} <b>DEPOSIT ${statusText}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Investor:</b> ${escapeHtml(name)} (<code>${escapeHtml(email)}</code>)
💵 <b>Amount:</b> <b>$${amount} USD</b>
📊 <b>Plan:</b> ${escapeHtml(plan)}
🛡 <b>Admin Action:</b> ${isApproved ? 'Funds credited & trading active' : 'Marked declined'}
⏰ <b>Time (UTC):</b> ${now}

🔗 <a href="https://teslawealths.org/admin">Open Admin Portal</a>
`.trim();

  return sendTelegramMessage(message);
}

/**
 * Alert 4: Ad / Link Click Traffic (Optional toggle)
 */
export async function notifyLinkClick(click = {}) {
  const config = await getTelegramConfig();
  if (!config.notifyClicks) return { ok: false, skipped: true };

  const source = click.campaign_source || click.source || 'direct';
  const landing = click.landing_page || '/';
  const device = click.device_type || 'desktop';
  const referrer = click.referrer || 'Direct / None';

  const message = `
🔗 <b>NEW TRAFFIC / LINK CLICK</b>
━━━━━━━━━━━━━━━━━━━━
📢 <b>Source:</b> <code>${escapeHtml(source)}</code>
📱 <b>Device:</b> ${escapeHtml(device)}
📍 <b>Landing Page:</b> <code>${escapeHtml(landing)}</code>
🔎 <b>Referrer:</b> <code>${escapeHtml(referrer)}</code>
`.trim();

  return sendTelegramMessage(message);
}

/**
 * Alert 5: Test Connection Ping
 */
export async function testTelegramConnection(customToken = '', customChatId = '') {
  const config = await getTelegramConfig();
  const token = (customToken || config.botToken || '').trim();
  const chatId = (customChatId || config.chatId || '').trim();

  if (!token || !chatId) {
    return {
      success: false,
      error: 'Please provide both Telegram Bot Token and Chat ID to run connection test.'
    };
  }

  const startTime = Date.now();
  const testMessage = `
🧪 <b>TESLA TRADE INC — BOT TEST PING</b>
━━━━━━━━━━━━━━━━━━━━
✅ <b>Status:</b> Telegram Alert Bot is active and connected!
🛡 <b>Platform:</b> Tesla Trade Inc. Admin Engine
⏰ <b>Timestamp:</b> ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
⚡ <b>Ready:</b> Real-time alerts will be delivered immediately to this chat for signups, deposit submissions, and approvals.
`.trim();

  const res = await sendTelegramMessage(testMessage, {
    botToken: token,
    chatId: chatId,
    alertsEnabled: true,
    notifyClicks: false
  });

  const latency = Date.now() - startTime;

  if (res.ok) {
    return {
      success: true,
      message: `Test alert sent successfully! (${latency}ms latency, Message ID: ${res.messageId})`,
      latency,
      messageId: res.messageId
    };
  } else {
    return {
      success: false,
      error: res.error || 'Failed to send test message via Telegram API.',
      latency
    };
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default {
  getTelegramConfig,
  sendTelegramMessage,
  notifySignup,
  notifyPaymentSubmission,
  notifyPaymentStatusUpdate,
  notifyLinkClick,
  testTelegramConnection,
  sendTelegramPhoto,
  notifyAdminEvent
};
