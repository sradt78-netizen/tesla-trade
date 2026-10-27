// Trading API Handler for Live Algorithmic Trading & Performance Graph
import { loadPersistentDeposits } from './payment-submit.js';

export const tradingInvestments = {
  'mock-funded': { id: 'mock-funded', status: 'active', total: 1000, totalCurrentValue: 1000, tradingStatus: 'idle', tradingAmount: 0, tradingStartedAt: null },
  'mock-empty': { id: 'mock-empty', status: 'active', total: 0, totalCurrentValue: 0, tradingStatus: 'idle', tradingAmount: 0, tradingStartedAt: null },
  'sim_inv_1': { id: 'sim_inv_1', status: 'active', total: 1000, totalCurrentValue: 1000, tradingStatus: 'idle', tradingAmount: 0, tradingStartedAt: null }
};

export let tradingSettings = {
  profitIntervalSeconds: 3,
  lossIntervalSeconds: 2,
  profitRatePercent: 2,
  lossRatePercent: 1
};

export function computeTradeValue(inv, now) {
  const balance = Number(inv.totalCurrentValue != null ? inv.totalCurrentValue : inv.total || 0);
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

export function getOrCreateInvestment(id) {
  let inv = tradingInvestments[id];
  if (!inv) {
    let depositTotal = 1000;
    try {
      const diskDeposits = loadPersistentDeposits();
      const match = diskDeposits.find(d => String(d.id) === String(id));
      if (match && match.total) depositTotal = parseFloat(match.total);
    } catch (e) {}

    inv = {
      id,
      status: 'active',
      total: depositTotal,
      totalCurrentValue: depositTotal,
      tradingStatus: 'idle',
      tradingAmount: 0,
      tradingStartedAt: null
    };
    tradingInvestments[id] = inv;
  }
  return inv;
}

export function handleTradingState(req, res, id) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const now = Number(url.searchParams.get('now') || Math.floor(Date.now() / 1000));
  const inv = getOrCreateInvestment(id);
  return res.status(200).json({
    investmentId: id,
    trade: computeTradeValue(inv, now)
  });
}

export function handleTradingStart(req, res, id, body) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const now = Number(url.searchParams.get('now') || Math.floor(Date.now() / 1000));
  const inv = getOrCreateInvestment(id);
  const amount = Number(body.amount || 0);
  const available = Number(inv.totalCurrentValue != null ? inv.totalCurrentValue : inv.total || 0);

  if (available <= 0) {
    return res.status(409).json({ error: 'You have no available funds. Top up your account before starting a trade.' });
  }
  if (amount <= 0 || amount > available) {
    return res.status(422).json({ error: 'Enter an amount within your available balance.' });
  }

  inv.tradingStatus = 'active';
  inv.tradingAmount = amount;
  inv.tradingStartedAt = now;

  return res.status(200).json({
    success: true,
    trade: computeTradeValue(inv, now)
  });
}

export function handleTradingStop(req, res, id) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const now = Number(url.searchParams.get('now') || Math.floor(Date.now() / 1000));
  const inv = getOrCreateInvestment(id);

  if (!inv || inv.tradingStatus !== 'active') {
    return res.status(409).json({ error: 'There is no active trade to stop.' });
  }

  const active = computeTradeValue(inv, now);
  const balance = Number(inv.totalCurrentValue != null ? inv.totalCurrentValue : inv.total || 0);
  inv.totalCurrentValue = Number((balance - inv.tradingAmount + active.tradeValue).toFixed(2));
  inv.tradingStatus = 'idle';
  inv.tradingAmount = 0;
  inv.tradingStartedAt = null;

  return res.status(200).json({
    success: true,
    stoppedTradeValue: active.tradeValue,
    portfolioBalance: inv.totalCurrentValue,
    trade: computeTradeValue(inv, now)
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
