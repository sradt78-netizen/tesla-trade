import { getDbConnection } from './dbcheck.js';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/^\/api/, '');
  const body = req.method === 'POST' ? await parseJsonBody(req) : {};

  const email = cleanString(
    body.email || body.user_email || url.searchParams.get('email')
  ).toLowerCase();

  // ── 1. GET /api/my-status OR /api/account-status ────────────────
  if (pathname === '/my-status' || pathname === '/account-status') {
    if (!email) {
      return res.status(200).json({
        account: false,
        name: '',
        investmentStatus: 'none',
        status: 'none',
        hasActiveInvestment: false,
        activeInvestmentId: null,
        pendingDepositTotal: 0,
        pendingPayments: [],
        investments: []
      });
    }

    let hasAccount = false;
    let investorName = 'Investor';
    let userInvestments = [];

    // 1. Try MySQL Database
    try {
      const conn = await getDbConnection();
      const [accRows] = await conn.query('SELECT name, email FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (accRows.length > 0) {
        hasAccount = true;
        investorName = accRows[0].name || investorName;
      }

      const [invRows] = await conn.query(
        'SELECT id, status, user_name, plan_id, plan_name, total, payment_submitted_at, payment_proof_path, payment_reference FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC',
        [email]
      );
      if (invRows.length > 0) {
        hasAccount = true;
        userInvestments = invRows;
        if ((!investorName || investorName === 'Investor') && invRows[0].user_name) {
          investorName = invRows[0].user_name;
        }
      }
      await conn.end();
    } catch (dbErr) {}

    // 2. Always check & merge in-memory deposits & mockStore
    try {
      const { inMemoryDeposits } = await import('./payment-submit.js');
      const memDeposits = inMemoryDeposits.filter(d => d.user_email && d.user_email.toLowerCase() === email);
      for (const md of memDeposits) {
        hasAccount = true;
        if (!userInvestments.some(inv => String(inv.id) === String(md.id))) {
          userInvestments.unshift(md);
        }
      }

      const { mockStore } = await import('./admin.js');
      const mockUser = mockStore.investors.find(u => u.email.toLowerCase() === email);
      if (mockUser) {
        hasAccount = true;
        if (mockUser.name) investorName = mockUser.name;
      }
      const mockInvs = mockStore.investments.filter(i => i.user_email && i.user_email.toLowerCase() === email);
      for (const mi of mockInvs) {
        hasAccount = true;
        if (!userInvestments.some(inv => String(inv.id) === String(mi.id))) {
          userInvestments.unshift(mi);
        }
      }
    } catch (eMem) {}

    // If an email was provided, treat as existing account session
    if (!hasAccount && email.includes('@')) {
      hasAccount = true;
    }

    let status = 'none';
    let activeInvestmentId = null;
    let pendingDepositTotal = 0;
    const pendingPayments = [];

    // Check for active investment
    const activeInv = userInvestments.find(inv => inv.status === 'active');
    if (activeInv) {
      status = 'active';
      activeInvestmentId = activeInv.id;
    }

    // Check for pending or declined investments
    for (const inv of userInvestments) {
      if (inv.status === 'pending_approval' || inv.status === 'pending') {
        const amt = parseFloat(inv.total || '0');
        pendingDepositTotal += amt;
        pendingPayments.push({
          id: inv.id,
          status: inv.status,
          planId: inv.plan_id || 'starter_ai',
          planName: inv.plan_name || inv.plan_label || 'Investment Plan',
          amount: amt,
          submittedAt: inv.payment_submitted_at || inv.created_at || new Date().toISOString()
        });
        if (status !== 'active') {
          status = 'pending_approval';
        }
      } else if (['declined', 'rejected', 'cancelled'].includes(inv.status) && status === 'none') {
        status = inv.status;
      }
    }

    return res.status(200).json({
      success: true,
      account: hasAccount,
      name: investorName,
      investmentStatus: status,
      status: status,
      id: activeInvestmentId || (pendingPayments[0] ? pendingPayments[0].id : null),
      hasActiveInvestment: status === 'active',
      activeInvestmentId: activeInvestmentId,
      pendingDepositTotal,
      pendingPayments,
      investments: userInvestments
    });
  }

  // ── 2. GET /api/transactions ─────────────────────────────────────
  if (pathname === '/transactions') {
    if (!email) return res.status(200).json([]);
    try {
      const conn = await getDbConnection();
      const [txs] = await conn.query(
        'SELECT * FROM account_transactions WHERE LOWER(user_email)=? ORDER BY id DESC LIMIT 100',
        [email]
      );
      await conn.end();
      return res.status(200).json(txs);
    } catch (e) {
      return res.status(200).json([]);
    }
  }

  // ── 3. /api/accounts OR /api/profile ─────────────────────────────
  if (pathname === '/accounts' || pathname === '/profile') {
    // GET: Read account
    if (req.method === 'GET') {
      if (!email) return res.status(400).json({ error: 'Email parameter required' });
      try {
        const conn = await getDbConnection();
        const [acc] = await conn.query('SELECT * FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
        const [inv] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC LIMIT 1', [email]);
        await conn.end();

        return res.status(200).json({
          email,
          name: acc[0]?.name || inv[0]?.user_name || 'Investor',
          phone: acc[0]?.phone || '',
          onboarding_status: acc[0]?.onboarding_status || 'active',
          investment: inv[0] || null
        });
      } catch (e) {
        try {
          const { mockStore } = await import('./admin.js');
          const acc = mockStore.investors.find(u => u.email.toLowerCase() === email);
          const { inMemoryDeposits } = await import('./payment-submit.js');
          const inv = inMemoryDeposits.find(i => i.user_email && i.user_email.toLowerCase() === email) ||
                      mockStore.investments.find(i => i.user_email && i.user_email.toLowerCase() === email);
          return res.status(200).json({
            email,
            name: acc?.name || inv?.user_name || 'Investor',
            phone: acc?.phone || '',
            onboarding_status: acc?.onboarding_status || (inv ? inv.status : 'active'),
            investment: inv || null
          });
        } catch (err2) {
          return res.status(200).json({ email, name: 'Investor', onboarding_status: 'active' });
        }
      }
    }

    // POST: Create or Update account
    if (req.method === 'POST') {
      const name = cleanString(body.name || email);
      const phone = cleanString(body.phone || '');
      const age = parseInt(body.age || '0', 10);

      try {
        const conn = await getDbConnection();
        await conn.query(
          `INSERT INTO investor_accounts (email, name, phone, age, onboarding_status, registered_at)
           VALUES (?, ?, ?, ?, 'plan_selection', NOW())
           ON DUPLICATE KEY UPDATE name=VALUES(name),
             phone=IF(VALUES(phone)='', phone, VALUES(phone)),
             age=IF(VALUES(age)=0, age, VALUES(age)),
             updated_at=NOW()`,
          [email, name, phone, age]
        );
        await conn.end();
      } catch (e) {}

      try {
        const { mockStore } = await import('./admin.js');
        const existing = mockStore.investors.find(u => u.email.toLowerCase() === email);
        if (existing) {
          existing.name = name;
          if (phone) existing.phone = phone;
        } else {
          mockStore.investors.unshift({
            id: Date.now(),
            name,
            email,
            phone,
            onboarding_status: 'plan_selection',
            registered_at: new Date().toISOString()
          });
        }
      } catch (e2) {}

      return res.status(200).json({
        success: true,
        status: 'plan_selection',
        email,
        name
      });
    }
  }

  return res.status(200).json({ success: true, email });
}
