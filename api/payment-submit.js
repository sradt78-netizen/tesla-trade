import { getDbConnection } from './dbcheck.js';
import { sendPaymentReceivedEmail, sendAdminPaymentAlert } from './mailer.js';

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
    if (buffer[start] === 45 && buffer[start + 1] === 45) break; // -- trailing end
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2; // \r\n

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
    const contentType = req.headers['content-type'] || '';

    // Only resolve immediately if req.body has actual parsed keys and is NOT multipart
    if (
      !contentType.includes('multipart/form-data') &&
      req.body &&
      typeof req.body === 'object' &&
      !Buffer.isBuffer(req.body) &&
      Object.keys(req.body).length > 0
    ) {
      return resolve({ fields: req.body, files: {} });
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

      // Default JSON or URL-encoded fallback
      const text = buffer.toString('utf8');
      try {
        const json = JSON.parse(text || '{}');
        return resolve({ fields: json, files: {} });
      } catch (e) {
        // Try urlencoded
        const urlParams = new URLSearchParams(text);
        const obj = {};
        for (const [k, v] of urlParams.entries()) {
          obj[k] = v;
        }
        return resolve({ fields: obj, files: {} });
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
      if (found) return res.status(200).json(found);
      return res.status(200).json({
        id: qId,
        status: 'pending_approval',
        total: 1000,
        totalCurrentValue: 1000,
        planName: 'Explorer',
        portfolio: [{ id: 'tsla', name: 'Tesla, Inc.', ticker: 'TSLA', investedAmount: 1000 }]
      });
    }

    if (qEmail) {
      all = all.filter(x => (x.user_email || '').toLowerCase() === qEmail);
    }
    return res.status(200).json(all);
  }

  try {
    const { fields, files } = await parseBody(req);

    const email = cleanString(fields.email || fields.userEmail || fields.userId || fields.user_email).toLowerCase();
    const amount = parseFloat(fields.amount || fields.total || '0');
    const method = fields.method || fields.paymentMethod || fields.payment_method || 'crypto';
    const ref = fields.paymentReference || fields.reference || fields.tx_id || '';
    const planId = fields.planId || fields.plan_id || 'standard';
    const planName = fields.planName || fields.plan_name || fields.portfolio || 'Investment Plan';
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

    const generatedId = 'inv_' + Math.random().toString(36).substring(2, 10);
    const generatedTxId = 'tx_' + Math.random().toString(36).substring(2, 10);
    let investmentId = generatedId;
    let dbSaved = false;

    try {
      const conn = await getDbConnection();

      // Ensure payment_proof_path can store large Data URIs without truncation
      try {
        await conn.query('ALTER TABLE investments MODIFY COLUMN payment_proof_path LONGTEXT');
      } catch (e) {}

      // Check existing pending investments for this user
      const [existingPending] = await conn.query(
        'SELECT id, total FROM investments WHERE LOWER(user_email)=? AND status="pending_approval" ORDER BY id DESC LIMIT 1',
        [email]
      );

      if (existingPending.length > 0) {
        investmentId = existingPending[0].id;
        const currentAmt = amount > 0 ? amount : parseFloat(existingPending[0].total || '0');
        await conn.query(
          'UPDATE investments SET total=?, total_current_value=?, payment_proof_path=?, payment_proof_name=?, payment_reference=?, status="pending_approval", payment_proof_uploaded_at=NOW(), payment_submitted_at=NOW() WHERE id=?',
          [currentAmt, currentAmt, proofDataUri || null, proofFileName || null, ref || null, investmentId]
        );
      } else {
        try {
          await conn.query(
            `INSERT INTO investments (
              id, tx_id, user_id, user_name, user_email, portfolio,
              total, total_current_value, method, status,
              plan_id, plan_name, projected_roi, payment_confirmed,
              payment_reference, payment_proof_path, payment_proof_name,
              payment_proof_uploaded_at, payment_submitted_at, pending_approval_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "pending_approval", ?, ?, ?, 1, ?, ?, ?, NOW(), NOW(), NOW(), NOW())`,
            [
              generatedId, generatedTxId, email, userName, email, planName,
              amount, amount, method,
              planId, planName, 50,
              ref || null, proofDataUri || null, proofFileName || null
            ]
          );
          investmentId = generatedId;
        } catch (insertErr) {
          // Fallback for older schemas with fewer columns
          await conn.query(
            'INSERT INTO investments (id, tx_id, user_id, user_name, user_email, portfolio, total, method, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "pending_approval")',
            [generatedId, generatedTxId, email, userName, email, planName, amount, method]
          );
          investmentId = generatedId;
        }
      }

      // Ensure investor account exists and reflects pending deposit
      try {
        await conn.query(
          'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, "pending_approval", NOW()) ON DUPLICATE KEY UPDATE name=COALESCE(name, VALUES(name)), onboarding_status="pending_approval"',
          [email, userName]
        );
      } catch (e) {}

      // Record in account_transactions
      try {
        await conn.query(
          'INSERT INTO account_transactions (user_email, transaction_type, amount, status, description, created_at) VALUES (?, "deposit", ?, "pending", ?, NOW())',
          [email, amount, `Investment deposit (${planName}) pending approval`]
        );
      } catch (e) {}

      await conn.end();
      dbSaved = true;
    } catch (dbErr) {
      console.warn('DB payment submit warning, using memory fallback:', dbErr.message);
    }

    const newDepositRecord = {
      id: investmentId,
      tx_id: generatedTxId,
      user_email: email,
      user_name: userName,
      portfolio: planName,
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

    // Save in memory fallback
    inMemoryDeposits.unshift(newDepositRecord);

    try {
      const { mockStore } = await import('./admin.js');
      if (mockStore && Array.isArray(mockStore.investments)) {
        mockStore.investments.unshift(newDepositRecord);
      }
      if (mockStore && Array.isArray(mockStore.investors)) {
        const existingInv = mockStore.investors.find(u => (u.email || '').toLowerCase() === email);
        if (existingInv) {
          existingInv.onboarding_status = 'pending_approval';
        } else {
          mockStore.investors.unshift({
            id: Date.now(),
            email,
            name: userName,
            onboarding_status: 'pending_approval',
            registered_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {}

    // Dispatch notification emails (async, non-blocking)
    sendPaymentReceivedEmail(email, userName, {
      amount,
      planName,
      method,
      reference: ref
    }).catch(err => console.warn('Investor payment received email error:', err.message));

    sendAdminPaymentAlert({
      userEmail: email,
      userName,
      amount,
      planName,
      method,
      reference: ref,
      investmentId
    }).catch(err => console.warn('Admin payment alert email error:', err.message));

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
