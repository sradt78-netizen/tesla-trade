// Trading API Handler for Live Algorithmic Trading & Performance Graph
import { loadPersistentDeposits } from './payment-submit.js';
import { loadDatabaseSync, checkMySqlHealth } from '../db.js';
import mysql from 'mysql2/promise';

export const tradingInvestments = {};

export let tradingSettings = {
  profitIntervalSeconds: 3,
  lossIntervalSeconds: 2,
  profitRatePercent: 2,
  lossRatePercent: 1
};

export function computeTradeValue(inv, now) {
  const tot = Number(inv.total || 0);
  let curVal = Number(inv.totalCurrentValue != null ? inv.totalCurrentValue : (inv.total_current_value != null ? inv.total_current_value : tot));
  if (curVal === 0 && tot > 0) {
    curVal = tot;
  }
  const balance = curVal || tot;
  if (inv.tradingStatus !== 'active' || !inv.tradingStartedAt) {
    return {
      status: 'idle',
      availableBalance: balance,
      tradeValue: 0,
      pnl: 0,
      pnlPercent: 0,
      phase: 'profit',
      history: []
    };
  }
  const elapsed = Math.max(0, now - Number(inv.tradingStartedAt));
  const amount = Number(inv.tradingAmount || 0);
  const cycle = tradingSettings.profitIntervalSeconds + tradingSettings.lossIntervalSeconds;
  const inCycle = cycle > 0 ? elapsed % cycle : 0;
  const isProfit = inCycle < tradingSettings.profitIntervalSeconds;
  const phase = isProfit ? 'profit' : 'loss';

  const gain = isProfit
    ? amount * (tradingSettings.profitRatePercent / 100)
    : -amount * (tradingSettings.lossRatePercent / 100);
  const tradeValue = Math.max(0, Number((amount + gain).toFixed(2)));
  const pnl = Number((tradeValue - amount).toFixed(2));
  const pnlPercent = amount > 0 ? Number(((pnl / amount) * 100).toFixed(2)) : 0;

  // Generate 20+ data points for smooth, fluctuating graph display from the moment of execution
  const history = [];
  const pointsCount = 20;
  for (let k = pointsCount; k >= 0; k--) {
    const secOffset = elapsed - (k * 1.5);
    const s = Math.max(0, Math.floor(secOffset));
    const sInCycle = cycle > 0 ? (s % cycle) : 0;
    const sIsProfit = sInCycle < tradingSettings.profitIntervalSeconds;
    const jitter = (Math.sin(k * 0.7) * 0.0035) + ((pointsCount - k) * 0.001);
    const pointVal = sIsProfit
      ? amount * (1 + jitter + (tradingSettings.profitRatePercent / 100))
      : amount * (1 + jitter - (tradingSettings.lossRatePercent / 100));
    history.push({
      timestamp: (Number(inv.tradingStartedAt) + secOffset) * 1000,
      value: Math.max(0.01, Number(pointVal.toFixed(2))),
      trend: sIsProfit ? 'profit' : 'loss'
    });
  }
  if (history.length > 0) {
    history[history.length - 1].value = tradeValue;
  }

  return {
    status: 'active',
    availableBalance: Math.max(0, Number((balance - amount).toFixed(2))),
    tradeValue,
    pnl,
    pnlPercent,
    phase,
    history
  };
}

// ── Persistence ──────────────────────────────────────────────────
// Vercel serverless instances do not share memory, so the real MySQL row is
// the single source of truth for balance + trade state. The in-memory map is
// only a fallback when MySQL is unreachable.
async function realConn() {
  try {
    const health = await checkMySqlHealth();
    if (!health.available) return null;
    const c = health.config;
    return await mysql.createConnection({
      host: c.host, port: c.port, user: c.user, password: c.password,
      database: c.database, ssl: c.ssl, connectTimeout: 6000
    });
  } catch (e) { return null; }
}

function rowToInv(r) {
  const total = Number(r.total || 0);
  let cur = Number(r.total_current_value || 0);
  if (cur <= 0 && total > 0) cur = total;
  return {
    id: String(r.id),
    status: r.status,
    total,
    totalCurrentValue: cur,
    tradingStatus: r.trading_status === 'active' ? 'active' : 'idle',
    tradingAmount: Number(r.trading_amount || 0),
    tradingStartedAt: r.started != null ? Number(r.started) : null
  };
}

const COLS = 'id, status, total, total_current_value, trading_status, trading_amount, UNIX_TIMESTAMP(trading_started_at) AS started';

export async function getOrCreateInvestment(id, email) {
  const conn = await realConn();
  if (conn) {
    try {
      let rows = [];
      if (id && !String(id).startsWith('sim_')) {
        [rows] = email
          ? await conn.query('SELECT ' + COLS + ' FROM investments WHERE id=? AND LOWER(user_email)=? LIMIT 1', [id, String(email).toLowerCase()])
          : await conn.query('SELECT ' + COLS + ' FROM investments WHERE id=? LIMIT 1', [id]);
      }
      if (!rows.length && email) {
        [rows] = await conn.query(
          "SELECT " + COLS + " FROM investments WHERE LOWER(user_email)=? AND status IN ('active','approved','completed') ORDER BY (deposit_parent_id IS NULL) DESC, created_at ASC LIMIT 1",
          [String(email).toLowerCase()]
        );
      }
      await conn.end();
      if (rows.length) return rowToInv(rows[0]);
    } catch (e) { try { await conn.end(); } catch (e2) {} }
  }

  // Fallback (no MySQL): in-memory, strictly matched to this investor only.
  let inv = tradingInvestments[id];
  if (inv) return inv;
  let depositTotal = 0, curVal = 0, invStatus = 'active';
  const lcEmail = String(email || '').toLowerCase();
  const pick = (list) => (list || []).find(d =>
    ((String(d.id) === String(id)) && (!lcEmail || String(d.user_email || d.email || '').toLowerCase() === lcEmail)) ||
    (lcEmail && String(d.user_email || d.email || '').toLowerCase() === lcEmail &&
      ['active', 'approved'].includes(d.status)));
  let match = null;
  try { match = pick(loadDatabaseSync().investments); } catch (e) {}
  if (!match) { try { match = pick(loadPersistentDeposits()); } catch (e) {} }
  if (match) {
    depositTotal = parseFloat(match.total != null ? match.total : (match.amount || '0'));
    curVal = parseFloat(match.totalCurrentValue || match.total_current_value || depositTotal || '0');
    if (curVal === 0 && depositTotal > 0) curVal = depositTotal;
    invStatus = match.status || 'active';
  }
  inv = { id, status: invStatus, total: depositTotal, totalCurrentValue: curVal,
          tradingStatus: 'idle', tradingAmount: 0, tradingStartedAt: null };
  tradingInvestments[id] = inv;
  return inv;
}

async function saveInv(inv, fields) {
  tradingInvestments[inv.id] = inv;
  const conn = await realConn();
  if (!conn) return;
  try {
    await conn.query(
      'UPDATE investments SET total_current_value=?, earnings=?, trading_status=?, trading_amount=?, trading_started_at=' +
      (fields.startedAt ? 'FROM_UNIXTIME(?)' : 'NULL') + ', trading_updated_at=NOW() WHERE id=?',
      fields.startedAt
        ? [inv.totalCurrentValue, Math.max(0, inv.totalCurrentValue - inv.total), inv.tradingStatus, inv.tradingAmount, fields.startedAt, inv.id]
        : [inv.totalCurrentValue, Math.max(0, inv.totalCurrentValue - inv.total), inv.tradingStatus, inv.tradingAmount, inv.id]
    );
  } finally { try { await conn.end(); } catch (e) {} }
}

function withWallet(inv, trade) {
  // Single wallet number: idle = full balance, trading = untraded cash + live trade value.
  const base = Number(inv.totalCurrentValue || 0);
  const walletBalance = trade.status === 'active'
    ? Number((base - inv.tradingAmount + trade.tradeValue).toFixed(2))
    : Number(base.toFixed(2));
  return Object.assign({}, trade, { walletBalance, portfolioBalance: walletBalance, totalBalance: walletBalance });
}

function qEmail(req, body) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return String(url.searchParams.get('email') || (body && body.email) || '').trim().toLowerCase();
}

export async function handleTradingState(req, res, id) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const now = Math.floor(Date.now() / 1000);
  const inv = await getOrCreateInvestment(id, qEmail(req));
  return res.status(200).json({
    investmentId: inv.id,
    trade: withWallet(inv, computeTradeValue(inv, now))
  });
}

export async function handleTradingStart(req, res, id, body) {
  res.setHeader('Cache-Control', 'no-store');
  const now = Math.floor(Date.now() / 1000);
  const inv = await getOrCreateInvestment(id, qEmail(req, body));
  const amount = Number(body.amount || 0);
  const available = Number(inv.totalCurrentValue != null ? inv.totalCurrentValue : inv.total || 0);

  if (inv.tradingStatus === 'active') {
    return res.status(409).json({ error: 'A trade is already running. Stop it before starting a new one.' });
  }
  if (available <= 0) {
    return res.status(409).json({ error: 'You have no available funds. Top up your account before starting a trade.' });
  }
  if (amount <= 0 || amount > available + 0.001) {
    return res.status(422).json({ error: 'Enter an amount within your available balance.' });
  }

  inv.tradingStatus = 'active';
  inv.tradingAmount = amount;
  inv.tradingStartedAt = now;
  await saveInv(inv, { startedAt: now });

  return res.status(200).json({ success: true, trade: withWallet(inv, computeTradeValue(inv, now)) });
}

export async function handleTradingStop(req, res, id, body) {
  res.setHeader('Cache-Control', 'no-store');
  const now = Math.floor(Date.now() / 1000);
  const inv = await getOrCreateInvestment(id, qEmail(req, body));

  if (!inv || inv.tradingStatus !== 'active') {
    // Already stopped (e.g. double click): report the saved balance instead of an error.
    return res.status(200).json({
      success: true,
      stoppedTradeValue: 0,
      pnl: 0,
      portfolioBalance: inv.totalCurrentValue,
      trade: withWallet(inv, computeTradeValue(inv, now))
    });
  }

  const active = computeTradeValue(inv, now);
  const balance = Number(inv.totalCurrentValue || inv.total || 0);
  inv.totalCurrentValue = Number((balance - inv.tradingAmount + active.tradeValue).toFixed(2));
  inv.tradingStatus = 'idle';
  inv.tradingAmount = 0;
  inv.tradingStartedAt = null;
  await saveInv(inv, {});

  return res.status(200).json({
    success: true,
    stoppedTradeValue: active.tradeValue,
    pnl: active.pnl,
    portfolioBalance: inv.totalCurrentValue,
    trade: withWallet(inv, computeTradeValue(inv, now))
  });
}

export function handleTradingSettingsGet(req, res) {
  return res.status(200).json({ settings: tradingSettings });
}

export function handleTradingSettingsPost(req, res, body) {
  const p = body || {};
  tradingSettings = {
    profitIntervalSeconds: Math.max(1, Math.min(86400, Number(p.profitIntervalSeconds || 3))),
    lossIntervalSeconds: Math.max(1, Math.min(86400, Number(p.lossIntervalSeconds || 2))),
    profitRatePercent: Math.max(0, Math.min(100, Number(p.profitRatePercent || 2))),
    lossRatePercent: Math.max(0, Math.min(100, Number(p.lossRatePercent || 1)))
  };
  return res.status(200).json({ success: true, settings: tradingSettings });
}
