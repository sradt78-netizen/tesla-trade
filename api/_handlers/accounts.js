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
    let bonusBalance = 0;

    let userAdminApproved = false;

    // 1. Try MySQL Database
    try {
      const conn = await getDbConnection();
      const [accRows] = await conn.query('SELECT name, email, onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
      if (accRows.length > 0) {
        hasAccount = true;
        investorName = accRows[0].name || investorName;
      }

      // Check MySQL investments
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
      const [bonusRows] = await conn.query(
        "SELECT COALESCE(SUM(amount), 0) AS bonus FROM account_transactions WHERE LOWER(user_email)=? AND type='bonus' AND status='processed'",
        [email]
      );
      bonusBalance = Number(bonusRows[0]?.bonus || 0);
      dbRead = true;
      await conn.end();
    } catch (dbErr) {
      console.error('[account-status] authoritative MySQL lookup failed:', dbErr.message);
    }
    if (!dbRead) {
      return res.status(503).json({ success: false, error: 'Investor approval status is temporarily unavailable. No cached approval was used.' });
    }

    // 2. MySQL is the sole source of truth; fallback records cannot grant approval.
    if (!dbRead) try {
      const { inMemoryDeposits, loadPersistentDeposits } = await import('./payment-submit.js');
      if (typeof loadPersistentDeposits === 'function') {
        const diskDeposits = loadPersistentDeposits();
        const userDisk = diskDeposits.filter(d => (d.user_email || d.email || d.user_id || '').toLowerCase().trim() === email);
        for (const dd of userDisk) {
          hasAccount = true;
          const exIdx = userInvestments.findIndex(inv => String(inv.id) === String(dd.id));
          if (exIdx >= 0) {
            const isApproved = dd.status === 'active' || dd.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved';
            userInvestments[exIdx] = {
              ...userInvestments[exIdx],
              ...dd,
              status: isApproved ? 'active' : (dd.status || userInvestments[exIdx].status || 'pending_approval')
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
            const isApproved = md.status === 'active' || md.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved';
            userInvestments[exIdx] = {
              ...userInvestments[exIdx],
              ...md,
              status: isApproved ? 'active' : (md.status || userInvestments[exIdx].status || 'pending_approval')
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
        }
      }
      const mockUser = mockStore.investors.find(u => (u.email || '').toLowerCase().trim() === email);
      if (mockUser) {
        hasAccount = true;
        if (mockUser.name) investorName = mockUser.name;
      }
      const mockInvs = mockStore.investments.filter(i => (i.user_email || i.email || i.user_id || '').toLowerCase().trim() === email);
      for (const mi of mockInvs) {
        hasAccount = true;
        const exIdx = userInvestments.findIndex(inv => String(inv.id) === String(mi.id));
        if (exIdx >= 0) {
          const isApproved = mi.status === 'active' || mi.status === 'approved' || userInvestments[exIdx].status === 'active' || userInvestments[exIdx].status === 'approved';
          userInvestments[exIdx] = {
            ...userInvestments[exIdx],
            ...mi,
            status: isApproved ? 'active' : (mi.status || userInvestments[exIdx].status || 'pending_approval')
          };
        } else {
          userInvestments.unshift(mi);
        }
      }
    } catch (eMem) {}

    // If an email was provided, treat as existing account session
    if (!hasAccount && email.includes('@')) {
      hasAccount = true;
    }

    // Format all investments with proper values
    const formattedInvestments = userInvestments.map(inv => {
      const depAmt = parseFloat(inv.total != null ? inv.total : (inv.amount != null ? inv.amount : 0));
      let val = parseFloat(inv.total_current_value != null ? inv.total_current_value : (inv.totalCurrentValue != null ? inv.totalCurrentValue : depAmt));
      const isApproved = inv.status === 'active' || inv.status === 'approved' || inv.status === 'completed';
      return {
        ...inv,
        total: depAmt,
        totalCurrentValue: val,
        total_current_value: val,
        status: isApproved ? 'active' : (inv.status || 'pending_approval')
      };
    });

    // Check for active or approved investment first
    const activeInv = formattedInvestments.find(inv => inv.status === 'active' || inv.status === 'approved' || inv.status === 'completed');
    let status = 'none';
    let activeInvestmentId = null;
    let pendingDepositTotal = 0;
    const pendingPayments = [];

    if (activeInv) {
      status = 'active';
      activeInvestmentId = activeInv.id;
    }

    // Check for pending or declined investments
    for (const inv of formattedInvestments) {
      if (inv.status === 'pending_approval' || inv.status === 'pending') {
        const amt = parseFloat(inv.total != null ? inv.total : (inv.amount || 0));
        if (status !== 'active') {
          pendingDepositTotal += amt;
          pendingPayments.push({
            id: inv.id,
            status: 'pending_approval',
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
      : (status === 'active' && firstValidInv ? parseFloat(firstValidInv.total != null ? firstValidInv.total : 0) : 0);
    let activeVal = activeInv
      ? parseFloat(activeInv.totalCurrentValue != null ? activeInv.totalCurrentValue : (activeInv.total_current_value != null ? activeInv.total_current_value : activeTotal))
      : (status === 'active' && firstValidInv ? parseFloat(firstValidInv.totalCurrentValue != null ? firstValidInv.totalCurrentValue : firstValidInv.total) : activeTotal);

    const resolvedActiveId = status === 'active' ? (activeInvestmentId || (firstValidInv ? firstValidInv.id : null)) : null;

    return res.status(200).json({
      success: true,
      account: hasAccount,
      name: investorName,
      investmentStatus: status,
      status: status,
      id: resolvedActiveId || (pendingPayments[0] ? pendingPayments[0].id : null),
      hasActiveInvestment: status === 'active',
      activeInvestmentId: resolvedActiveId,
      total: activeTotal,
      totalCurrentValue: activeVal,
      total_current_value: activeVal,
      bonus: bonusBalance,
      pendingDepositTotal: status === 'active' ? 0 : pendingDepositTotal,
      pendingPayments: status === 'active' ? [] : pendingPayments,
      investments: formattedInvestments
    });
  }

  // ── 2. GET /api/transactions ─────────────────────────────────────
  if (pathname === '/transactions') {
    if (!email) return res.status(200).json([]);
    let results = [];
    try {
      const conn = await getDbConnection();
      let txs = [];
      try {
        const [rows] = await conn.query(
          'SELECT * FROM account_transactions WHERE LOWER(user_email)=? ORDER BY created_at DESC, id DESC LIMIT 250',
          [email]
        );
        txs = rows;
      } catch (ledgerReadError) {
        console.error('[transactions] ledger lookup failed; checking persisted investment records:', ledgerReadError.message);
      }
      results = Array.isArray(txs) ? txs : [];

      // Older accounts may have funded investment/withdrawal rows created
      // before the durable ledger write was available. Include those records
      // when the corresponding ledger entry is absent; never invent amounts.
      try {
        const [legacyInvestments] = await conn.query(
          'SELECT id, tx_id, user_email, total, method, status, created_at, payment_submitted_at FROM investments WHERE LOWER(user_email)=? AND total>0 ORDER BY created_at DESC',
          [email]
        );
        for (const inv of legacyInvestments || []) {
          const investmentStatus = String(inv.status || '').toLowerCase();
          const ledgerStatus = ['active','approved','completed'].includes(investmentStatus) ? 'processed' :
            (['declined','rejected','cancelled'].includes(investmentStatus) ? 'declined' : 'pending');
          const existingDeposit = results.find(tx =>
            tx.type === 'deposit' && String(tx.investment_id || '') === String(inv.id)
          );
          if (existingDeposit) {
            // The investment approval state is authoritative if an older
            // payment endpoint left its ledger row marked pending.
            existingDeposit.status = ledgerStatus;
            if (Number(existingDeposit.amount || 0) <= 0) existingDeposit.amount = Number(inv.total || 0);
            if (!existingDeposit.method) existingDeposit.method = inv.method || '';
          } else {
            results.push({
              id: inv.tx_id || ('legacy-deposit-' + inv.id),
              investment_id: inv.id,
              user_email: email,
              type: 'deposit',
              amount: Number(inv.total || 0),
              method: inv.method || '',
              status: ledgerStatus,
              reference_id: inv.tx_id || null,
              note: 'Investment deposit',
              created_at: inv.payment_submitted_at || inv.created_at
            });
          }
        }
      } catch (legacyDepositError) {
        console.error('[transactions] legacy deposit lookup failed:', legacyDepositError.message);
      }

      try {
        const [legacyWithdrawals] = await conn.query(
          'SELECT w.id, w.investment_id, w.amount, w.method, w.status, w.created_at FROM withdrawals w LEFT JOIN investments i ON i.id=w.investment_id WHERE LOWER(i.user_email)=? ORDER BY w.created_at DESC',
          [email]
        );
        for (const wd of legacyWithdrawals || []) {
          const exists = results.some(tx => tx.type === 'withdrawal' && String(tx.id || '') === String(wd.id));
          if (!exists) results.push({
            id: wd.id,
            investment_id: wd.investment_id,
            user_email: email,
            type: 'withdrawal',
            amount: Number(wd.amount || 0),
            method: wd.method || '',
            status: wd.status || 'pending',
            note: 'Withdrawal request',
            created_at: wd.created_at
          });
        }
      } catch (legacyWithdrawalError) {
        console.error('[transactions] legacy withdrawal lookup failed:', legacyWithdrawalError.message);
      }
      await conn.end();
    } catch (e) {
      console.error('[transactions] database connection failed:', e.message);
      return res.status(503).json({ error: 'Transaction history is temporarily unavailable. Your records have not been marked as empty.' });
    }

    results.sort((a, b) => {
      const aTime = new Date(a.created_at || a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.created_at || b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });

    // Format fields consistently for frontend
    const formatted = results.map(t => ({
      id: t.id || ('tx_' + Math.random().toString(36).substring(2, 9)),
      type: t.type || 'transaction',
      amount: parseFloat(t.amount || '0'),
      status: t.status || 'processed',
      note: t.note || '',
      method: t.method || '',
      investment_id: t.investment_id || '',
      reference_id: t.reference_id || '',
      created_at: t.created_at || new Date().toISOString(),
      createdAt: t.created_at || new Date().toISOString()
    }));

    return res.status(200).json(formatted);
  }

  // ── 3. /api/accounts OR /api/profile ─────────────────────────────
  if (pathname === '/accounts' || pathname === '/profile') {
    // GET: Read account
    if (req.method === 'GET') {
      if (!email) return res.status(400).json({ error: 'Email parameter required' });
      try {
        const conn = await getDbConnection();
        const [acc] = await conn.query('SELECT email, name, phone, age, onboarding_status, registered_at FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
        const [inv] = await conn.query(`SELECT * FROM investments WHERE LOWER(user_email)=? ORDER BY CASE WHEN status IN ('active','approved','completed') THEN 0 WHEN status IN ('pending_approval','pending') THEN 1 ELSE 2 END, id DESC LIMIT 1`, [email]);
        await conn.end();

        return res.status(200).json({
          email,
          name: acc[0]?.name || inv[0]?.user_name || 'Investor',
          phone: acc[0]?.phone || '',
          age: Number(acc[0]?.age || 0),
          registered_at: acc[0]?.registered_at || null,
          onboarding_status: (inv[0] && ['active','approved','completed'].includes(String(inv[0].status || '').toLowerCase())) ? 'active' :
            (inv[0] && ['pending','pending_approval'].includes(String(inv[0].status || '').toLowerCase())) ? 'pending_approval' :
            (['active','approved','verified','completed'].includes(String(acc[0]?.onboarding_status || '').toLowerCase()) ? 'plan_selection' : (acc[0]?.onboarding_status || (inv[0] ? inv[0].status : 'pending_deposit'))),
          investment: inv[0] || null
        });
      } catch (e) {
        console.error('[accounts] profile lookup failed:', e.message);
        return res.status(503).json({ error: 'Your saved investor profile is temporarily unavailable. Please retry; do not create another account.' });
      }
    }

    // POST: Create or Update account
    if (req.method === 'POST') {
      const name = cleanString(body.name || email);
      const phone = cleanString(body.phone || '');
      const age = parseInt(body.age || '0', 10);

      let persistedStatus = 'plan_selection';
      try {
        const conn = await getDbConnection();
        await conn.query(
          `INSERT INTO investor_accounts (email, name, phone, age, onboarding_status, registered_at)
           VALUES (?, ?, ?, ?, 'plan_selection', NOW())
           ON DUPLICATE KEY UPDATE name=VALUES(name),
             phone=IF(VALUES(phone)='', phone, VALUES(phone)),
             age=IF(VALUES(age)=0, age, VALUES(age)),
             onboarding_status=IF(onboarding_status IN ('active','approved','completed','pending_approval','pending_deposit'), onboarding_status, VALUES(onboarding_status)),
             updated_at=NOW()`,
          [email, name, phone, age]
        );
        const [saved] = await conn.query('SELECT onboarding_status FROM investor_accounts WHERE LOWER(email)=? LIMIT 1', [email]);
        const [approvedRows] = await conn.query("SELECT status FROM investments WHERE LOWER(user_email)=? ORDER BY created_at DESC", [email]);
        const investmentStates = approvedRows.map(row => String(row.status || '').toLowerCase());
        if (investmentStates.some(value => ['active','approved','completed'].includes(value))) {
          persistedStatus = 'active';
        } else if (investmentStates.some(value => ['pending','pending_approval'].includes(value))) {
          persistedStatus = 'pending_approval';
        } else {
          const stored = String(saved[0]?.onboarding_status || persistedStatus).toLowerCase();
          persistedStatus = ['active','approved','verified','completed'].includes(stored) ? 'plan_selection' : (stored || 'plan_selection');
        }
        await conn.end();
      } catch (e) {
        console.error('[accounts] profile save failed:', e.message);
        return res.status(503).json({ success: false, error: 'Your investor profile could not be saved. Please retry before choosing an investment plan.' });
      }

      return res.status(200).json({
        success: true,
        status: persistedStatus,
        email,
        name,
        phone,
        age: Number.isFinite(age) ? age : 0
      });
    }
  }

  return res.status(200).json({ success: true, email });
}
