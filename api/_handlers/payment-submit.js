import { getDbConnection } from './dbcheck.js';

// Compatibility exports for older admin modules. Serverless file/memory stores are intentionally disabled.
export const inMemoryDeposits = [];
export function loadPersistentDeposits() { return []; }
export function savePersistentDeposit() { return false; }

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function parseMultipart(buffer, boundary) {
  const result = { fields: {}, files: {} };
  const boundaryBuffer = Buffer.from('--' + boundary);
  let start = 0;

  while ((start = buffer.indexOf(boundaryBuffer, start)) !== -1) {
    start += boundaryBuffer.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;

    const headerText = buffer.slice(start, headerEnd).toString('utf8');
    const nextBoundary = buffer.indexOf(boundaryBuffer, headerEnd + 4);
    if (nextBoundary === -1) break;

    let dataEnd = nextBoundary;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;

    const content = buffer.slice(headerEnd + 4, dataEnd);
    const nameMatch = headerText.match(/name="([^"]+)"/);
    const filenameMatch = headerText.match(/filename="([^"]+)"/);
    const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

    if (nameMatch) {
      const name = nameMatch[1];
      if (filenameMatch) {
        result.files[name] = {
          filename: filenameMatch[1],
          contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
          data: content
        };
      } else {
        result.fields[name] = content.toString('utf8');
      }
    }
    start = nextBoundary;
  }
  return result;
}

function parseBody(req) {
  return new Promise((resolve) => {
    const multerFiles = {};
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const f of req.files) {
        multerFiles[f.fieldname] = {
          filename: f.originalname,
          contentType: f.mimetype,
          data: f.buffer
        };
      }
    } else if (req.files && typeof req.files === 'object' && !Buffer.isBuffer(req.files)) {
      Object.assign(multerFiles, req.files);
    }

    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && Object.keys(req.body).length > 0) {
      return resolve({ fields: req.body, files: multerFiles });
    }

    if (Object.keys(multerFiles).length > 0) {
      return resolve({ fields: req.body || {}, files: multerFiles });
    }

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('multipart/form-data')) {
        const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
        if (boundaryMatch) {
          const boundary = boundaryMatch[1].replace(/^["']|["']$/g, '');
          try {
            return resolve(parseMultipart(buffer, boundary));
          } catch (e) {
            console.error('Multipart parse error:', e);
          }
        }
      }

      const text = buffer.toString('utf8');
      try {
        const json = JSON.parse(text || '{}');
        return resolve({ fields: json, files: multerFiles });
      } catch (e) {
        const urlParams = new URLSearchParams(text);
        const obj = {};
        for (const [k, v] of urlParams.entries()) {
          obj[k] = v;
        }
        return resolve({ fields: obj, files: multerFiles });
      }
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

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET') {
    const qEmail = cleanString(req.query?.email || parsedUrl.searchParams.get('email')).toLowerCase();
    const idMatch = parsedUrl.pathname.match(/\/api\/investments\/([^/?]+)/);
    const qId = idMatch ? idMatch[1] : (req.params?.id || parsedUrl.searchParams.get('id'));
    const cleanQId = qId ? String(qId).replace(/^dep_/, '').trim() : '';
    const depQId = cleanQId ? ('dep_' + cleanQId) : '';

    let dbRows = [];
    let dbRead = false;
    let bonusByInvestment = Object.create(null);
    try {
      const conn = await getDbConnection();
      if (qId) {
        const [rows] = await conn.query('SELECT * FROM investments WHERE id=? OR id=? OR id=? LIMIT 1', [qId, cleanQId, depQId]);
        dbRows = rows;
      } else if (qEmail) {
        const [rows] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC', [qEmail]);
        dbRows = rows;
      } else {
        const [rows] = await conn.query('SELECT * FROM investments ORDER BY id DESC');
        dbRows = rows;
      }
      const checkEmail = qEmail || (dbRows[0] && (dbRows[0].user_email || dbRows[0].email));
      if (checkEmail) {
        const [bonusRows] = await conn.query(
          "SELECT investment_id, COALESCE(SUM(amount), 0) AS bonus FROM account_transactions WHERE LOWER(user_email)=? AND type='bonus' AND status='processed' GROUP BY investment_id",
          [checkEmail.toLowerCase()]
        );
        for (const bonusRow of bonusRows) bonusByInvestment[String(bonusRow.investment_id)] = Number(bonusRow.bonus || 0);
      }
      dbRead = true;
      await conn.end();
    } catch (e) {}

    if (!dbRead) {
      return res.status(503).json({ success: false, error: 'Investment status is unavailable from the database. Please retry.' });
    }

    let all = Array.isArray(dbRows) ? [...dbRows] : [];

    if (qId) {
      let found = all.find(x => {
        const xId = String(x.id || '').trim();
        const xClean = xId.replace(/^dep_/, '');
        return xId === String(qId) || xId === cleanQId || xId === depQId || xClean === cleanQId;
      });
      if (!found && (qEmail || String(qId).includes('@'))) {
        const targetEm = (qEmail || String(qId).replace(/^dep_/, '')).toLowerCase().trim();
        found = all.find(x => (x.user_email || x.email || x.user_id || '').toLowerCase().trim() === targetEm && (x.status === 'active' || x.status === 'approved'))
             || all.find(x => (x.user_email || x.email || x.user_id || '').toLowerCase().trim() === targetEm);
      }
      if (!found && cleanQId) {
        found = all.find(x => (x.tx_id && String(x.tx_id).toLowerCase() === cleanQId.toLowerCase()) || (x.payment_reference && String(x.payment_reference).toLowerCase() === cleanQId.toLowerCase()));
      }
      if (!found && cleanQId) {
        found = all.find(x => {
          const xId = String(x.id || '').toLowerCase();
          return (xId.length > 4 && cleanQId.includes(xId)) || (cleanQId.length > 4 && xId.includes(cleanQId));
        });
      }
      if (!found && qEmail) {
        found = all.find(x => (x.user_email || x.email || '').toLowerCase().trim() === qEmail);
      }

      if (!found) {
        return res.status(200).json({
          id: String(qId || 'dep_none'),
          status: 'none',
          total: 0,
          totalCurrentValue: 0,
          bonus: 0,
          planName: 'Explorer'
        });
      }

      const isApproved = found.status === 'active' || found.status === 'approved';
      const tot = Number(found.total != null ? found.total : (found.amount != null ? found.amount : 0));
      let curVal = Number(found.totalCurrentValue || found.total_current_value || tot);
      if (curVal === 0 && tot > 0) curVal = tot;
      const bonusMatch = Number(bonusByInvestment[String(found.id)] || found.bonus || found.bonus_balance || 0);

      return res.status(200).json({
        ...found,
        status: isApproved ? 'active' : (found.status || 'pending_approval'),
        portfolio: Array.isArray(found.portfolio) && found.portfolio.length > 0
          ? found.portfolio
          : [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: tot }],
        planName: found.planName || found.plan_name || found.plan_label || 'Explorer',
        txId: found.txId || found.tx_id || ('TX' + Date.now().toString(36).toUpperCase()),
        canWithdraw: isApproved,
        total: tot,
        totalCurrentValue: curVal,
        total_current_value: curVal,
        bonus: bonusMatch,
        earnings: {
          tsla: curVal,
          ...(typeof found.earnings === 'object' && found.earnings ? found.earnings : {})
        }
      });
    }

    if (qEmail) {
      all = all.filter(x => (x.user_email || x.email || '').toLowerCase() === qEmail);
    }

    all = all.map(item => {
      const st = (item.status || 'pending_approval').toLowerCase();
      const tot = Number(item.total != null ? item.total : (item.amount != null ? item.amount : 0));
      let curVal = Number(item.totalCurrentValue || item.total_current_value || tot);
      if (curVal === 0 && tot > 0) curVal = tot;
      return {
        ...item,
        status: (st === 'approved') ? 'active' : st,
        portfolio: Array.isArray(item.portfolio) && item.portfolio.length > 0
          ? item.portfolio
          : [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: tot }],
        planName: item.planName || item.plan_name || item.plan_label || 'Pioneer',
        canWithdraw: st === 'active' || st === 'approved',
        total: tot,
        totalCurrentValue: curVal,
        total_current_value: curVal,
        bonus: Number(bonusByInvestment[String(item.id)] || item.bonus || item.bonus_balance || 0),
        earnings: {
          tsla: curVal,
          ...(typeof item.earnings === 'object' && item.earnings ? item.earnings : {})
        }
      };
    });

    return res.status(200).json(all);
  }

  try {
    const { fields, files } = await parseBody(req);

    const email = cleanString(fields.email || fields.userEmail || fields.userId || fields.user_email).toLowerCase();
    const amount = parseFloat(fields.amount || fields.total || '0');
    const rawMethod = String(fields.method || fields.paymentMethod || fields.payment_method || 'crypto').trim().toLowerCase().replace(/[ -]+/g, '_');
    const methodAliases = { crypto: 'crypto', usdt: 'usdt', usdt_trc20: 'usdt', eth: 'eth', ethereum: 'eth', btc: 'btc', bitcoin: 'btc', bank: 'bank', bank_transfer: 'bank' };
    const method = methodAliases[rawMethod];
    if (!method) return res.status(400).json({ success: false, error: 'Only cryptocurrency or bank transfer payments are accepted.' });
    const ref = fields.paymentReference || fields.reference || fields.tx_id || '';
    const planId = fields.planId || fields.plan_id || 'standard';
    const planName = fields.planName || fields.plan_name || fields.portfolio || 'Explorer';
    const userName = fields.userName || fields.name || 'Investor';

    // Extract receipt file or string
    let proofDataUri = '';
    let proofFileName = '';

    const uploadedFile = files.paymentProof || files.proof || files.receipt;
    if (uploadedFile && uploadedFile.data && uploadedFile.data.length > 0) {
      proofFileName = uploadedFile.filename || 'payment-receipt.jpg';
      const mime = uploadedFile.contentType || 'image/jpeg';
      proofDataUri = `data:${mime};base64,${uploadedFile.data.toString('base64')}`;
    } else if (fields.paymentProof || fields.paymentProofPath || fields.proof) {
      proofDataUri = cleanString(fields.paymentProof || fields.paymentProofPath || fields.proof);
      proofFileName = fields.paymentProofName || 'payment-receipt.jpg';
    }

    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Enter a valid deposit amount.' });

    if (!email) {
      return res.status(400).json({ success: false, error: 'User email is required' });
    }

    let investmentId = 'dep_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const txId = 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
    const portfolio = (userName || 'Tesla') + ' · ' + planName;
    let dbSaved = false;

    try {
      const conn = await getDbConnection();

      // Ensure table exists with complete schema matching original DB
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS investments (
            id VARCHAR(64) PRIMARY KEY,
            tx_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            user_name VARCHAR(255) NOT NULL,
            user_email VARCHAR(255) NOT NULL,
            portfolio VARCHAR(255) NOT NULL,
            plan_id VARCHAR(50) DEFAULT NULL,
            plan_label VARCHAR(100) DEFAULT NULL,
            plan_name VARCHAR(100) DEFAULT NULL,
            total DECIMAL(15,2) NOT NULL DEFAULT 0,
            total_current_value DECIMAL(15,2) DEFAULT 0,
            method VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending_approval',
            payment_reference VARCHAR(255) DEFAULT NULL,
            payment_proof_path LONGTEXT DEFAULT NULL,
            payment_proof_name VARCHAR(255) DEFAULT NULL,
            payment_proof_uploaded_at DATETIME DEFAULT NULL,
            payment_submitted_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_investments_email (user_email)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      } catch (e) {}
      try { const { ensureTradingColumns } = await import('../db.js'); if (!globalThis.__ttCols) { globalThis.__ttCols = true; await ensureTradingColumns(); } } catch (e) {}

      // Check existing investments for this user
      const [existing] = await conn.query(
        'SELECT id, total, status FROM investments WHERE LOWER(user_email)=? ORDER BY created_at DESC LIMIT 1',
        [email]
      );

      if (existing.length > 0 && ['active', 'approved', 'completed'].includes(String(existing[0].status || '').toLowerCase())) {
        // An approved account is immutable through receipt resubmission. A new
        // deposit must be a separate record; never reset the active wallet to pending.
        await conn.end();
        return res.status(409).json({
          success: false,
          code: 'ACCOUNT_ALREADY_APPROVED',
          error: 'This account already has an approved investment. Please contact support to submit an additional deposit.'
        });
      }

      if (existing.length > 0) {
        investmentId = existing[0].id;
        const currentAmt = amount > 0 ? amount : parseFloat(existing[0].total || '0');
        await conn.query(
          'UPDATE investments SET total=?, total_current_value=?, payment_proof_path=?, payment_proof_name=?, payment_reference=?, status=?, payment_proof_uploaded_at=NOW(), payment_submitted_at=NOW() WHERE id=? AND LOWER(user_email)=? AND status NOT IN (?, ?, ?)',
          [currentAmt, currentAmt, proofDataUri || null, proofFileName || null, ref || null, 'pending_approval', investmentId, email, 'active', 'approved', 'completed']
        );
      } else {
        await conn.query(
          `INSERT INTO investments (
            id, tx_id, user_id, user_name, user_email, portfolio,
            plan_id, plan_label, plan_name, total, total_current_value,
            method, payment_reference, payment_proof_path, payment_proof_name,
            payment_proof_uploaded_at, payment_submitted_at, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, NOW())`,
          [
            investmentId, txId, email, userName, email, portfolio,
            planId, planName, planName, amount, amount,
            method, ref || null, proofDataUri || null, proofFileName || null,
            'pending_approval'
          ]
        );
      }

      // Ensure investor account exists and reflects pending deposit
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS investor_accounts (
            email VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            onboarding_status VARCHAR(50) NOT NULL DEFAULT 'pending_deposit',
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await conn.query(
          'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE onboarding_status=VALUES(onboarding_status), name=COALESCE(name, VALUES(name))',
          [email, userName, 'pending_deposit']
        );
      } catch (e) {}

      // Record in account_transactions
      try {
        const txRecordId = 'act_' + Math.random().toString(36).substring(2, 9);
        await conn.query(
          'INSERT INTO account_transactions (user_email, transaction_type, amount, status, description, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
          [email, 'deposit', amount, 'pending', `Investment deposit (${planName}) pending approval`]
        );
      } catch (e) {}

      await conn.end();
      dbSaved = true;
    } catch (dbErr) {
      console.error('DB payment submit failed:', dbErr.message);
    }

    if (!dbSaved) {
      return res.status(503).json({
        success: false,
        error: 'Payment receipt could not be saved to the investor database. Please retry; no pending or approved balance was created.'
      });
    }

    const depositRecord = {
      id: investmentId,
      tx_id: txId,
      user_id: email,
      user_email: email,
      user_name: userName,
      portfolio,
      plan_id: planId,
      plan_label: planName,
      plan_name: planName,
      total: amount,
      total_current_value: amount,
      method,
      payment_reference: ref,
      payment_proof_path: proofDataUri,
      payment_proof_name: proofFileName,
      status: 'pending_approval',
      created_at: new Date().toISOString()
    };

    // MySQL is the sole source of truth. Never acknowledge a deposit from local or in-memory state.
    try {
      const [{ notifyPaymentSubmission }] = await Promise.all([import('../telegram.js')]);
      const { sendPaymentReceivedEmail } = await import('../mailer.js');
      const alerts = await Promise.allSettled([
        notifyPaymentSubmission(depositRecord),
        sendPaymentReceivedEmail(email, userName, { amount, planName, method, reference: ref })
      ]);
      for (const result of alerts) {
        if (result.status === 'rejected') console.error('[payment-submit] notification failed:', result.reason?.message || result.reason);
        else if (result.value && result.value.ok === false) console.error('[payment-submit] notification not delivered:', result.value.error);
      }
    } catch (notifyError) {
      console.error('[payment-submit] notification dispatch failed:', notifyError.message);
    }

    return res.status(200).json({
      success: true,
      id: investmentId,
      status: 'pending_approval',
      dashboardInvestmentId: investmentId,
      message: 'Deposit receipt submitted successfully. Pending admin approval.'
    });

  } catch (err) {
    console.error('Payment submit error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
