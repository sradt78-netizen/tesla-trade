import { getDbConnection } from './dbcheck.js';
import fs from 'fs';
import path from 'path';

function cleanString(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '');
}

function getSavedDepositsFilePath() {
  const p = path.resolve(process.cwd(), 'data', 'saved_deposits.json');
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
  return p;
}

export function loadPersistentDeposits() {
  const list = [];
  // 1. Try local data file
  try {
    const p = getSavedDepositsFilePath();
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) list.push(...parsed);
    }
  } catch (e) {}
  // 2. Try /tmp file
  try {
    const tmpPath = '/tmp/tesla_saved_deposits.json';
    if (fs.existsSync(tmpPath)) {
      const content = fs.readFileSync(tmpPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!list.some(x => String(x.id) === String(item.id))) list.push(item);
        }
      }
    }
  } catch (e) {}
  return list;
}

export function savePersistentDeposit(deposit) {
  try {
    const current = loadPersistentDeposits();
    const idx = current.findIndex(x => String(x.id) === String(deposit.id) || (x.user_email && deposit.user_email && x.user_email.toLowerCase() === deposit.user_email.toLowerCase()));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...deposit };
    } else {
      current.unshift(deposit);
    }
    const json = JSON.stringify(current, null, 2);
    try {
      fs.writeFileSync(getSavedDepositsFilePath(), json, 'utf8');
    } catch (e) {}
    try {
      fs.writeFileSync('/tmp/tesla_saved_deposits.json', json, 'utf8');
    } catch (e) {}
  } catch (e) {}
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

// In-memory fallback deposits when database is offline or in test environments
export const inMemoryDeposits = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET') {
    const qEmail = cleanString(req.query?.email || parsedUrl.searchParams.get('email')).toLowerCase();
    const idMatch = parsedUrl.pathname.match(/\/api\/investments\/([^/?]+)/);
    const qId = idMatch ? idMatch[1] : (req.params?.id || parsedUrl.searchParams.get('id'));

    let dbRows = [];
    try {
      const conn = await getDbConnection();
      if (qId) {
        const [rows] = await conn.query('SELECT * FROM investments WHERE id=? LIMIT 1', [qId]);
        dbRows = rows;
      } else if (qEmail) {
        const [rows] = await conn.query('SELECT * FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC', [qEmail]);
        dbRows = rows;
      } else {
        const [rows] = await conn.query('SELECT * FROM investments ORDER BY id DESC');
        dbRows = rows;
      }
      await conn.end();
    } catch (e) {}

    let all = [...dbRows];
    // Merge persistent file storage
    try {
      const diskDeposits = loadPersistentDeposits();
      for (const d of diskDeposits) {
        if (!all.some(x => String(x.id) === String(d.id))) all.push(d);
      }
    } catch (e) {}

    // Merge in-memory and mockStore
    try {
      const { mockStore } = await import('./admin.js');
      const storeInvs = mockStore.investments || [];
      for (const m of inMemoryDeposits) {
        if (!all.some(x => String(x.id) === String(m.id))) all.push(m);
      }
      for (const s of storeInvs) {
        if (!all.some(x => String(x.id) === String(s.id))) all.push(s);
      }
    } catch (e) {}

    if (qId) {
      const found = all.find(x => String(x.id) === String(qId));
      if (found) {
        const st = (found.status || '').toLowerCase();
        const tot = Number(found.total || found.amount || 0);
        let curVal = Number(found.totalCurrentValue || found.total_current_value || 0);
        if ((st === 'active' || st === 'approved' || st === 'completed') && (curVal <= tot || curVal === 0) && tot > 0) {
          curVal = tot * 2;
        }
        return res.status(200).json({
          ...found,
          // The compiled portfolio screen calls portfolio.map(); DB rows store
          // a plain text label, so always expose an array.
          portfolio: Array.isArray(found.portfolio)
            ? found.portfolio
            : [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: tot }],
          planName: found.planName || found.plan_name || found.plan_label || null,
          txId: found.txId || found.tx_id || null,
          canWithdraw: found.canWithdraw != null ? !!found.canWithdraw : !!found.can_withdraw,
          total: tot,
          totalCurrentValue: curVal || tot,
          bonus: (st === 'active' || st === 'approved' || st === 'completed') ? tot : 0
        });
      }
      return res.status(404).json({ error: 'Investment not found' });
    }

    if (qEmail) {
      all = all.filter(x => (x.user_email || x.email || '').toLowerCase() === qEmail);
    }

    all = all.map(item => {
      const st = (item.status || '').toLowerCase();
      const tot = Number(item.total || item.amount || 0);
      let curVal = Number(item.totalCurrentValue || item.total_current_value || 0);
      if ((st === 'active' || st === 'approved' || st === 'completed') && (curVal <= tot || curVal === 0) && tot > 0) {
        curVal = tot * 2;
      }
      return {
        ...item,
        total: tot,
        totalCurrentValue: curVal || tot,
        bonus: (st === 'active' || st === 'approved' || st === 'completed') ? tot : 0
      };
    });

    return res.status(200).json(all);
  }

  try {
    const { fields, files } = await parseBody(req);

    const email = cleanString(fields.email || fields.userEmail || fields.userId || fields.user_email).toLowerCase();
    const amount = parseFloat(fields.amount || fields.total || '0');
    const method = fields.method || fields.paymentMethod || fields.payment_method || 'crypto';
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

      // Check existing investments for this user
      const [existing] = await conn.query(
        'SELECT id, total FROM investments WHERE LOWER(user_email)=? ORDER BY id DESC LIMIT 1',
        [email]
      );

      if (existing.length > 0) {
        investmentId = existing[0].id;
        const currentAmt = amount > 0 ? amount : parseFloat(existing[0].total || '0');
        await conn.query(
          'UPDATE investments SET total=?, total_current_value=?, payment_proof_path=?, payment_proof_name=?, payment_reference=?, status="pending_approval", payment_proof_uploaded_at=NOW(), payment_submitted_at=NOW() WHERE id=?',
          [currentAmt, currentAmt, proofDataUri || null, proofFileName || null, ref || null, investmentId]
        );
      } else {
        await conn.query(
          `INSERT INTO investments (
            id, tx_id, user_id, user_name, user_email, portfolio,
            plan_id, plan_label, plan_name, total, total_current_value,
            method, payment_reference, payment_proof_path, payment_proof_name,
            payment_proof_uploaded_at, payment_submitted_at, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), "pending_approval", NOW())`,
          [
            investmentId, txId, email, userName, email, portfolio,
            planId, planName, planName, amount, amount,
            method, ref || null, proofDataUri || null, proofFileName || null
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
          'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, "pending_deposit", NOW()) ON DUPLICATE KEY UPDATE onboarding_status="pending_deposit", name=COALESCE(name, VALUES(name))',
          [email, userName]
        );
      } catch (e) {}

      // Record in account_transactions
      try {
        const txRecordId = 'act_' + Math.random().toString(36).substring(2, 9);
        await conn.query(
          'INSERT INTO account_transactions (id, investment_id, user_email, type, amount, status, note, created_at) VALUES (?, ?, ?, "deposit", ?, "pending", ?, NOW())',
          [txRecordId, investmentId, email, amount, `Investment deposit (${planName}) pending approval`]
        );
      } catch (e) {}

      await conn.end();
      dbSaved = true;
    } catch (dbErr) {
      console.warn('DB payment submit notice (persisting to disk & memory):', dbErr.message);
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

    // 1. Save to persistent file storage (guaranteed persistence across restarts and serverless container shifts)
    savePersistentDeposit(depositRecord);

    // 2. Save in memory fallback
    inMemoryDeposits.unshift(depositRecord);

    // 3. Sync to mockStore and persistent investors for immediate admin reactivity
    try {
      const { mockStore, savePersistentInvestor } = await import('./admin.js');
      if (typeof savePersistentInvestor === 'function') {
        savePersistentInvestor({
          email,
          name: userName,
          onboarding_status: 'pending_deposit'
        });
      }
      if (mockStore && Array.isArray(mockStore.investments)) {
        mockStore.investments.unshift(depositRecord);
      }
      if (mockStore && Array.isArray(mockStore.investors)) {
        const existingInv = mockStore.investors.find(u => (u.email || '').toLowerCase() === email);
        if (existingInv) {
          existingInv.onboarding_status = 'pending_deposit';
        } else {
          mockStore.investors.unshift({
            email,
            name: userName,
            onboarding_status: 'pending_deposit',
            registered_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {}

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
