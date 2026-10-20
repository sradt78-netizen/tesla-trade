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
    if (!email) return res.status(200).json({ status: 'none' });

    try {
      const conn = await getDbConnection();
      const [activeRows] = await conn.query(
        "SELECT id, status FROM investments WHERE LOWER(user_email)=? AND status='active' LIMIT 1",
        [email]
      );
      if (activeRows.length > 0) {
        await conn.end();
        return res.status(200).json({ status: 'active', id: activeRows[0].id });
      }

      const [invRows] = await conn.query(
        'SELECT id, status FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC LIMIT 1',
        [email]
      );
      await conn.end();

      if (invRows.length > 0) {
        return res.status(200).json({ status: invRows[0].status, id: invRows[0].id });
      }
      return res.status(200).json({ status: 'none' });
    } catch (e) {
      // Memory fallback for mock/dev environment
      try {
        const { inMemoryDeposits } = await import('./payment-submit.js');
        const mem = inMemoryDeposits.find(d => d.user_email && d.user_email.toLowerCase() === email);
        if (mem) return res.status(200).json({ status: mem.status || 'pending_approval', id: mem.id });

        const { mockStore } = await import('./admin.js');
        const mInv = mockStore.investments.find(d => d.user_email && d.user_email.toLowerCase() === email);
        if (mInv) return res.status(200).json({ status: mInv.status || 'active', id: mInv.id });
      } catch (memErr) {}
      return res.status(200).json({ status: 'none' });
    }
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
