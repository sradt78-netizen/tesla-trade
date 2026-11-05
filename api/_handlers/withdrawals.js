import crypto from 'crypto';
import { getDbConnection } from './dbcheck.js';
import { getInvestorSession } from '../session.js';
import { sendWithdrawalStatusEmail } from '../mailer.js';
import { notifyAdminEvent } from '../telegram.js';

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function normalizeMethod(value) {
  const key = String(value || '').trim().toLowerCase();
  return ['usdt', 'eth', 'btc', 'bank'].includes(key) ? key : '';
}

function methodLabel(method) {
  return ({ usdt: 'USDT (TRC-20)', eth: 'Ethereum (ERC-20)', btc: 'Bitcoin (BTC)', bank: 'Bank Transfer' })[method] || method;
}

function safeLogFailure(label, result) {
  if (result.status === 'rejected' || result.value?.ok === false) {
    console.warn(label, result.reason || result.value?.error);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST to submit a withdrawal request.' });

  const session = getInvestorSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Your secure investor session has expired. Sign in again to request a withdrawal.' });
  }

  const body = await parseBody(req);
  const amount = Number(body.amount);
  const method = normalizeMethod(body.method);
  const destination = String(body.walletAddress || body.destination || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Enter a withdrawal amount greater than zero.' });
  }
  if (!method) {
    return res.status(400).json({ success: false, error: 'Choose USDT, Ethereum, Bitcoin or Bank Transfer.' });
  }
  if (!destination || destination.length > 255) {
    return res.status(400).json({ success: false, error: 'Enter valid receiving wallet or bank details (up to 255 characters).' });
  }

  let conn;
  let transactionStarted = false;
  let withdrawal;
  try {
    conn = await getDbConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id VARCHAR(36) PRIMARY KEY,
        investment_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        method VARCHAR(50) NOT NULL,
        wallet_address VARCHAR(255) DEFAULT '',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_withdrawals_investment (investment_id),
        INDEX idx_withdrawals_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.beginTransaction();
    transactionStarted = true;

    const requestedInvestmentId = String(body.investmentId || '').trim();
    let investmentRows;
    if (requestedInvestmentId) {
      [investmentRows] = await conn.query(
        "SELECT id, user_email, user_name, status, total, total_current_value, trading_status FROM investments WHERE id=? AND LOWER(user_email)=? LIMIT 1 FOR UPDATE",
        [requestedInvestmentId, session.email]
      );
    } else {
      [investmentRows] = await conn.query(
        "SELECT id, user_email, user_name, status, total, total_current_value, trading_status FROM investments WHERE LOWER(user_email)=? ORDER BY CASE WHEN status IN ('active','approved') THEN 0 ELSE 1 END, created_at DESC LIMIT 1 FOR UPDATE",
        [session.email]
      );
    }

    const investment = investmentRows?.[0];
    if (!investment || !['active', 'approved'].includes(String(investment.status || '').toLowerCase())) {
      await conn.rollback(); transactionStarted = false;
      return res.status(409).json({ success: false, error: 'A withdrawal requires an active, admin-approved investment.' });
    }
    if (String(investment.trading_status || '').toLowerCase() === 'active') {
      await conn.rollback(); transactionStarted = false;
      return res.status(409).json({ success: false, error: 'Stop the active trading session before requesting a withdrawal.' });
    }

    const currentBalance = Number(investment.total_current_value != null ? investment.total_current_value : investment.total || 0);
    const [pendingRows] = await conn.query(
      "SELECT COALESCE(SUM(amount),0) AS pending_total FROM withdrawals WHERE investment_id=? AND status IN ('pending','processing')",
      [investment.id]
    );
    const reserved = Number(pendingRows?.[0]?.pending_total || 0);
    const available = Math.max(0, Number((currentBalance - reserved).toFixed(2)));
    if (amount > available + 0.0001) {
      await conn.rollback(); transactionStarted = false;
      return res.status(422).json({
        success: false,
        error: 'The withdrawal amount exceeds your available balance after pending requests.',
        availableBalance: available
      });
    }

    const id = crypto.randomUUID();
    const investorName = String(investment.user_name || 'Investor');
    const roundedAmount = Number(amount.toFixed(2));
    await conn.query(
      'INSERT INTO withdrawals (id, investment_id, user_id, user_name, amount, method, wallet_address, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, "pending", NOW())',
      [id, investment.id, crypto.randomUUID(), investorName, roundedAmount, methodLabel(method), destination]
    );
    await conn.query(
      'INSERT INTO account_transactions (id, investment_id, user_email, type, amount, method, status, reference_id, note, created_at) VALUES (?, ?, ?, "withdrawal", ?, ?, "pending", ?, ?, NOW())',
      [crypto.randomUUID(), investment.id, session.email, roundedAmount, methodLabel(method), id, 'Withdrawal request pending admin review']
    );

    await conn.commit();
    transactionStarted = false;
    withdrawal = {
      id,
      investmentId: investment.id,
      email: session.email,
      name: investorName,
      amount: roundedAmount,
      method: methodLabel(method),
      status: 'pending'
    };
  } catch (error) {
    if (conn && transactionStarted) {
      try { await conn.rollback(); } catch (rollbackError) {}
    }
    console.error('[withdrawals] request could not be saved:', error.message);
    return res.status(503).json({ success: false, error: 'Your withdrawal request could not be saved. No balance was deducted; please retry.' });
  } finally {
    if (conn) { try { await conn.end(); } catch (closeError) {} }
  }

  const notices = await Promise.allSettled([
    sendWithdrawalStatusEmail(withdrawal.email, withdrawal.name, {
      amount: withdrawal.amount, method: withdrawal.method, status: 'pending', reference: withdrawal.id
    }),
    notifyAdminEvent('New withdrawal request', {
      email: withdrawal.email, name: withdrawal.name, amount: withdrawal.amount,
      status: withdrawal.status, recordId: withdrawal.id
    })
  ]);
  notices.forEach(result => safeLogFailure('[withdrawals] notification delivery failed:', result));

  return res.status(201).json({
    success: true,
    id: withdrawal.id,
    status: 'pending',
    availableBalance: undefined,
    message: 'Withdrawal request submitted. It is pending administrator review. No upfront payment is required.'
  });
}
