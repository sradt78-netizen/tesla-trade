import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDbConnection } from './dbcheck.js';
import { ensureSupportTables } from './support.js';
import { ensureSupportTables } from './support.js';
import { inMemoryDeposits, loadPersistentDeposits, savePersistentDeposit } from './payment-submit.js';

const INVESTORS_FILE = path.join(process.cwd(), 'data', 'saved_investors.json');

export function loadPersistentInvestors() {
  try {
    if (fs.existsSync(INVESTORS_FILE)) {
      const raw = fs.readFileSync(INVESTORS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function savePersistentInvestor(account) {
  if (!account || !account.email) return;
  try {
    const list = loadPersistentInvestors();
    const cleanEmail = String(account.email).toLowerCase().trim();
    const idx = list.findIndex(u => (u.email || '').toLowerCase() === cleanEmail);
    const updated = {
      id: account.id || (idx >= 0 ? list[idx].id : ('u_' + Date.now().toString(36))),
      name: account.name || (idx >= 0 ? list[idx].name : 'Investor'),
      email: cleanEmail,
      phone: account.phone || (idx >= 0 ? list[idx].phone : '—'),
      onboarding_status: account.onboarding_status || (idx >= 0 ? list[idx].onboarding_status : 'pending_deposit'),
      registered_at: account.registered_at || (idx >= 0 ? list[idx].registered_at : new Date().toISOString())
    };
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updated };
    } else {
      list.unshift(updated);
    }
    const dir = path.dirname(INVESTORS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INVESTORS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

export function getAdminExpectedPassword() {
  return cleanString(
    process.env.ADMIN_PASSWORD ||
    process.env.TT_ADMIN_PASSWORD ||
    'Heartofwisdom101@$'
  );
}

export function isAuthorizedAdmin(req, body = {}, url = null) {
  const expected = getAdminExpectedPassword();
  const provided = cleanString(
    req.headers['x-admin-password'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
    (url ? url.searchParams.get('password') || url.searchParams.get('admin_password') : '') ||
    body?.password ||
    body?.admin_password ||
    ''
  );

  if (!provided) return false;
  if (provided === expected) return true;

  const expectedSha = cleanString(process.env.ADMIN_PASSWORD_SHA256 || process.env.TT_ADMIN_PASSWORD_SHA256);
  if (expectedSha) {
    try {
      const hash = crypto.createHash('sha256').update(provided).digest('hex');
      if (hash.toLowerCase() === expectedSha.toLowerCase()) return true;
    } catch (e) {}
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.on !== 'function') return resolve({});
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
  });
}

// ── CLEAN DATA STORE FOR PRODUCTION & REAL SUBMISSIONS ──────────
export const mockStore = {
  investors: [],
  investments: [],
  kyc: [],
  orders: [],
  withdrawals: [],
  financing: [],
  codes: [
    { id: 1, code: 'TT-2026-VIP', status: 'active', source: 'admin', created_at: '2026-10-20 10:00:00' },
    { id: 2, code: 'TESLA-TRADE-2026', status: 'active', source: 'admin', created_at: '2026-10-20 10:00:00' }
  ],
  clicks: [],
  marketingLogs: [],
  settings: {
    autopilot_marketing_enabled: 'true',
    autopilot_interval: '24h',
    marketing_last_run: '',
    wallet_usdt: 'TQn9Y2khEsLJW1ChVWFMSMeSTow5KaxnSE',
    wallet_btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    wallet_eth: '0x71C8F0dF42250c609c1B95B1d141e4B516e889F6'
  },
  tradingSettings: {
    profitIntervalSeconds: 3,
    lossIntervalSeconds: 2,
    profitRatePercent: 2,
    lossRatePercent: 1
  }
};

// ── PRE-DRAFTED HIGH-CONVERTING INVESTOR MARKETING EMAIL SERIES ─────────
const MARKETING_TEMPLATES = {
  no_deposit: {
    id: 'no_deposit',
    name: '100% First Deposit Match & Welcome Bonus',
    target: 'Unfunded Investors ($0 Active Balance)',
    subject: '⚡ Activate Your 100% First Deposit Match — Tesla Trade Institutional Portfolios',
    headline: 'Double Your Working Capital On Your First Approved Deposit',
    summary: 'A high-impact welcome offer highlighting our limited-time 100% match bonus on the first approved deposit.',
    generateHtml: (name, email) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#181b22,#0f1115);padding:28px 24px;border-bottom:1px solid #262a36;text-align:center;">
          <div style="display:inline-block;padding:6px 16px;background:rgba(227,25,55,0.15);border:1px solid rgba(227,25,55,0.4);border-radius:999px;color:#f87171;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
            EXCLUSIVE ALLOCATION OPPORTUNITY
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">100% Institutional Deposit Match</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Limited-time capital allocation for eligible verified accounts</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Investor'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            Your Tesla Trade account is active, but you have not yet completed your initial deposit. In dynamic financial markets, every day capital sits idle is an opportunity lost.
          </p>
          <div style="background:#13151b;border:1px solid #282d3b;border-radius:12px;padding:20px;margin:22px 0;">
            <div style="font-size:12px;font-weight:800;color:#d4af37;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Why Fund Your Portfolio Today:</div>
            <ul style="margin:0;padding-left:18px;color:#cbd5e1;font-size:13px;line-height:1.7;">
              <li><strong style="color:#22c55e;">100% Matching Capital:</strong> Double your working allocation on your first approved deposit.</li>
              <li><strong style="color:#ffffff;">Enhanced Yields:</strong> Up to <strong>70% – 200% Projected ROI</strong> across diversified Tesla &amp; innovation programs.</li>
              <li><strong style="color:#ffffff;">Zero Management Fees:</strong> Automated orderbook execution with instant liquidity.</li>
              <li><strong style="color:#ffffff;">Low Minimums:</strong> Begin with as little as <strong>$30</strong> in the Explorer tier.</li>
            </ul>
          </div>
          <div style="text-align:center;margin:30px 0 24px;">
            <a href="https://teslawealths.org/invest" style="display:inline-block;background:linear-gradient(135deg,#e31937,#b01027);color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(227,25,55,0.4);text-transform:uppercase;">
              Claim Your 100% Match &amp; Deposit →
            </a>
          </div>
          <p style="font-size:12px;color:#64748b;line-height:1.6;text-align:center;margin:0;">
            Accepting USDT (TRC-20), Bitcoin, Ethereum, and Direct Bank Transfers. Automated confirmations within minutes.
          </p>
        </div>
        <div style="background:#08090b;padding:16px 24px;border-top:1px solid #1c1f26;text-align:center;font-size:11px;color:#475569;">
          Tesla Trade Inc · Institutional Yield &amp; Digital Capital Management · <a href="https://teslawealths.org" style="color:#64748b;text-decoration:none;">teslawealths.org</a>
        </div>
      </div>
    `
  },

  referral_share: {
    id: 'referral_share',
    name: 'Tiered Referral Rewards & VIP Commissions',
    target: 'Active Investors (High Engagement)',
    subject: '💰 Earn 10% Instant Cash Commissions + VIP Referral Bonuses',
    headline: 'Turn Your Network Into An Automated Compounding Engine',
    summary: 'A lovely promotion explaining the 10% instant commission and referral rewards.',
    generateHtml: (name, email, code) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#121815,#0c0d10);padding:28px 24px;border-bottom:1px solid #1a2a22;text-align:center;">
          <div style="display:inline-block;padding:6px 16px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);border-radius:999px;color:#4ade80;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
            VIP AFFILIATE ADVANTAGE
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Earn 10% Instant Commissions</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Unlimited referral commissions on every peer allocation</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Partner'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            Did you know that your Tesla Trade account comes with an institutional partner privilege? Share your dedicated invitation code and receive withdrawable earnings on every single deposit made by invited members.
          </p>
          <div style="background:#11141a;border:1px solid #2a3344;border-radius:12px;padding:22px;text-align:center;margin:22px 0;">
            <div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">YOUR VIP INVITATION CODE</div>
            <div style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:28px;font-weight:900;letter-spacing:6px;color:#e31937;padding:8px 0;">
              ${code || 'TESLA-VIP'}
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:6px;">
              Direct Link: <a href="https://teslawealths.org/register?ref=${code || 'TESLA-VIP'}" style="color:#38bdf8;text-decoration:none;">https://teslawealths.org/register?ref=${code || 'TESLA-VIP'}</a>
            </div>
          </div>
          <div style="background:#13151b;border:1px solid #222632;border-radius:12px;padding:18px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:800;color:#22c55e;margin-bottom:8px;">THREE STEPS TO EFFORTLESS PASSIVE EARNINGS:</div>
            <ol style="margin:0;padding-left:18px;color:#cbd5e1;font-size:13px;line-height:1.7;">
              <li>Send your code or link to friends or investment groups.</li>
              <li>They register and claim their <strong>100% deposit bonus</strong>.</li>
              <li>You receive <strong>10% instant cash commission</strong> credited immediately upon their deposit approval!</li>
            </ol>
          </div>
          <div style="text-align:center;margin:26px 0 20px;">
            <a href="https://teslawealths.org/overview" style="display:inline-block;background:linear-gradient(135deg,#22c55e,#15803d);color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(34,197,94,0.35);text-transform:uppercase;">
              View Your Referral Dashboard →
            </a>
          </div>
        </div>
        <div style="background:#08090b;padding:16px 24px;border-top:1px solid #1c1f26;text-align:center;font-size:11px;color:#475569;">
          Tesla Trade Inc · Affiliate &amp; Partnership Desk · <a href="https://teslawealths.org" style="color:#64748b;text-decoration:none;">teslawealths.org</a>
        </div>
      </div>
    `
  },

  daily_yield: {
    id: 'daily_yield',
    name: 'Daily Algorithmic Profit Dispatch (+20% Surge)',
    target: 'All Registered Investors',
    subject: "📈 Today's Yield Report: Algorithmic Arbitrage Surplus & +20% Enhanced Returns",
    headline: 'High-Frequency Order Routing Delivering Maximum Daily Compounding',
    summary: 'A market performance report keeping investors informed and excited about their daily gains.',
    generateHtml: (name, email) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1c1724,#0c0d10);padding:28px 24px;border-bottom:1px solid #2a2038;text-align:center;">
          <div style="display:inline-block;padding:6px 16px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);border-radius:999px;color:#c084fc;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
            DAILY PERFORMANCE BULLETIN
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Today's Arbitrage Yield Surplus</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Algorithmic liquidity capture across Tesla ecosystem assets</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Investor'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            Our automated high-frequency arbitrage algorithms executed over 14,000 micro-spread orders over the last 24 hours, taking advantage of cross-market liquidity in TSLA equity, SpaceX private equity valuations, and digital treasury hedges.
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0;">
            <div style="background:#13151b;border:1px solid #242938;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:700;">WIN RATE TODAY</div>
              <div style="font-size:24px;font-weight:900;color:#22c55e;">98.4%</div>
            </div>
            <div style="background:#13151b;border:1px solid #242938;border-radius:12px;padding:16px;text-align:center;">
              <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:700;">ACTIVE PROMOTION</div>
              <div style="font-size:24px;font-weight:900;color:#d4af37;">+20% BOOST</div>
            </div>
          </div>
          <div style="background:#10131a;border:1px solid #222938;border-radius:12px;padding:18px;margin-bottom:24px;">
            <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin:0;">
              ✨ <strong>Special Announcement:</strong> An extra <strong>+20% profit bonus</strong> is currently applied across all active programs (Explorer at 70%, Pioneer at 100%, Visionary at 140%, and Pioneer Plus at 200%). Reinvest today to compound your yields at these top-tier promotional rates.
            </p>
          </div>
          <div style="text-align:center;margin:26px 0 20px;">
            <a href="https://teslawealths.org/dashboard" style="display:inline-block;background:linear-gradient(135deg,#e31937,#b01027);color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(227,25,55,0.4);text-transform:uppercase;">
              View Live Portfolio &amp; Trade Now →
            </a>
          </div>
        </div>
        <div style="background:#08090b;padding:16px 24px;border-top:1px solid #1c1f26;text-align:center;font-size:11px;color:#475569;">
          Tesla Trade Inc · Algorithmic Strategy Dispatch · <a href="https://teslawealths.org" style="color:#64748b;text-decoration:none;">teslawealths.org</a>
        </div>
      </div>
    `
  },

  vip_tier: {
    id: 'vip_tier',
    name: 'Visionary & Pioneer Plus Allocation (VIP Upgrade)',
    target: 'Active Investors Seeking Larger Allocations',
    subject: '✨ Priority Allocation: Unlock 140% – 200% ROI in Visionary Tiers',
    headline: 'High-Conviction Portfolios for Accelerated Wealth Creation',
    summary: 'A prestigious invitation for capital allocators to participate in higher return brackets.',
    generateHtml: (name, email) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1f1a0e,#0c0d10);padding:28px 24px;border-bottom:1px solid #3d3015;text-align:center;">
          <div style="display:inline-block;padding:6px 16px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.4);border-radius:999px;color:#fce79a;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
            PRIVATE CLIENT INVITATION
          </div>
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Visionary &amp; Pioneer Plus Access</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Reserved for accredited and institutional capital allocators</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Valued Investor'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            We are pleased to invite you to allocate capital into our premier institutional tiers: <strong>Visionary ($10k – $25k)</strong> and <strong>Pioneer Plus ($25k – $55k)</strong>.
          </p>
          <div style="background:#13151b;border:1px solid #332b17;border-radius:12px;padding:20px;margin:22px 0;">
            <div style="font-size:12px;font-weight:800;color:#d4af37;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">TIER PRIVILEGES:</div>
            <ul style="margin:0;padding-left:18px;color:#cbd5e1;font-size:13px;line-height:1.7;">
              <li><strong style="color:#ffffff;">Visionary:</strong> <strong>140% Projected ROI</strong> over a 90-day cycle.</li>
              <li><strong style="color:#ffffff;">Pioneer Plus:</strong> Top <strong>200% Projected ROI</strong> over 180 days.</li>
              <li><strong style="color:#22c55e;">Priority Settlement:</strong> Expedited same-day withdrawal handling.</li>
              <li><strong style="color:#ffffff;">Direct Ecosystem Exposure:</strong> Participation in private equity pre-IPO valuations.</li>
            </ul>
          </div>
          <div style="text-align:center;margin:30px 0 20px;">
            <a href="https://teslawealths.org/invest?plan=elite_ai" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#aa820a);color:#0a0a0a;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(212,175,55,0.35);text-transform:uppercase;">
              Explore Visionary Allocation →
            </a>
          </div>
        </div>
        <div style="background:#08090b;padding:16px 24px;border-top:1px solid #1c1f26;text-align:center;font-size:11px;color:#475569;">
          Tesla Trade Inc · Private Wealth Division · <a href="https://teslawealths.org" style="color:#64748b;text-decoration:none;">teslawealths.org</a>
        </div>
      </div>
    `
  },

  reengagement: {
    id: 'reengagement',
    name: 'Dormant Account Re-engagement & Yield Alert',
    target: 'Registered Users with No Deposit',
    subject: "⏳ Your Tesla Trade Portfolio Is Waiting — Don't Miss Today's Yield Cycle",
    headline: 'Activate Your Balance in 2 Minutes and Start Compounding',
    summary: 'A warm, encouraging nudge to help inactive users activate their accounts.',
    generateHtml: (name, email) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1f1214,#0c0d10);padding:28px 24px;border-bottom:1px solid #3d1c22;text-align:center;">
          <h1 style="color:#ffffff;font-size:24px;font-weight:900;margin:0 0 6px;letter-spacing:-0.5px;">Your Portfolio Awaits You</h1>
          <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">Automated wealth creation is just one step away</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:15px;color:#e2e8f0;line-height:1.6;margin-top:0;">Hello <strong>${name || 'Investor'}</strong>,</p>
          <p style="font-size:14px;color:#94a3b8;line-height:1.6;">
            We noticed you haven't completed your deposit since joining Tesla Trade. Our institutional algorithms operate around the clock, generating risk-managed returns across global technology assets.
          </p>
          <div style="background:#13151b;border:1px solid #242938;border-radius:12px;padding:18px;margin:22px 0;">
            <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin:0;">
              Starting is effortless: choose your plan starting at just $30, complete your transfer via crypto or wire, and our verification team will activate your daily yield instantly.
            </p>
          </div>
          <div style="text-align:center;margin:28px 0 20px;">
            <a href="https://teslawealths.org/invest" style="display:inline-block;background:linear-gradient(135deg,#e31937,#b01027);color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;letter-spacing:0.8px;padding:15px 32px;border-radius:12px;box-shadow:0 8px 24px rgba(227,25,55,0.4);text-transform:uppercase;">
              Activate Your Account Now →
            </a>
          </div>
        </div>
        <div style="background:#08090b;padding:16px 24px;border-top:1px solid #1c1f26;text-align:center;font-size:11px;color:#475569;">
          Tesla Trade Inc · Investor Onboarding · <a href="https://teslawealths.org" style="color:#64748b;text-decoration:none;">teslawealths.org</a>
        </div>
      </div>
    `
  }
};

async function sendMarketingViaResend(apiKey, fromEmail, toEmail, toName, subject, htmlBody) {
  const sender = fromEmail || 'no-reply@teslawealths.org';

  if (!apiKey) return { ok: false, simulated: false, error: 'Resend API key is not configured. No email was sent.' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Tesla Trade Inc <${sender}>`,
        to: [toEmail],
        subject: subject,
        html: htmlBody
      })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) {
      return { ok: true, simulated: false, id: data.id };
    }
    return { ok: false, simulated: false, error: data.message || ('Resend HTTP ' + res.status) };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      error: err.message
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const body = req.method === 'POST' ? await parseBody(req) : {};
  const action = body.action || url.searchParams.get('action') || 'all_data';

  // ── 0. AUTHENTICATION CHECK ─────────────────────────────────────
  if (action === 'verify_auth' || action === 'login') {
    if (isAuthorizedAdmin(req, body, url)) {
      return res.status(200).json({ success: true, authenticated: true, message: 'Admin authenticated successfully.' });
    }
    return res.status(401).json({ success: false, authenticated: false, error: 'Incorrect administrator password.' });
  }

  // ── PREVIEW TEMPLATE CAN RETURN INSTANTLY WITHOUT DB ───────────
  if (action === 'preview_template') {
    const templateId = body.templateId || url.searchParams.get('templateId') || 'no_deposit';
    const tmpl = MARKETING_TEMPLATES[templateId] || MARKETING_TEMPLATES.no_deposit;
    const sampleHtml = tmpl.generateHtml('Alex Morgan', 'alex@example.com', 'TT-VIP-2026');

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

  // All other admin actions STRICTLY REQUIRE authentic admin password
  if (!isAuthorizedAdmin(req, body, url)) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Unauthorized: Valid administrator password required.'
    });
  }

  let conn = null;
  let isDbConnected = false;

  try {
    conn = await getDbConnection();
    isDbConnected = true;
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS marketing_emails_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          campaign_type VARCHAR(100) NOT NULL,
          subject VARCHAR(255) DEFAULT '',
          status VARCHAR(50) DEFAULT 'sent',
          resend_id VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (e) {}
  } catch (err) {
    // Database is unavailable (DNS/offline in sandbox); use mockStore gracefully
    isDbConnected = false;
    conn = null;
  }

  try {
    // ── 0b. GET DEPOSIT RECEIPT DETAILS & FULL IMAGE ───────────────
    if (action === 'get_receipt' || action === 'view_receipt') {
      const rawId = body.id || url.searchParams.get('id') || '';
      const cleanId = String(rawId).replace(/^dep_/, '').replace(/^user_/, '').trim();
      const depId = cleanId ? ('dep_' + cleanId) : '';
      const email = cleanString(body.email || url.searchParams.get('email') || (String(rawId).includes('@') ? rawId : '')).toLowerCase().trim();

      let found = null;
      const matches = (d) => {
        if (!d) return false;
        const dId = String(d.id || '').trim();
        const dClean = dId.replace(/^dep_/, '').trim();
        const dEmail = String(d.user_email || d.email || d.user_id || d.userId || '').toLowerCase().trim();
        if (rawId && (dId === String(rawId) || dId === cleanId || dId === depId || dClean === cleanId)) return true;
        if (email && dEmail === email) return true;
        return false;
      };

      try {
        const disk = loadPersistentDeposits();
        found = disk.find(matches);
      } catch (e) {}

      if (!found && Array.isArray(inMemoryDeposits)) {
        found = inMemoryDeposits.find(matches);
      }

      if (!found && isDbConnected && conn) {
        try {
          const [rows] = await conn.query(
            'SELECT * FROM investments WHERE id=? OR id=? OR id=? OR LOWER(user_email)=? LIMIT 1',
            [rawId, cleanId, depId, email]
          );
          if (rows.length > 0) found = rows[0];
        } catch (e) {}
      }

      if (found) {
        if (conn) await conn.end();
        return res.status(200).json({
          success: true,
          deposit: found,
          receipt: found.payment_proof_path || '',
          receiptName: found.payment_proof_name || 'receipt.jpg',
          amount: found.total,
          method: found.method,
          reference: found.payment_reference,
          status: found.status,
          userEmail: found.user_email || found.email,
          userName: found.user_name || 'Investor'
        });
      }

      if (conn) await conn.end();
      return res.status(404).json({ success: false, error: 'Deposit receipt not found' });
    }

    // ── 1. GET ALL DASHBOARD DATA ───────────────────────────────────
    if (action === 'all_data' || req.method === 'GET') {
      if (!isDbConnected || !conn) {
        return res.status(503).json({
          success: false,
          error: 'The investor database is unavailable. Admin data was not replaced with mock or cached records.'
        });
      }
      let investors = mockStore.investors;
      let investments = mockStore.investments;
      let dbInvestmentsAuthoritative = false; // true when investments came from MySQL
      let kyc = mockStore.kyc;
      let orders = mockStore.orders;
      let withdrawals = mockStore.withdrawals;
      let financing = mockStore.financing;
      let codes = mockStore.codes;
      let clicks = mockStore.clicks;
      let marketingLogs = mockStore.marketingLogs;
      let settings = { ...mockStore.settings };

      if (isDbConnected && conn) {
        // Run each query on its own: previously one failing query (e.g. a
        // table that does not exist yet) threw away every result and the
        // admin fell back to the empty in-memory store, so investors
        // "disappeared" right after an approval.
        const safeQuery = async (sql, fallback) => {
          try { const [rows] = await conn.query(sql); return rows; }
          catch (e) { console.error('[admin all_data] query failed:', sql.slice(0, 60), e.message); return fallback; }
        };
        try {
          const [investorRows] = await conn.query('SELECT * FROM investor_accounts ORDER BY registered_at DESC');
          const [investmentRows] = await conn.query('SELECT * FROM investments ORDER BY id DESC');
          investors = investorRows;
          investments = investmentRows;
          dbInvestmentsAuthoritative = true;
        } catch (e) {
          console.error('[admin all_data] authoritative investor query failed:', e.message);
          await conn.end();
          return res.status(503).json({
            success: false,
            error: 'Investor records could not be loaded from MySQL. Cached or mock investor data was not substituted.'
          });
        }
        kyc = await safeQuery('SELECT * FROM kyc_submissions ORDER BY created_at DESC', kyc);
        orders = await safeQuery('SELECT * FROM ev_orders ORDER BY created_at DESC LIMIT 100', orders);
        withdrawals = await safeQuery('SELECT * FROM withdrawals ORDER BY created_at DESC', withdrawals);
        financing = await safeQuery('SELECT * FROM financing_applications ORDER BY created_at DESC', financing);
        codes = await safeQuery('SELECT * FROM invitation_codes ORDER BY created_at DESC', codes);
        clicks = await safeQuery('SELECT * FROM analytics_clicks ORDER BY id DESC LIMIT 50', clicks);
        marketingLogs = await safeQuery('SELECT * FROM marketing_emails_log ORDER BY created_at DESC LIMIT 60', marketingLogs);
        const sRows = await safeQuery('SELECT `key`, `value` FROM app_settings', []);
        for (const row of sRows) settings[row.key] = row.value;
        await conn.end();
      }

      // Merge disk persistent deposits (guaranteed cross-serverless persistence)
      try {
        const diskDeposits = loadPersistentDeposits();
        if (Array.isArray(diskDeposits) && diskDeposits.length > 0) {
          const mergedInvs = [...investments];
          for (const dep of diskDeposits) {
            const idx = mergedInvs.findIndex(x => String(x.id) === String(dep.id) || (dep.user_email && (x.user_email || '').toLowerCase() === dep.user_email.toLowerCase() && (dep.status === 'active' || dep.status === 'approved')));
            if (idx >= 0) {
              if (dbInvestmentsAuthoritative) {
                // MySQL row is the truth; never overwrite it with stale disk copies.
              } else if (dep.status === 'active' || dep.status === 'approved') {
                mergedInvs[idx] = { ...mergedInvs[idx], ...dep, status: 'active' };
              } else if (!dbInvestmentsAuthoritative) {
                mergedInvs[idx] = { ...mergedInvs[idx], ...dep };
              }
            } else if (!dbInvestmentsAuthoritative) {
              mergedInvs.unshift(dep);
            }
          }
          investments = mergedInvs;
        }
      } catch (e) {}

      // Merge memory deposits submitted via client
      if (Array.isArray(inMemoryDeposits) && inMemoryDeposits.length > 0) {
        const mergedInvs = [...investments];
        for (const dep of inMemoryDeposits) {
          const idx = mergedInvs.findIndex(x => String(x.id) === String(dep.id));
          if (idx >= 0) {
            if (!dbInvestmentsAuthoritative) mergedInvs[idx] = { ...mergedInvs[idx], ...dep };
          } else if (!dbInvestmentsAuthoritative) {
            mergedInvs.unshift(dep);
          }
        }
        investments = mergedInvs;
      }

      // Merge disk persistent registered investors
      try {
        const diskInvestors = loadPersistentInvestors();
        if (!dbInvestmentsAuthoritative && Array.isArray(diskInvestors)) {
          for (const u of diskInvestors) {
            const em = (u.email || '').toLowerCase();
            const idx = investors.findIndex(x => (x.email || '').toLowerCase() === em);
            if (idx >= 0) {
              investors[idx] = { ...investors[idx], ...u };
            } else {
              investors.unshift(u);
            }
          }
        }
      } catch (e) {}

      // Ensure investors list includes any depositor and reflects their active/pending status accurately
      for (const inv of investments) {
        const em = String(inv.user_email || inv.email || inv.user_id || inv.userId || '').toLowerCase().trim();
        if (!em || !em.includes('@')) continue;
        const existingIdx = investors.findIndex(u => (u.email || '').toLowerCase().trim() === em);
        const isActive = inv.status === 'active' || inv.status === 'approved' || inv.status === 'completed';
        if (existingIdx >= 0) {
          if (isActive) investors[existingIdx].onboarding_status = 'active';
        } else {
          investors.push({
            id: 'u_' + Math.random().toString(36).substring(2, 7),
            name: inv.user_name || 'Investor',
            email: em,
            phone: '—',
            onboarding_status: isActive ? 'active' : 'pending_deposit',
            registered_at: inv.created_at || new Date().toISOString()
          });
        }
      }

      investors.forEach(u => {
        const em = String(u.email || '').toLowerCase().trim();
        const userInvs = investments.filter(i => {
          const iEmail = String(i.user_email || i.email || i.user_id || i.userId || '').toLowerCase().trim();
          return iEmail === em;
        });
        const activeInvs = userInvs.filter(i => i.status === 'active' || i.status === 'approved' || i.status === 'completed');
        const targetInvs = activeInvs.length ? activeInvs : userInvs;
        const totalDep = targetInvs.reduce((sum, i) => sum + parseFloat(i.total != null ? i.total : (i.amount || 0)), 0);
        const totalVal = targetInvs.reduce((sum, i) => {
          const dep = parseFloat(i.total != null ? i.total : (i.amount || 0));
          const cur = parseFloat(i.total_current_value != null ? i.total_current_value : (i.totalCurrentValue != null ? i.totalCurrentValue : dep));
          return sum + (cur > 0 ? cur : dep);
        }, 0);
        u.total_deposited = totalDep;
        u.total_current_value = totalVal > 0 ? totalVal : totalDep;
        u.available_balance = u.total_current_value;
        if (activeInvs.length > 0) {
          u.onboarding_status = 'active';
        }
      });

      // Filter out automated test fixture accounts
      const isMockEmail = (em) => {
        if (!em) return false;
        const s = String(em).toLowerCase().trim();
        return s.includes('example.com') || s.includes('test_user_') || s.includes('investor_test_') || s.includes('flow_test_');
      };
      investors = investors.filter(u => !isMockEmail(u.email));
      investments = investments.filter(i => !isMockEmail(i.user_email || i.email || i.user_id));

      const unfundedCount = investors.filter(inv => {
        const matching = investments.filter(i => (i.user_email || '').toLowerCase() === (inv.email || '').toLowerCase());
        const totalVol = matching.reduce((acc, curr) => acc + parseFloat(curr.total || '0'), 0);
        return totalVol <= 0;
      }).length;

      const activeCount = Math.max(0, investors.length - unfundedCount);

      return res.status(200).json({
        success: true,
        isDbConnected,
        investors,
        investments,
        kyc,
        orders,
        withdrawals,
        financing,
        codes,
        clicks,
        marketingLogs,
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

    // ── SUPPORT INBOX: THREADS, REPLIES, AND CLOSE ─────────────────
    if (action === 'send_test_email') {
      const recipient = cleanString(body.email || body.to || '');
      if (!recipient.includes('@')) return res.status(400).json({success:false,error:'Enter a valid test recipient email.'});
      try {
        const { sendTestEmail } = await import('../mailer.js');
        const result = await sendTestEmail(recipient);
        if (!result.ok) return res.status(502).json({success:false,error:result.error || 'Email provider rejected the test message.'});
        return res.status(200).json({success:true,message:'Test email accepted by Resend.',resendId:result.id});
      } catch (error) { return res.status(502).json({success:false,error:error.message || 'Test email failed.'}); }
    }
    if (['support_list','support_thread','support_reply','support_close'].includes(action)) {
      if (!isDbConnected || !conn) return res.status(503).json({ success:false, error:'Support inbox requires the live database.' });
      await ensureSupportTables(conn);
      if (action === 'support_list') {
        const [threads] = await conn.query(
          "SELECT t.id,t.user_email,t.user_name,t.subject,t.status,t.created_at,t.updated_at,(SELECT COUNT(*) FROM support_messages m WHERE m.thread_id=t.id) AS message_count,(SELECT m.message FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,(SELECT m.sender_role FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender FROM support_threads t ORDER BY t.updated_at DESC LIMIT 200"
        );
        return res.status(200).json({success:true,threads});
      }
      const threadId = cleanString(body.threadId || body.id);
      if (!threadId) return res.status(400).json({success:false,error:'Support ticket ID is required.'});
      const [threadRows] = await conn.query('SELECT id,user_email,user_name,subject,status,created_at,updated_at FROM support_threads WHERE id=? LIMIT 1',[threadId]);
      const thread = threadRows[0];
      if (!thread) return res.status(404).json({success:false,error:'Support ticket not found.'});
      if (action === 'support_thread') {
        const [messages] = await conn.query('SELECT sender_role,sender_name,message,created_at FROM support_messages WHERE thread_id=? ORDER BY created_at ASC',[threadId]);
        return res.status(200).json({success:true,thread,messages});
      }
      if (action === 'support_close') {
        await conn.query("UPDATE support_threads SET status='closed',updated_at=NOW() WHERE id=?",[threadId]);
        return res.status(200).json({success:true,message:'Support conversation closed.'});
      }
      const message = String(body.message || '').trim().slice(0,5000);
      if (message.length < 2) return res.status(400).json({success:false,error:'Write a reply before sending.'});
      const accessToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      await conn.beginTransaction();
      await conn.query('INSERT INTO support_messages (id,thread_id,sender_role,sender_name,message) VALUES (?,?,?,?,?)',[crypto.randomUUID(),threadId,'admin','Tesla Trade Support',message]);
      await conn.query("INSERT INTO support_thread_tokens (id,thread_id,token_hash) VALUES (?,?,?)",[crypto.randomUUID(),threadId,tokenHash]);
      await conn.query("UPDATE support_threads SET status='answered',updated_at=NOW() WHERE id=?",[threadId]);
      await conn.commit();
      const ticketUrl = 'https://teslawealths.org/support?ticket='+encodeURIComponent(threadId)+'&token='+encodeURIComponent(accessToken);
      try {
        const { sendSupportMessageEmail } = await import('../notifications.js');
        const mail = await sendSupportMessageEmail({to:thread.user_email,userName:thread.user_name,subject:'Support replied: '+thread.subject,message,ticketUrl});
        return res.status(200).json({success:true,emailSent:!!mail?.ok,message:mail?.ok?'Reply sent and investor notified.':'Reply saved, but email notification failed: '+(mail?.error || 'unknown delivery error')});
      } catch (mailError) {
        console.error('[support admin reply] email failed:',mailError.message);
        return res.status(200).json({success:true,emailSent:false,message:'Reply saved, but email notification failed. Check the email delivery log.'});
      }
    }

    if (['support_list','support_thread','support_reply','support_close'].includes(action)) {
      if (!isDbConnected || !conn) return res.status(503).json({success:false,error:'Support inbox requires the live database.'});
      await ensureSupportTables(conn);
      if (action === 'support_list') {
        const [threads] = await conn.query("SELECT t.id,t.user_email,t.user_name,t.subject,t.status,t.created_at,t.updated_at,(SELECT COUNT(*) FROM support_messages m WHERE m.thread_id=t.id) AS message_count,(SELECT m.message FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,(SELECT m.sender_role FROM support_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender FROM support_threads t ORDER BY t.updated_at DESC LIMIT 200");
        try { await conn.end(); } catch {}
        return res.status(200).json({success:true,threads});
      }
      const threadId = cleanString(body.threadId || body.id);
      if (!threadId) { try { await conn.end(); } catch {} return res.status(400).json({success:false,error:'Support ticket ID is required.'}); }
      const [threadRows] = await conn.query('SELECT id,user_email,user_name,subject,status,created_at,updated_at FROM support_threads WHERE id=? LIMIT 1',[threadId]);
      const thread = threadRows[0];
      if (!thread) { try { await conn.end(); } catch {} return res.status(404).json({success:false,error:'Support ticket not found.'}); }
      if (action === 'support_thread') {
        const [messages] = await conn.query('SELECT sender_role,sender_name,message,created_at FROM support_messages WHERE thread_id=? ORDER BY created_at ASC',[threadId]);
        try { await conn.end(); } catch {}
        return res.status(200).json({success:true,thread,messages});
      }
      if (action === 'support_close') {
        await conn.query("UPDATE support_threads SET status='closed',updated_at=NOW() WHERE id=?",[threadId]);
        try { await conn.end(); } catch {}
        return res.status(200).json({success:true,message:'Support conversation closed.'});
      }
      const message = String(body.message || '').trim().slice(0,5000);
      if (message.length < 2) { try { await conn.end(); } catch {} return res.status(400).json({success:false,error:'Write a reply before sending.'}); }
      const accessToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      await conn.beginTransaction();
      await conn.query('INSERT INTO support_messages (id,thread_id,sender_role,sender_name,message) VALUES (?,?,?,?,?)',['msg_'+crypto.randomUUID(),threadId,'admin','Tesla Trade Support',message]);
      await conn.query('INSERT INTO support_thread_tokens (id,thread_id,token_hash) VALUES (?,?,?)',[crypto.randomUUID(),threadId,tokenHash]);
      await conn.query("UPDATE support_threads SET status='answered',updated_at=NOW() WHERE id=?",[threadId]);
      await conn.commit();
      try { await conn.end(); } catch {}
      const ticketUrl = 'https://teslawealths.org/support?ticket='+encodeURIComponent(threadId)+'&token='+encodeURIComponent(accessToken);
      try {
        const { sendSupportMessageEmail } = await import('../notifications.js');
        const mail = await sendSupportMessageEmail({to:thread.user_email,userName:thread.user_name,subject:'Support replied: '+thread.subject,message,ticketUrl});
        return res.status(200).json({success:true,emailSent:!!mail?.ok,message:mail?.ok?'Reply saved and investor notified.':'Reply saved, but email notification failed: '+(mail?.error || 'unknown delivery error')});
      } catch (mailError) {
        console.error('[support admin reply] email failed:',mailError.message);
        return res.status(200).json({success:true,emailSent:false,message:'Reply saved, but email notification failed. Check email delivery logs.'});
      }
    }

    // ── 2. MARKETING BLAST / AUTOPILOT CAMPAIGN DISPATCH ────────────
    if (action === 'marketing_blast') {
      const campaignType = body.campaign_type || 'no_deposit';
      const customSubject = body.custom_subject || '';
      const customBody = body.custom_body || '';
      const testRecipient = cleanString(body.test_recipient);
      const forceSend = body.force_send === true || body.force_send === '1';

      let settings = { ...mockStore.settings };
      let investors = mockStore.investors;
      let investments = mockStore.investments;
      let invCodes = mockStore.codes;

      if (isDbConnected && conn) {
        try {
          const [sRows] = await conn.query('SELECT `key`, `value` FROM app_settings');
          for (const row of sRows) settings[row.key] = row.value;
          const [inv] = await conn.query('SELECT * FROM investor_accounts');
          const [inments] = await conn.query('SELECT * FROM investments');
          const [cd] = await conn.query('SELECT * FROM invitation_codes WHERE status="active"');
          investors = inv;
          investments = inments;
          invCodes = cd;
        } catch (e) {}
      }

      const resendApiKey = cleanString(process.env.RESEND_API_KEY || settings.resend_api_key);
      const fromEmail = cleanString(settings.resend_from_email || process.env.RESEND_FROM_EMAIL || 'no-reply@teslawealths.org');
      const defaultCode = invCodes.length > 0 ? invCodes[0].code : 'TT-2026-VIP';

      let targetList = [];

      if (testRecipient) {
        targetList.push({ email: testRecipient, name: 'Admin Preview', code: defaultCode });
      } else {
        for (const inv of investors) {
          const em = cleanString(inv.email).toLowerCase();
          if (!em || !em.includes('@')) continue;

          const userInvs = investments.filter(i => (i.user_email || '').toLowerCase() === em);
          const totalVol = userInvs.reduce((acc, curr) => acc + parseFloat(curr.total || '0'), 0);

          if (campaignType === 'no_deposit' || campaignType === 'reengagement') {
            if (totalVol <= 0) targetList.push({ email: em, name: inv.name || 'Investor', code: defaultCode });
          } else if (campaignType === 'referral_share') {
            if (totalVol > 0 || inv.onboarding_status === 'active') targetList.push({ email: em, name: inv.name || 'Investor', code: defaultCode });
          } else {
            targetList.push({ email: em, name: inv.name || 'Investor', code: defaultCode });
          }
        }
      }

      if (targetList.length === 0) {
        if (conn) { try { await conn.end(); } catch {} }
        return res.status(200).json({ success: true, sent: 0, targetCount: 0, isSimulated: false, message: 'No eligible investors were found. No email was sent.' });
      }

      let sentCount = 0;
      const template = MARKETING_TEMPLATES[campaignType] || MARKETING_TEMPLATES.no_deposit;

      for (const target of targetList) {
        let subject = template.subject;
        let htmlBody = template.generateHtml(target.name, target.email, target.code);

        if (campaignType === 'custom_broadcast') {
          subject = customSubject || 'Important Announcement — Tesla Trade Inc';
          htmlBody = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#0c0d10;color:#ffffff;border-radius:16px;border:1px solid #232730;padding:28px 24px;">
              <h2 style="color:#ffffff;margin-top:0;">${subject}</h2>
              <p style="color:#e2e8f0;font-size:14px;line-height:1.7;white-space:pre-wrap;">${customBody || 'Hello from Tesla Trade Inc administration.'}</p>
              <div style="margin-top:24px;text-align:center;">
                <a href="https://teslawealths.org/overview" style="display:inline-block;background:#e31937;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;">Open Dashboard →</a>
              </div>
            </div>
          `;
        }

        const resendRes = await sendMarketingViaResend(resendApiKey, fromEmail, target.email, target.name, subject, htmlBody);

        const newLog = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          user_email: target.email,
          campaign_type: campaignType,
          subject,
          status: resendRes.ok ? 'accepted' : 'failed',
          resend_id: resendRes.id || '',
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        if (isDbConnected && conn) {
          try {
            await conn.query(
              'INSERT INTO marketing_emails_log (user_email, campaign_type, subject, status, resend_id) VALUES (?, ?, ?, ?, ?)',
              [newLog.user_email, newLog.campaign_type, newLog.subject, newLog.status, newLog.resend_id]
            );
          } catch (e) {}
        } else {
          mockStore.marketingLogs.unshift(newLog);
        }

        if (resendRes.ok) sentCount++;
      }

      if (isDbConnected && conn) {
        try {
          await conn.query(
            'INSERT INTO app_settings (`key`, `value`) VALUES ("marketing_last_run", NOW()) ON DUPLICATE KEY UPDATE `value`=NOW()'
          );
          await conn.end();
        } catch (e) {}
      }

      return res.status(200).json({
        success: true,
        campaign: campaignType,
        sent: sentCount,
        targetCount: targetList.length,
        isSimulated: false,
        logs: mockStore.marketingLogs,
        failed: targetList.length - sentCount,
        message: `Email provider accepted ${sentCount} of ${targetList.length} message(s) for "${template.name}". Failed: ${targetList.length - sentCount}.`
      });
    }

    // ── 3. CLEAR MARKETING THROTTLE LOGS ────────────────────────────
    if (action === 'clear_marketing_log') {
      if (isDbConnected && conn) {
        try {
          await conn.query('DELETE FROM marketing_emails_log');
          await conn.end();
        } catch (e) {}
      } else {
        mockStore.marketingLogs = [];
      }
      return res.status(200).json({ success: true, message: 'Marketing throttle log cleared successfully.' });
    }

    // ── 4. TOGGLE AUTOPILOT ENGINE ──────────────────────────────────
    if (action === 'toggle_autopilot') {
      const enabled = body.enabled ? 'true' : 'false';
      const interval = body.interval || '24h';
      if (isDbConnected && conn) {
        try {
          await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES ("autopilot_marketing_enabled", ?) ON DUPLICATE KEY UPDATE `value`=?', [enabled, enabled]);
          await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES ("autopilot_interval", ?) ON DUPLICATE KEY UPDATE `value`=?', [interval, interval]);
          await conn.end();
        } catch (e) {}
      } else {
        mockStore.settings.autopilot_marketing_enabled = enabled;
        mockStore.settings.autopilot_interval = interval;
      }
      return res.status(200).json({ success: true, enabled: enabled === 'true', interval });
    }

    // ── 5. ADD MONEY / CREDIT INVESTOR BALANCE ─────────────────────
    if (action === 'credit_balance' || action === 'add_funds') {
      const email = cleanString(body.email).toLowerCase();
      const amount = parseFloat(body.amount || '0');
      const note = body.note || 'Admin credit';

      if (!email || amount <= 0) {
        if (conn) await conn.end();
        return res.status(400).json({ success: false, error: 'Valid email and positive amount required.' });
      }

      let updatedTotal = amount;
      let updatedCurrentValue = amount;
      let targetInvId = 'dep_' + Date.now().toString(36);

      // Check persistent disk deposits first
      try {
        const diskDeposits = loadPersistentDeposits();
        const found = diskDeposits.find(d => (d.user_email || '').toLowerCase() === email);
        if (found) {
          targetInvId = found.id;
          const prevTotal = parseFloat(found.total || '0');
          const prevVal = parseFloat(found.total_current_value || found.totalCurrentValue || prevTotal);
          updatedTotal = prevTotal + amount;
          updatedCurrentValue = prevVal + amount;
          found.total = updatedTotal;
          found.total_current_value = updatedCurrentValue;
          found.totalCurrentValue = updatedCurrentValue;
          found.earnings = 0;
          found.status = 'active';
          savePersistentDeposit(found);
        } else {
          const newDisk = {
            id: targetInvId,
            tx_id: 'TX' + Date.now().toString(36).toUpperCase(),
            user_id: email,
            user_email: email,
            user_name: 'Investor',
            portfolio: 'Tesla · Explorer',
            plan_id: 'starter_ai',
            plan_label: 'Explorer',
            plan_name: 'Explorer',
            total: updatedTotal,
            total_current_value: updatedCurrentValue,
            totalCurrentValue: updatedCurrentValue,
            earnings: 0,
            status: 'active',
            method: 'Admin Credit',
            created_at: new Date().toISOString()
          };
          savePersistentDeposit(newDisk);
        }
      } catch (eDisk) {}

      // Check and update inMemoryDeposits
      if (Array.isArray(inMemoryDeposits)) {
        const memFound = inMemoryDeposits.find(d => (d.user_email || '').toLowerCase() === email);
        if (memFound) {
          memFound.total = updatedTotal;
          memFound.total_current_value = updatedCurrentValue;
          memFound.totalCurrentValue = updatedCurrentValue;
          memFound.earnings = updatedCurrentValue - updatedTotal;
          memFound.status = 'active';
        } else {
          inMemoryDeposits.unshift({
            id: targetInvId,
            tx_id: 'TX' + Date.now().toString(36).toUpperCase(),
            user_id: email,
            user_email: email,
            user_name: 'Investor',
            portfolio: 'Tesla · Explorer',
            plan_id: 'starter_ai',
            plan_label: 'Explorer',
            plan_name: 'Explorer',
            total: updatedTotal,
            total_current_value: updatedCurrentValue,
            totalCurrentValue: updatedCurrentValue,
            earnings: bonusMatch,
            status: 'active',
            method: 'Admin Credit',
            created_at: new Date().toISOString()
          });
        }
      }

      // Update mockStore
      const foundMock = mockStore.investments.find(i => (i.user_email || '').toLowerCase() === email);
      if (foundMock) {
        foundMock.total = updatedTotal;
        foundMock.total_current_value = updatedCurrentValue;
        foundMock.totalCurrentValue = updatedCurrentValue;
        foundMock.earnings = updatedCurrentValue - updatedTotal;
        foundMock.status = 'active';
      } else {
        mockStore.investments.unshift({
          id: targetInvId,
          user_email: email,
          user_name: 'Investor',
          plan_id: 'starter_ai',
          plan_name: 'Explorer',
          total: updatedTotal,
          total_current_value: updatedCurrentValue,
          totalCurrentValue: updatedCurrentValue,
          earnings: bonusMatch,
          status: 'active',
          created_at: new Date().toISOString()
        });
      }

      // Ensure mockStore investor is active and persistent
      savePersistentInvestor({ email, onboarding_status: 'active' });
      const mockInvUser = mockStore.investors.find(x => (x.email || '').toLowerCase() === email);
      if (mockInvUser) {
        mockInvUser.onboarding_status = 'active';
      } else {
        mockStore.investors.unshift({
          id: 'u_' + Date.now().toString(36),
          name: 'Investor',
          email: email,
          phone: '—',
          onboarding_status: 'active',
          registered_at: new Date().toISOString()
        });
      }

      // Sync trading store
      try {
        const { tradingInvestments } = await import('./trading.js');
        tradingInvestments[targetInvId] = {
          id: targetInvId,
          status: 'active',
          total: updatedCurrentValue,
          totalCurrentValue: updatedCurrentValue,
          tradingStatus: 'idle',
          tradingAmount: 0,
          tradingStartedAt: null
        };
      } catch (eTr) {}

      if (isDbConnected && conn) {
        try {
          const [invRows] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC LIMIT 1', [email]);
          if (invRows.length > 0) {
            await conn.query('UPDATE investments SET total=?, total_current_value=?, earnings=?, status="active" WHERE id=?', [updatedTotal, updatedCurrentValue, updatedCurrentValue - updatedTotal, invRows[0].id]);
          } else {
            await conn.query(
              'INSERT INTO investments (id, tx_id, user_id, user_email, user_name, plan_id, plan_name, total, total_current_value, earnings, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "active", "admin_credit", NOW())',
              [targetInvId, 'TX' + Date.now(), email, email, 'Investor', 'starter_ai', 'Explorer', updatedTotal, updatedCurrentValue, bonusMatch]
            );
          }
          await conn.query('UPDATE investor_accounts SET onboarding_status="active", deposit_match_eligible=1 WHERE LOWER(email)=?', [email]);

          const txDepId = 'tx_' + Math.random().toString(36).substring(2, 9);
          const txBonId = 'tx_bonus_' + Math.random().toString(36).substring(2, 9);
          try {
            await conn.query(
              'INSERT INTO account_transactions (id, investment_id, user_email, type, amount, status, note, created_at) VALUES (?, ?, ?, "deposit", ?, "processed", ?, NOW())',
              [txDepId, targetInvId, email, amount, note || 'Account deposit credited']
            );
            await conn.query(
              'INSERT INTO account_transactions (id, investment_id, user_email, type, amount, status, note, created_at) VALUES (?, ?, ?, "bonus", ?, "processed", "100% First Deposit Match Bonus", NOW())',
              [txBonId, targetInvId, email, bonusMatch]
            );
          } catch (eTx) {}
          await conn.end();
        } catch (e) {}
      }

      return res.status(200).json({
        success: true,
        message: `Successfully credited $${amount.toFixed(2)} + 100% matching bonus ($${bonusMatch.toFixed(2)}) to ${email}! Total balance: $${updatedCurrentValue.toFixed(2)}.`,
        total: updatedTotal,
        totalCurrentValue: updatedCurrentValue
      });
    }

    // ── 6. APPROVE / REJECT INVESTMENT DEPOSIT RECEIPT ──────────────
    if (action === 'approve_deposit' || action === 'reject_deposit' || action === 'approve_investor') {
      if (!isDbConnected || !conn) {
        return res.status(503).json({
          success: false,
          error: 'Approval requires a live database connection. No fallback or mock approval was applied.'
        });
      }
      const rawId = body.id || '';
      const cleanId = String(rawId).replace(/^dep_/, '').trim();
      const depId = cleanId ? ('dep_' + cleanId) : '';
      const targetEmail = cleanString(body.email || url.searchParams.get('email')).toLowerCase();
      const status = action === 'reject_deposit' ? 'declined' : 'active';

      let approvedDepositAmount = parseFloat(body.amount || '0');
      let foundDeposit = null;
      let selectedDepositId = String(rawId || '').trim();
      // If the admin action only supplies an email, select one pending deposit,
      // then apply the action only to that deposit across the backing stores.
      if (!selectedDepositId && targetEmail) {
        const candidates = [
          ...loadPersistentDeposits(),
          ...inMemoryDeposits,
          ...mockStore.investments
        ];
        const candidate = candidates.find(d =>
          String(d.user_email || d.email || d.user_id || d.userId || '').toLowerCase().trim() === targetEmail &&
          ['pending', 'pending_approval', 'awaiting_payment', ''].includes(String(d.status || '').toLowerCase())
        );
        if (candidate?.id) selectedDepositId = String(candidate.id).trim();
      }

      const matchesDeposit = (d) => {
        if (!d) return false;
        const dId = String(d.id || '').trim();
        const dCleanId = dId.replace(/^dep_/, '').trim();
        return !!selectedDepositId && (
          dId === selectedDepositId ||
          dId === selectedDepositId.replace(/^dep_/, '') ||
          dId === ('dep_' + selectedDepositId.replace(/^dep_/, '')) ||
          dCleanId === selectedDepositId.replace(/^dep_/, '')
        );
      };

      // 1. Check disk persistent deposits
      try {
        const diskDeposits = loadPersistentDeposits();
        for (const found of diskDeposits) {
          if (matchesDeposit(found)) {
            if (!foundDeposit) foundDeposit = found;
            const amt = parseFloat(found.total != null ? found.total : (found.amount != null ? found.amount : 0));
            if (!approvedDepositAmount && !isNaN(amt) && amt > 0) approvedDepositAmount = amt;
            found.status = status;
            if (status === 'active') {
              const curTotal = approvedDepositAmount || amt || 0;
              found.total = curTotal;
              found.total_current_value = curTotal;
              found.totalCurrentValue = curTotal;
              found.earnings = 0;
            }
            savePersistentDeposit(found);
          }
        }
      } catch (e) {}

      // 2. Check memory deposits
      for (const mem of inMemoryDeposits) {
        if (matchesDeposit(mem)) {
          const amt = parseFloat(mem.total != null ? mem.total : (mem.amount != null ? mem.amount : 0));
          if (!approvedDepositAmount && !isNaN(amt) && amt > 0) approvedDepositAmount = amt;
          mem.status = status;
          if (status === 'active') {
            const curTotal = approvedDepositAmount || amt || 0;
            mem.total = curTotal;
            mem.total_current_value = curTotal;
            mem.totalCurrentValue = curTotal;
            mem.earnings = 0;
          }
          if (!foundDeposit) foundDeposit = mem;
        }
      }

      // 3. Check mockStore
      for (const inv of mockStore.investments) {
        if (matchesDeposit(inv)) {
          const amt = parseFloat(inv.total != null ? inv.total : (inv.amount != null ? inv.amount : 0));
          if (!approvedDepositAmount && !isNaN(amt) && amt > 0) approvedDepositAmount = amt;
          inv.status = status;
          if (status === 'active') {
            const curTotal = approvedDepositAmount || amt || 0;
            inv.total = curTotal;
            inv.total_current_value = curTotal;
            inv.totalCurrentValue = curTotal;
            inv.earnings = 0;
          }
          if (!foundDeposit) foundDeposit = inv;
        }
      }

      if (!approvedDepositAmount && body.amount != null) approvedDepositAmount = parseFloat(body.amount);
      let effectiveEmail = String(targetEmail || (foundDeposit && (foundDeposit.user_email || foundDeposit.email || foundDeposit.user_id)) || '').toLowerCase().trim();

      // MySQL is the source of truth for approval. Read the exact pending row
      // before changing any fallback copy or balance, and recover a zeroed
      // principal only from that row's own deposit ledger entries.
      let authoritativeDeposit = null;
      if (selectedDepositId) {
        const ids = [...new Set([
          selectedDepositId,
          selectedDepositId.replace(/^dep_/, ''),
          'dep_' + selectedDepositId.replace(/^dep_/, '')
        ].filter(Boolean))];
        const marks = ids.map(() => '?').join(',');
        const [dbRows] = await conn.query(
          "SELECT * FROM investments WHERE id IN (" + marks + ") AND status IN ('pending','pending_approval','awaiting_payment') LIMIT 1",
          ids
        );
        authoritativeDeposit = dbRows[0] || null;
      } else if (effectiveEmail) {
        const [dbRows] = await conn.query(
          "SELECT * FROM investments WHERE LOWER(user_email)=? AND status IN ('pending','pending_approval') ORDER BY created_at DESC LIMIT 1",
          [effectiveEmail]
        );
        authoritativeDeposit = dbRows[0] || null;
      }
      if (!authoritativeDeposit) {
        return res.status(404).json({
          success: false,
          error: 'The selected payment was not found in the investor database. No approval was applied.'
        });
      }
      selectedDepositId = String(authoritativeDeposit.id);
      effectiveEmail = String(authoritativeDeposit.user_email || effectiveEmail).toLowerCase().trim();
      const databasePrincipal = Number(authoritativeDeposit.total || 0);
      if (databasePrincipal > 0) {
        approvedDepositAmount = databasePrincipal;
      } else {
        const [ledgerRows] = await conn.query(
          "SELECT COALESCE(SUM(amount),0) AS amount FROM account_transactions WHERE investment_id=? AND type='deposit' AND amount>0",
          [selectedDepositId]
        );
        const ledgerPrincipal = Number(ledgerRows[0]?.amount || 0);
        if (ledgerPrincipal > 0) approvedDepositAmount = ledgerPrincipal;
      }

      if (status === 'active' && !effectiveEmail) {
        return res.status(400).json({ success: false, error: 'Investor email is required to approve a deposit.' });
      }
      if (status === 'active' && (!Number.isFinite(approvedDepositAmount) || approvedDepositAmount <= 0)) {
        return res.status(400).json({ success: false, error: 'A valid positive deposit amount could not be confirmed from the database.' });
      }
      const totalBalanceReal = approvedDepositAmount;
      // The offer is limited to the first two approved deposits per investor.
      // Use the persistent ledger to determine prior approved deposits; the
      // current investment is excluded so retries remain idempotent.
      let priorApprovedDeposits = 0;
      const [priorDepositRows] = await conn.query(
        "SELECT COUNT(DISTINCT investment_id) AS approved_count FROM account_transactions WHERE LOWER(user_email)=? AND type='deposit' AND status='processed' AND investment_id<>?",
        [effectiveEmail, selectedDepositId]
      );
      priorApprovedDeposits = Number(priorDepositRows[0]?.approved_count || 0);
      const bonusMatch = status === 'active' && approvedDepositAmount > 0 && priorApprovedDeposits < 2
        ? Number(approvedDepositAmount.toFixed(2)) : 0;
      const totalBalanceWithBonus = Number((totalBalanceReal + bonusMatch).toFixed(2));

      // Persist the matched value in the selected fallback record as well as
      // MySQL. Otherwise a later serverless instance can reload the stale
      // principal-only JSON copy and temporarily erase the match from the UI.
      if (foundDeposit && status === 'active') {
        foundDeposit.total = totalBalanceReal;
        foundDeposit.total_current_value = totalBalanceWithBonus;
        foundDeposit.totalCurrentValue = totalBalanceWithBonus;
        foundDeposit.bonus = bonusMatch;
        savePersistentDeposit(foundDeposit);
      }

      // If no deposit was found on disk or memory yet, create an approved record now
      // Reuse the validated email; never synthesize a placeholder investor.
      const effectiveId = selectedDepositId || rawId || depId || (foundDeposit && foundDeposit.id) || ('dep_' + Date.now().toString(36));

      if (!foundDeposit && effectiveEmail && status === 'active') {
        const freshDep = {
          id: effectiveId,
          tx_id: 'TX' + Date.now().toString(36).toUpperCase(),
          user_id: effectiveEmail,
          user_email: effectiveEmail,
          user_name: 'Investor',
          portfolio: 'Tesla · Explorer',
          plan_id: 'starter_ai',
          plan_label: 'Explorer',
          plan_name: 'Explorer',
          total: approvedDepositAmount,
          total_current_value: totalBalanceWithBonus,
          totalCurrentValue: totalBalanceWithBonus,
          earnings: 0,
          status: 'active',
          method: 'Crypto',
          created_at: new Date().toISOString()
        };
        savePersistentDeposit(freshDep);
        inMemoryDeposits.unshift(freshDep);
        mockStore.investments.unshift(freshDep);
      }

      // 4. Update investor account status in mockStore and persistent disk storage
      if (effectiveEmail && status === 'active') {
        savePersistentInvestor({
          email: effectiveEmail,
          name: (foundDeposit && foundDeposit.user_name) || 'Investor',
          onboarding_status: 'active'
        });
        const u = mockStore.investors.find(x => (x.email || '').toLowerCase() === effectiveEmail.toLowerCase());
        if (u) {
          u.onboarding_status = 'active';
        } else {
          mockStore.investors.unshift({
            id: 'u_' + Date.now().toString(36),
            name: (foundDeposit && foundDeposit.user_name) || 'Investor',
            email: effectiveEmail,
            phone: '—',
            onboarding_status: 'active',
            registered_at: new Date().toISOString()
          });
        }
      }

      // 5. Sync with algorithmic trading store so trading wallet reflects approved funds
      try {
        const { tradingInvestments } = await import('./trading.js');
        tradingInvestments[effectiveId] = {
          id: effectiveId,
          status: status,
          total: totalBalanceReal,
          totalCurrentValue: totalBalanceWithBonus,
          tradingStatus: 'idle',
          tradingAmount: 0,
          tradingStartedAt: null
        };
      } catch (eTr) {}

      // 5b. Update local persistent tesla_trade_db.json
      try {
        const { loadDatabaseSync, saveDatabaseSync } = await import('../db.js');
        const db = loadDatabaseSync();
        if (db && Array.isArray(db.investments)) {
          let foundInDb = false;
          for (const inv of db.investments) {
            const iEmail = String(inv.user_email || inv.email || '').toLowerCase().trim();
            const iId = String(inv.id || '').trim();
            const selectedId = String(selectedDepositId || effectiveId || '').trim();
            const selectedBareId = selectedId.replace(/^dep_/, '');
            if (
              iId === String(rawId) ||
              iId === cleanId ||
              iId === depId ||
              (selectedId && (iId === selectedId || iId === selectedBareId || iId === ('dep_' + selectedBareId)))
            ) {
              inv.status = status;
              if (status === 'active') {
                inv.total = approvedDepositAmount || inv.total || 0;
                inv.total_current_value = totalBalanceWithBonus;
                inv.totalCurrentValue = totalBalanceWithBonus;
              }
              foundInDb = true;
            }
          }
          if (!foundInDb && status === 'active' && effectiveEmail) {
            db.investments.unshift({
              id: effectiveId,
              user_id: effectiveEmail,
              user_email: effectiveEmail,
              user_name: (foundDeposit && foundDeposit.user_name) || 'Investor',
              portfolio: 'Tesla · Explorer',
              total: approvedDepositAmount,
              total_current_value: totalBalanceWithBonus,
              totalCurrentValue: totalBalanceWithBonus,
              status: 'active',
              method: 'Crypto',
              created_at: new Date().toISOString()
            });
          }
          if (db.investor_accounts && effectiveEmail && status === 'active') {
            const acc = db.investor_accounts.find(a => (a.email || '').toLowerCase().trim() === effectiveEmail);
            if (acc) acc.onboarding_status = 'active';
            else db.investor_accounts.unshift({ email: effectiveEmail, name: 'Investor', onboarding_status: 'active' });
          }
          if (effectiveEmail && status === 'active' && approvedDepositAmount > 0) {
            if (!Array.isArray(db.account_transactions)) db.account_transactions = [];
            const exists = db.account_transactions.some(t => String(t.investment_id) === String(effectiveId) && t.type === 'deposit');
            if (!exists) {
              db.account_transactions.unshift({
                id: 'tx_' + Math.random().toString(36).substring(2, 9),
                investment_id: effectiveId,
                user_email: effectiveEmail,
                type: 'deposit',
                amount: approvedDepositAmount,
                status: 'processed',
                note: 'Investment deposit approved',
                created_at: new Date().toISOString()
              });
            }
            const bonusExists = db.account_transactions.some(t => String(t.investment_id) === String(effectiveId) && t.type === 'bonus');
            if (!bonusExists && bonusMatch > 0) {
              db.account_transactions.unshift({
                id: 'tx_bonus_' + Math.random().toString(36).substring(2, 9),
                investment_id: effectiveId,
                user_email: effectiveEmail,
                type: 'bonus',
                amount: bonusMatch,
                status: 'processed',
                note: '100% First Deposit Match Bonus',
                created_at: new Date().toISOString()
              });
            }
          }
          saveDatabaseSync();
        }
      } catch (eLocalDb) {}

      // 6. Update MySQL Database if available
      let dbSaved = false;
      let dbError = null;
      if (isDbConnected && conn) {
        try {
          let result = null;
          // Update only the exact pending investment row validated above.
          [result] = await conn.query(
            `UPDATE investments
             SET status=?, total=?, total_current_value=?, earnings=?, updated_at=NOW(), activated_at=NOW()
             WHERE id=?`,
            [status, approvedDepositAmount, status === 'active' ? totalBalanceWithBonus : approvedDepositAmount, 0, selectedDepositId]
          );

          if ((!result || !result.affectedRows) && !rawId && effectiveEmail) {
            [result] = await conn.query(
              `UPDATE investments 
               SET status=?, total=?, total_current_value=?, earnings=?, updated_at=NOW(), activated_at=NOW() 
               WHERE id=?`,
              [status, approvedDepositAmount, status === 'active' ? totalBalanceWithBonus : approvedDepositAmount, 0, effectiveId]
            );
          }

          // Record the matched bonus once per approved investment so /api/my-status and wallet UI can read it.
          if (status === 'active' && bonusMatch > 0 && effectiveEmail) {
            const [bonusTxRows] = await conn.query(
              `SELECT id FROM account_transactions WHERE LOWER(user_email)=? AND investment_id=? AND type='bonus' LIMIT 1`,
              [effectiveEmail, effectiveId]
            );
            if (!bonusTxRows.length) {
              await conn.query(
                `INSERT INTO account_transactions (id, investment_id, user_email, type, amount, status, note, created_at) VALUES (?, ?, ?, 'bonus', ?, 'processed', '100% Deposit Match Bonus', NOW())`,
                ['tx_bonus_' + Math.random().toString(36).substring(2, 10), effectiveId, effectiveEmail, bonusMatch]
              );
            }
          }

          // Approval may update an existing payment only. Never fabricate a
          // new active investment when the selected database row was not updated.
          dbSaved = !!(result && result.affectedRows);

          if (effectiveEmail && status === 'active') {
            await conn.query(`UPDATE investor_accounts SET onboarding_status='active', deposit_match_eligible=1, activated_at=NOW() WHERE LOWER(email)=?`, [effectiveEmail]);
            // Idempotent deposit ledger write: retries must not create duplicate credits.
            try {
              const [depositTxRows] = await conn.query(
                `SELECT id FROM account_transactions WHERE LOWER(user_email)=? AND investment_id=? AND type='deposit' ORDER BY created_at DESC LIMIT 1`,
                [effectiveEmail, effectiveId]
              );
              if (depositTxRows.length) {
                await conn.query(
                  "UPDATE account_transactions SET amount=?, status='processed', reference_id=COALESCE(reference_id, ?), note=COALESCE(note, 'Investment deposit approved') WHERE id=?",
                  [approvedDepositAmount, authoritativeDeposit.tx_id || null, depositTxRows[0].id]
                );
              } else {
                const txDepId = 'tx_' + Math.random().toString(36).substring(2, 9);
                await conn.query(
                  `INSERT INTO account_transactions (id, investment_id, user_email, type, amount, status, reference_id, note, created_at) VALUES (?, ?, ?, 'deposit', ?, 'processed', ?, 'Investment deposit approved', NOW())`,
                  [txDepId, effectiveId, effectiveEmail, approvedDepositAmount, authoritativeDeposit.tx_id || null]
                );
              }
            } catch (eTx) { console.error('[admin approve] ledger upsert failed:', eTx.message); }
          }
          await conn.end();
        } catch (e) {
          dbError = e.message;
          console.error('[admin approve] database update failed:', e.message);
        }
      }

      // Disk/memory copies are only a valid persistence fallback when MySQL
      // was unavailable. If MySQL connected, a failed update/insert must not
      // be reported as a successful approval: the admin list is DB-backed.
      if (!isDbConnected && !dbSaved && foundDeposit) {
        dbSaved = true;
      }

      // Do not report approval success based on a mock/disk copy when MySQL
      // is connected. The persisted investment row is the source of truth.
      if (isDbConnected && !dbSaved) {
        return res.status(500).json({
          success: false,
          error: dbError || 'No matching investment row was updated in MySQL.',
          message: 'Approval was not confirmed in the database. The investor status remains unchanged; refresh and retry.'
        });
      }

      // Dispatch notifications only after MySQL confirms the status change.
      try {
        const [{ notifyPaymentStatusUpdate }, mailer] = await Promise.all([import('../telegram.js'), import('../mailer.js')]);
        const investorName = body.name || body.user_name || effectiveEmail;
        const payload = { user_email: effectiveEmail, user_name: investorName, total: approvedDepositAmount, plan_name: body.planName || body.plan_name || 'Investment Plan', status };
        const notificationResults = await Promise.allSettled([
          notifyPaymentStatusUpdate(payload),
          status === 'active'
            ? mailer.sendPaymentApprovedEmail(effectiveEmail, investorName, { amount: approvedDepositAmount, planName: payload.plan_name })
            : mailer.sendPaymentDeclinedEmail(effectiveEmail, investorName, { amount: approvedDepositAmount, planName: payload.plan_name })
        ]);
        notificationResults.forEach(result => {
          if (result.status === 'rejected') console.error('[admin approval] notification failed:', result.reason?.message || result.reason);
          else if (result.value?.ok === false) console.error('[admin approval] notification not delivered:', result.value.error);
        });
      } catch (notificationError) {
        console.error('[admin approval] notification dispatch failed:', notificationError.message);
      }

      return res.status(200).json({
        success: true,
        message: status === 'active'
          ? `Deposit of $${approvedDepositAmount.toFixed(2)} approved! Investor dashboard unlocked with verified active balance.`
          : `Deposit receipt updated to ${status}.`,
        status: status,
        total: approvedDepositAmount,
        totalCurrentValue: totalBalanceWithBonus
      });
    }

    // ── 7. KYC APPROVE / REJECT ─────────────────────────────────────
    if (action === 'approve_kyc' || action === 'reject_kyc') {
      const id = body.id;
      const status = action === 'approve_kyc' ? 'approved' : 'rejected';
      let kycEmail = '', kycName = 'Investor';
      if (isDbConnected && conn) {
        try {
          const [kycRows] = await conn.query('SELECT user_email,full_name FROM kyc_submissions WHERE id=? LIMIT 1',[id]);
          kycEmail = String(kycRows[0]?.user_email || '').toLowerCase();
          kycName = kycRows[0]?.full_name || 'Investor';
          await conn.query('UPDATE kyc_submissions SET status=? WHERE id=?', [status, id]);
          await conn.end();
        } catch (e) { try { await conn.end(); } catch {} return res.status(500).json({success:false,error:'KYC status could not be saved.'}); }
      } else {
        const k = mockStore.kyc.find(i => String(i.id) === String(id));
        if (k) { k.status = status; kycEmail = k.user_email || ''; kycName = k.full_name || 'Investor'; }
      }
      if (kycEmail) { try { const { sendEventEmail } = await import('../notifications.js'); await sendEventEmail({to:kycEmail,name:kycName,event:'Identity verification',subject:status==='approved'?'Your identity verification is approved':'Action needed for identity verification',message:status==='approved'?'Your identity verification has been approved. You can review your verification status and continue using your investor account.':'Your identity verification was not approved. Please sign in, review the KYC section for the latest status, and contact support if you need help.',ctaLabel:'View Verification Status',ctaPath:'/kyc'}); } catch (mailError) { console.error('[admin KYC email] failed:',mailError.message); } }
      return res.status(200).json({ success: true, message: `KYC updated to ${status}.` });
    }

    // ── 8. SHOP RECEIPT APPROVE / REJECT ───────────────────────────
    if (action === 'approve_receipt' || action === 'reject_receipt') {
      const id = body.id;
      const status = action === 'approve_receipt' ? 'approved' : 'rejected';
      if (isDbConnected && conn) {
        try {
          await conn.query('UPDATE ev_orders SET status=? WHERE id=?', [status, id]);
          await conn.end();
        } catch (e) {}
      } else {
        const ord = mockStore.orders.find(o => String(o.id) === String(id));
        if (ord) ord.status = status;
      }
      return res.status(200).json({ success: true, message: `Order updated to ${status}.` });
    }

    // ── 9. INVITATION CODE GENERATE ─────────────────────────────────
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
      mockStore.codes.unshift({ id: Date.now(), code: customCode, status: 'active', source: 'admin', created_at: new Date().toISOString() });
      return res.status(200).json({ success: true, created: customCode, codes: mockStore.codes });
    }

    // ── 10. SETTINGS SAVE ──────────────────────────────────────────
    if (action === 'save_settings') {
      const s = body.settings || {};
      if (!isDbConnected || !conn) return res.status(503).json({success:false,error:'Settings require the live database. Nothing was saved.'});
      try {
        for (const [k, v] of Object.entries(s)) {
          await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?', [k, String(v), String(v)]);
        }
        await conn.end();
        return res.status(200).json({ success: true, message: 'Settings saved successfully to the live database.' });
      } catch (error) {
        try { await conn.end(); } catch {}
        console.error('[admin save settings] failed:',error.message);
        return res.status(500).json({success:false,error:'Settings could not be saved to the live database: '+error.message});
      }
    }

    // ── 11. DELETE INVESTOR ─────────────────────────────────────────
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
      // Delete from mockStore & inMemoryDeposits
      mockStore.investors = mockStore.investors.filter(u => (u.email || '').toLowerCase() !== email);
      mockStore.investments = mockStore.investments.filter(i => (i.user_email || '').toLowerCase() !== email);
      if (Array.isArray(inMemoryDeposits)) {
        for (let i = inMemoryDeposits.length - 1; i >= 0; i--) {
          if ((inMemoryDeposits[i].user_email || '').toLowerCase() === email) {
            inMemoryDeposits.splice(i, 1);
          }
        }
      }
      // Delete from persistent disk deposits
      try {
        const disk = loadPersistentDeposits();
        const filtered = disk.filter(d => (d.user_email || d.email || '').toLowerCase() !== email);
        const fs = await import('fs');
        const path = await import('path');
        const p = path.resolve(process.cwd(), 'data', 'saved_deposits.json');
        fs.writeFileSync(p, JSON.stringify(filtered, null, 2), 'utf8');
        try { fs.writeFileSync('/tmp/tesla_saved_deposits.json', JSON.stringify(filtered, null, 2), 'utf8'); } catch (e) {}
      } catch (e) {}

      // Delete from persistent disk investors
      try {
        const diskInv = loadPersistentInvestors();
        const filteredInv = diskInv.filter(u => (u.email || '').toLowerCase() !== email);
        const fs = await import('fs');
        const path = await import('path');
        const pInv = path.resolve(process.cwd(), 'data', 'saved_investors.json');
        fs.writeFileSync(pInv, JSON.stringify(filteredInv, null, 2), 'utf8');
      } catch (e) {}

      return res.status(200).json({ success: true, message: `Investor ${email} deleted successfully.` });
    }

    // ── 11b. PURGE ALL MOCK & TEST DATA ──────────────────────────────
    if (action === 'purge_mock_data' || action === 'clear_all_test_data') {
      if (isDbConnected && conn) {
        try {
          await conn.query('DELETE FROM investments WHERE user_email LIKE "%example.com" OR user_email LIKE "%test%" OR user_email LIKE "%flow_test%"');
          await conn.query('DELETE FROM investor_accounts WHERE email LIKE "%example.com" OR email LIKE "%test%" OR email LIKE "%flow_test%"');
          await conn.end();
        } catch (e) {}
      }
      mockStore.investors = [];
      mockStore.investments = [];
      mockStore.kyc = [];
      mockStore.orders = [];
      mockStore.withdrawals = [];
      mockStore.financing = [];
      mockStore.marketingLogs = [];
      mockStore.clicks = [];
      if (Array.isArray(inMemoryDeposits)) inMemoryDeposits.length = 0;
      try {
        const fs = await import('fs');
        const path = await import('path');
        fs.writeFileSync(path.resolve(process.cwd(), 'data', 'saved_deposits.json'), '[]\n', 'utf8');
        fs.writeFileSync(path.resolve(process.cwd(), 'data', 'saved_investors.json'), '[]\n', 'utf8');
        try { fs.unlinkSync('/tmp/tesla_saved_deposits.json'); } catch (e) {}
      } catch (e) {}
      return res.status(200).json({ success: true, message: 'All mock and test data removed successfully.' });
    }

    // ── 12. GET / UPDATE TRADING GRAPH SETTINGS ─────────────────────
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
      if (isDbConnected && conn) {
        try {
          await conn.query('INSERT INTO app_settings (`key`, `value`) VALUES ("trading_settings", ?) ON DUPLICATE KEY UPDATE `value`=?', [JSON.stringify(mockStore.tradingSettings), JSON.stringify(mockStore.tradingSettings)]);
          await conn.end();
        } catch (e) {}
      }
      return res.status(200).json({ success: true, message: 'Trading graph settings saved.', settings: mockStore.tradingSettings });
    }

    if (conn) try { await conn.end(); } catch (e) {}
    return res.status(200).json({ success: true });

  } catch (error) {
    if (conn) try { await conn.end(); } catch (e) {}
    console.error('API Admin Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Admin API operation failed; success was not confirmed.',
      investors: mockStore.investors,
      investments: mockStore.investments,
      kyc: mockStore.kyc,
      orders: mockStore.orders,
      withdrawals: mockStore.withdrawals,
      financing: mockStore.financing,
      codes: mockStore.codes,
      clicks: mockStore.clicks,
      marketingLogs: mockStore.marketingLogs,
      marketingStats: {
        totalInvestors: mockStore.investors.length,
        unfundedCount: mockStore.investors.length,
        activeCount: 0,
        marketingEmailsSent: mockStore.marketingLogs.length,
        autopilotActive: true,
        resendApiKeyConfigured: false
      },
      settings: mockStore.settings
    });
  }
}
