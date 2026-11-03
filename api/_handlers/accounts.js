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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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
    let dbRead = false; // true once the database answered; its rows are authoritative

    let userAdminApproved = false;

    // 1. Try MySQL Database
    try {
      const conn = await getDbConnection();
      const [accRows] = await conn.query('SELECT name, email, onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (accRows.length > 0) {
        hasAccount = true;
        investorName = accRows[0].name || investorName;
        if (accRows[0].onboarding_status === 'active' || accRows[0].onboarding_status === 'verified' || accRows[0].onboarding_status === 'approved') {
          userAdminApproved = true;
        }
      }

      const [invRows] = await conn.query(
        'SELECT id, status, user_name, plan_id, plan_name, total, total_current_value, earnings, payment_submitted_at, payment_proof_path, payment_reference FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC',
        [email]
      );
      if (invRows.length > 0) {
        hasAccount = true;
        userInvestments = invRows;
        if ((!investorName || investorName === 'Investor') && invRows[0].user_name) {
          investorName = invRows[0].user_name;
        }
      }
      dbRead = true;
      await conn.end();
    } catch (dbErr) {}

    // 2. Always check & merge persistent disk deposits, in-memory deposits & mockStore
    try {
      const { inMemoryDeposits, loadPersistentDeposits } = await import('./payment-submit.js');
      if (typeof loadPersistentDeposits === 'function') {
        const diskDeposits = loadPersistentDeposits();
        const userDisk = diskDeposits.filter(d => (d.user_email || d.email || d.user_id || '').toLowerCase().trim() === email);
        for (const dd of userDisk) {
          hasAccount = true;
          const exIdx = userInvestments.findIndex(inv => String(inv.id) === String(dd.id));
          if (exIdx >= 0) {
            const isApproved = dd.status === 'active' || dd.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved' || userAdminApproved;
            userInvestments[exIdx] = {
              ...userInvestments[exIdx],
              ...dd,
              status: isApproved ? 'active' : (dd.status || userInvestments[exIdx].status)
            };
          } else {
            userInvestments.unshift(dd);
          }
        }
      }

      if (Array.isArray(inMemoryDeposits)) {
        const memDeposits = inMemoryDeposits.filter(d => (d.user_email || d.email || d.user_id || '').toLowerCase().trim() === email);
        for (const md of memDeposits) {
          hasAccount = true;
          const exIdx = userInvestments.findIndex(inv => String(inv.id) === String(md.id));
          if (exIdx >= 0) {
            const isApproved = md.status === 'active' || md.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved' || userAdminApproved;
            userInvestments[exIdx] = {
              ...userInvestments[exIdx],
              ...md,
              status: isApproved ? 'active' : (md.status || userInvestments[exIdx].status)
            };
          } else {
            userInvestments.unshift(md);
          }
        }
      }

      const { mockStore, loadPersistentInvestors } = await import('./admin.js');
      if (typeof loadPersistentInvestors === 'function') {
        const savedInvs = loadPersistentInvestors();
        const savedU = savedInvs.find(u => (u.email || '').toLowerCase().trim() === email);
        if (savedU) {
          hasAccount = true;
          if (savedU.name) investorName = savedU.name;
          if (savedU.onboarding_status === 'active' || savedU.onboarding_status === 'approved' || savedU.onboarding_status === 'verified') {
            userAdminApproved = true;
          }
        }
      }
      const mockUser = mockStore.investors.find(u => (u.email || '').toLowerCase().trim() === email);
      if (mockUser) {
        hasAccount = true;
        if (mockUser.name) investorName = mockUser.name;
        if (mockUser.onboarding_status === 'active' || mockUser.onboarding_status === 'approved' || mockUser.onboarding_status === 'verified') {
          userAdminApproved = true;
        }
      }
      const mockInvs = mockStore.investments.filter(i => (i.user_email || i.email || i.user_id || '').toLowerCase().trim() === email);
      for (const mi of mockInvs) {
        hasAccount = true;
        const exIdx = userInvestments.findIndex(inv => String(inv.id) === String(mi.id));
        if (exIdx >= 0) {
          const isApproved = mi.status === 'active' || mi.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved' || userAdminApproved;
          userInvestments[exIdx] = {
            ...userInvestments[exIdx],
            ...mi,
            status: isApproved ? 'active' : (mi.status || userInvestments[exIdx].status)
          };
        } else {
          userInvestments.unshift(mi);
        }
      }

      if (userAdminApproved) {
        if (userInvestments.length > 0) {
          userInvestments = userInvestments.map(inv => ({ ...inv, status: 'active' }));
        } else {
          let foundAmount = 0;
          try {
            const { loadPersistentDeposits } = await import('./payment-submit.js');
            const allD = loadPersistentDeposits();
            const anyMatch = allD.find(d => (d.user_email || d.email || d.user_id || '').toLowerCase().trim() === email);
            if (anyMatch && anyMatch.total) foundAmount = parseFloat(anyMatch.total);
          } catch(e) {}
          const defaultInv = {
            id: 'dep_' + email.replace(/[^a-z0-9]/g, '_'),
            tx_id: 'TX' + Date.now().toString(36).toUpperCase(),
            user_id: email,
            user_email: email,
            user_name: investorName || 'Investor',
            portfolio: [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: foundAmount }],
            plan_id: 'starter_ai',
            plan_label: 'Explorer',
            plan_name: 'Explorer',
            total: foundAmount,
            total_current_value: foundAmount,
            totalCurrentValue: foundAmount,
            bonus: 0,
            availableBalance: foundAmount,
            walletBalance: foundAmount,
            canWithdraw: true,
            status: 'active',
            method: 'Crypto',
            created_at: new Date().toISOString()
          };
          userInvestments.push(defaultInv);
        }
      }
    } catch (eMem) {}

    // If an email was provided, treat as existing account session
    if (!hasAccount && email.includes('@')) {
      hasAccount = true;
    }

    let status = userAdminApproved ? 'active' : 'none';
    let activeInvestmentId = null;
    let pendingDepositTotal = 0;
    const pendingPayments = [];

    // Format all investments with proper values
    const formattedInvestments = userInvestments.map(inv => {
      const depAmt = parseFloat(inv.total != null ? inv.total : (inv.amount != null ? inv.amount : 0));
      let val = parseFloat(inv.total_current_value != null ? inv.total_current_value : (inv.totalCurrentValue != null ? inv.totalCurrentValue : depAmt));
      return {
        ...inv,
        total: depAmt,
        totalCurrentValue: val,
        total_current_value: val,
        status: userAdminApproved ? 'active' : (inv.status || 'active')
      };
    });

    // Check for active or approved investment first
    const activeInv = formattedInvestments.find(inv => inv.status === 'active' || inv.status === 'approved' || inv.status === 'completed');
    if (activeInv || userAdminApproved) {
      status = 'active';
      activeInvestmentId = activeInv ? activeInv.id : (formattedInvestments[0] ? formattedInvestments[0].id : ('dep_' + email.replace(/[^a-z0-9]/g, '_')));
    }

    // Check for pending or declined investments
    for (const inv of formattedInvestments) {
      if (inv.status === 'pending_approval' || inv.status === 'pending') {
        const amt = parseFloat(inv.total != null ? inv.total : (inv.amount || 0));
        if (status !== 'active') {
          pendingDepositTotal += amt;
          pendingPayments.push({
            id: inv.id,
            status: inv.status,
            planId: inv.plan_id || 'starter_ai',
            planName: inv.plan_name || inv.plan_label || 'Explorer',
            amount: amt,
            submittedAt: inv.payment_submitted_at || inv.created_at || new Date().toISOString()
          });
          status = 'pending_approval';
        }
      } else if (['declined', 'rejected', 'cancelled'].includes(inv.status) && status === 'none') {
        status = inv.status;
      }
    }

    if (status === 'active') {
      pendingPayments.length = 0;
      pendingDepositTotal = 0;
    }

    const firstValidInv = formattedInvestments.find(i => parseFloat(i.total || '0') > 0) || formattedInvestments[0];
    const activeTotal = activeInv
      ? parseFloat(activeInv.total != null ? activeInv.total : 0)
      : (firstValidInv ? parseFloat(firstValidInv.total != null ? firstValidInv.total : 0) : 0);
    let activeVal = activeInv
      ? parseFloat(activeInv.totalCurrentValue != null ? activeInv.totalCurrentValue : (activeInv.total_current_value != null ? activeInv.total_current_value : activeTotal))
      : (firstValidInv ? parseFloat(firstValidInv.totalCurrentValue != null ? firstValidInv.totalCurrentValue : firstValidInv.total) : activeTotal);

    const resolvedActiveId = activeInvestmentId || (status === 'active' ? (firstValidInv ? firstValidInv.id : 'dep_active') : null);

    return res.status(200).json({
      success: true,
      account: hasAccount,
      name: investorName,
      investmentStatus: status,
      status: status,
      id: resolvedActiveId || (pendingPayments[0] ? pendingPayments[0].id : null) || 'dep_active',
      hasActiveInvestment: status === 'active' || userAdminApproved,
      activeInvestmentId: resolvedActiveId,
      total: activeTotal,
      totalCurrentValue: activeVal,
      total_current_value: activeVal,
      bonus: 0,
      pendingDepositTotal: status === 'active' ? 0 : pendingDepositTotal,
      pendingPayments: status === 'active' ? [] : pendingPayments,
      investments: formattedInvestments
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
        const { mockStore, savePersistentInvestor } = await import('./admin.js');
        if (typeof savePersistentInvestor === 'function') {
          savePersistentInvestor({
            name,
            email,
            phone,
            onboarding_status: 'pending_deposit'
          });
        }
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
            onboarding_status: 'pending_deposit',
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
