import crypto from 'crypto';
import { getDbConnection } from '../db.js';

const cleanEmail = value => String(value || '').trim().toLowerCase();
const maskEmail = value => {
  const parts = String(value || '').split('@');
  if (parts.length !== 2) return 'Referred investor';
  const left = parts[0];
  return (left.length > 1 ? left[0] + '***' : '*') + '@' + parts[1];
};
const makeCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

async function getOrCreateCode(conn, email) {
  const [existing] = await conn.query(
    'SELECT code FROM referral_codes WHERE LOWER(email)=? LIMIT 1',
    [email]
  );
  if (existing[0]?.code) return String(existing[0].code);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    try {
      await conn.query('INSERT INTO referral_codes (email, code) VALUES (?, ?)', [email, code]);
      return code;
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY' && attempt < 4) {
        const [raced] = await conn.query(
          'SELECT code FROM referral_codes WHERE LOWER(email)=? LIMIT 1',
          [email]
        );
        if (raced[0]?.code) return String(raced[0].code);
        continue;
      }
      throw error;
    }
  }
  throw new Error('A referral code could not be reserved. Please retry.');
}

export default async function referralHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  const url = new URL(req.url, `https://${req.headers.host || 'teslawealths.org'}`);
  const email = cleanEmail(url.searchParams.get('email'));
  if (!email || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ success: false, error: 'A valid investor email is required.' });
  }

  let conn = null;
  try {
    conn = await getDbConnection();

    const [accounts] = await conn.query(
      'SELECT email FROM investor_accounts WHERE LOWER(email)=? LIMIT 1',
      [email]
    );
    let registered = accounts.length > 0;
    if (!registered) {
      const [investments] = await conn.query(
        'SELECT id FROM investments WHERE LOWER(user_email)=? LIMIT 1',
        [email]
      );
      registered = investments.length > 0;
    }
    if (!registered) {
      return res.status(404).json({ success: false, error: 'Investor account not found.' });
    }

    const code = await getOrCreateCode(conn, email);
    const [totals] = await conn.query(
      'SELECT COALESCE(SUM(commission),0) AS total_earned, COUNT(*) AS total_deposits, COUNT(DISTINCT referred_email) AS unique_referrals FROM referral_earnings WHERE LOWER(referrer_email)=?',
      [email]
    );
    const [earningRows] = await conn.query(
      'SELECT re.referred_email, re.deposit_amount, re.commission, re.note, re.created_at, i.user_name AS referred_name FROM referral_earnings re LEFT JOIN investments i ON i.id=re.investment_id WHERE LOWER(re.referrer_email)=? ORDER BY re.created_at DESC LIMIT 30',
      [email]
    );

    let myBonus = null;
    try {
      const [bonusRows] = await conn.query(
        'SELECT bonus_amount, matured_at, maturity_days FROM referral_bonuses WHERE LOWER(referred_email)=? ORDER BY credited_at DESC LIMIT 1',
        [email]
      );
      if (bonusRows[0]) {
        myBonus = {
          amount: Number(bonusRows[0].bonus_amount || 0),
          matured_at: bonusRows[0].matured_at || null,
          matured: bonusRows[0].matured_at ? new Date(bonusRows[0].matured_at).getTime() <= Date.now() : false,
          maturity_days: Number(bonusRows[0].maturity_days || 0)
        };
      }
    } catch (bonusError) {
      // Older installations may not yet have the optional referral bonus table.
      console.warn('[referral] optional bonus lookup unavailable:', bonusError?.code || bonusError?.message);
    }

    return res.status(200).json({
      success: true,
      code,
      link: 'https://teslawealths.org/?ref=' + encodeURIComponent(code),
      total_earned: Number(totals[0]?.total_earned || 0),
      total_deposits: Number(totals[0]?.total_deposits || 0),
      unique_referrals: Number(totals[0]?.unique_referrals || 0),
      earnings: earningRows.map(row => ({
        referred_name: row.referred_name || maskEmail(row.referred_email),
        deposit_amount: Number(row.deposit_amount || 0),
        commission: Number(row.commission || 0),
        note: row.note || '',
        created_at: row.created_at || null
      })),
      my_bonus: myBonus
    });
  } catch (error) {
    const code = String(error?.code || 'REFERRAL_ERROR').replace(/[^A-Z0-9_]/gi, '').slice(0, 40);
    console.error('[referral] dashboard lookup failed:', code, error?.message || error);
    return res.status(503).json({
      success: false,
      error: 'Referral information is temporarily unavailable. Your account and balances were not changed.',
      errorCode: code
    });
  } finally {
    if (conn) {
      try { await conn.end(); } catch (closeError) {}
    }
  }
}
