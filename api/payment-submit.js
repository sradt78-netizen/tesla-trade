import { getDbConnection } from './dbcheck.js';

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
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
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

    let investmentId = 'dep_' + Math.random().toString(36).substring(2, 9);
    let dbSaved = false;

    try {
      const conn = await getDbConnection();

      // Ensure payment_proof_path can store large Data URIs without truncation
      try {
        await conn.query('ALTER TABLE investments MODIFY COLUMN payment_proof_path LONGTEXT');
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
        const [insertRes] = await conn.query(
          'INSERT INTO investments (user_email, user_name, plan_id, plan_label, plan_name, total, total_current_value, method, payment_reference, payment_proof_path, payment_proof_name, payment_proof_uploaded_at, payment_submitted_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), "pending_approval")',
          [email, userName, planId, planName, planName, amount, amount, method, ref || null, proofDataUri || null, proofFileName || null]
        );
        investmentId = insertRes.insertId;
      }

      // Ensure investor account exists and reflects pending deposit
      try {
        await conn.query(
          'INSERT INTO investor_accounts (email, name, onboarding_status, registered_at) VALUES (?, ?, "pending_deposit", NOW()) ON DUPLICATE KEY UPDATE name=COALESCE(name, VALUES(name))',
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

    // Save in memory fallback
    inMemoryDeposits.unshift({
      id: investmentId,
      user_email: email,
      user_name: userName,
      plan_id: planId,
      plan_label: planName,
      total: amount,
      total_current_value: amount,
      method,
      payment_reference: ref,
      payment_proof_path: proofDataUri,
      payment_proof_name: proofFileName,
      status: 'pending_approval',
      created_at: new Date().toISOString()
    });

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
