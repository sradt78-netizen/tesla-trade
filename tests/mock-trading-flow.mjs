#!/usr/bin/env node
/*
 * Mock API regression test for the investor trading flow.
 * Uses only Node's standard library so it can run in a clean ZIP export.
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const state = {
  now: 1000,
  settings: {
    profitIntervalSeconds: 3,
    lossIntervalSeconds: 2,
    profitRatePercent: 2,
    lossRatePercent: 1,
  },
  investments: {
    'mock-funded': {
      id: 'mock-funded',
      status: 'active',
      total: 1000,
      totalCurrentValue: 1000,
      tradingStatus: 'idle',
      tradingAmount: 0,
      tradingStartedAt: null,
    },
    'mock-empty': {
      id: 'mock-empty',
      status: 'active',
      total: 0,
      totalCurrentValue: 0,
      tradingStatus: 'idle',
      tradingAmount: 0,
      tradingStartedAt: null,
    },
  },
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function valueAt(investment, at) {
  const amount = Number(investment.tradingAmount);
  if (investment.tradingStatus !== 'active' || amount <= 0) {
    return { value: 0, phase: 'idle' };
  }
  const elapsed = Math.max(0, Math.floor(at - investment.tradingStartedAt));
  const { profitIntervalSeconds: profitWindow, lossIntervalSeconds: lossWindow } = state.settings;
  const cycle = profitWindow + lossWindow;
  const fullCycles = Math.floor(elapsed / cycle);
  const remaining = elapsed % cycle;
  let net = fullCycles * (state.settings.profitRatePercent - state.settings.lossRatePercent);
  if (remaining <= profitWindow) {
    net += state.settings.profitRatePercent * (remaining / profitWindow);
  } else {
    net += state.settings.profitRatePercent;
    net -= state.settings.lossRatePercent * ((remaining - profitWindow) / lossWindow);
  }
  const value = Math.max(0.01, Number((amount * (1 + net / 100)).toFixed(2)));
  return {
    value,
    phase: (elapsed % cycle) < profitWindow ? 'profit' : 'loss',
  };
}

function tradeValue(investment, at) {
  const amount = Number(investment.tradingAmount);
  if (investment.tradingStatus !== 'active' || amount <= 0) {
    return {
      status: 'idle',
      phase: 'idle',
      availableBalance: Number(investment.totalCurrentValue || investment.total),
      tradeValue: 0,
      pnl: 0,
      pnlPercent: 0,
      history: [],
      settings: state.settings,
    };
  }
  const elapsed = Math.max(0, Math.floor(at - investment.tradingStartedAt));
  const { profitIntervalSeconds: profitWindow, lossIntervalSeconds: lossWindow } = state.settings;
  const cycle = profitWindow + lossWindow;
  const current = valueAt(investment, at);
  const position = elapsed % cycle;
  const isProfit = position < profitWindow;
  const phaseElapsed = isProfit ? position : position - profitWindow;
  const phaseDuration = isProfit ? profitWindow : lossWindow;
  const history = [];
  for (let second = Math.max(0, elapsed - 29); second <= elapsed; second += 1) {
    const previous = valueAt(investment, investment.tradingStartedAt + second);
    history.push({
      timestamp: investment.tradingStartedAt + second,
      value: previous.value,
      trend: (second % cycle) < profitWindow ? 'profit' : 'loss',
    });
  }
  const phase = current.phase;
  const value = current.value;
  const pnl = Number((value - amount).toFixed(2));
  return {
    status: 'active',
    phase,
    phaseLabel: phase === 'profit' ? 'Profit phase' : 'Loss phase',
    elapsedSeconds: elapsed,
    phaseDurationSeconds: phaseDuration,
    phaseElapsedSeconds: phaseElapsed,
    phaseRemainingSeconds: Math.max(0, phaseDuration - phaseElapsed),
    availableBalance: Number((investment.totalCurrentValue - value).toFixed(2)),
    tradeValue: value,
    pnl,
    pnlPercent: Number(((pnl / amount) * 100).toFixed(2)),
    history,
    settings: state.settings,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'POST' && url.pathname === '/api/admin/trading-settings') {
      assert.equal(req.headers['x-admin-token'], 'mock-admin');
      state.settings = { ...state.settings, ...(await body(req)) };
      return json(res, 200, { success: true, settings: state.settings });
    }
    const id = parts[2];
    const investment = state.investments[id];
    if (parts[0] === 'api' && parts[1] === 'investments' && investment && parts[3] === 'trading-state' && req.method === 'GET') {
      const at = Number(url.searchParams.get('now') || state.now);
      return json(res, 200, { investmentId: id, trade: tradeValue(investment, at) });
    }
    if (parts[0] === 'api' && parts[1] === 'investments' && investment && parts[3] === 'trading' && parts[4] === 'start' && req.method === 'POST') {
      const amount = Number((await body(req)).amount || 0);
      const available = Number(investment.totalCurrentValue || investment.total);
      if (available <= 0) return json(res, 409, { error: 'You have no available funds. Top up your account before starting a trade.' });
      if (amount <= 0 || amount > available) return json(res, 422, { error: 'Enter an amount within your available balance.' });
      investment.tradingStatus = 'active';
      investment.tradingAmount = amount;
      investment.tradingStartedAt = state.now;
      return json(res, 200, { success: true, trade: tradeValue(investment, state.now) });
    }
    if (parts[0] === 'api' && parts[1] === 'investments' && investment && parts[3] === 'trading' && parts[4] === 'stop' && req.method === 'POST') {
      if (investment.tradingStatus !== 'active') return json(res, 409, { error: 'There is no active trade to stop.' });
      const active = tradeValue(investment, state.now);
      const balance = Number(investment.totalCurrentValue || investment.total);
      investment.totalCurrentValue = Number((balance - investment.tradingAmount + active.tradeValue).toFixed(2));
      investment.tradingStatus = 'idle';
      investment.tradingAmount = 0;
      investment.tradingStartedAt = null;
      return json(res, 200, {
        success: true,
        stoppedTradeValue: active.tradeValue,
        portfolioBalance: investment.totalCurrentValue,
        trade: tradeValue(investment, state.now),
      });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

function request(base, method, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, {
      method,
      headers: payload ? { 'Content-Type': 'application/json', ...headers } : headers,
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await request(base, 'GET', '/api/investments/mock-funded/trading-state?now=1000');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.trade.status, 'idle');
  assert.equal(initial.body.trade.availableBalance, 1000);

  const settings = await request(base, 'POST', '/api/admin/trading-settings', state.settings, { 'x-admin-token': 'mock-admin' });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.settings.lossIntervalSeconds, 2);

  const started = await request(base, 'POST', '/api/investments/mock-funded/trading/start', { amount: 500 });
  assert.equal(started.status, 200);
  assert.equal(started.body.trade.tradeValue, 500);

  const profit = await request(base, 'GET', '/api/investments/mock-funded/trading-state?now=1002');
  assert.equal(profit.body.trade.phase, 'profit');
  assert.equal(profit.body.trade.phaseRemainingSeconds, 1);
  assert.ok(profit.body.trade.pnl > 0, 'profit phase should move the trade up');

  const loss = await request(base, 'GET', '/api/investments/mock-funded/trading-state?now=1004');
  assert.equal(loss.body.trade.phase, 'loss');
  assert.equal(loss.body.trade.phaseRemainingSeconds, 1);
  assert.ok(loss.body.trade.history.some(point => point.trend === 'loss'), 'chart history should include a loss phase');
  assert.ok(loss.body.trade.history.some((point, index, points) => index > 0 && point.value < points[index - 1].value), 'chart history should contain a red/down segment');

  state.now = 1004;
  const stopped = await request(base, 'POST', '/api/investments/mock-funded/trading/stop', {});
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.trade.status, 'idle');
  assert.equal(stopped.body.portfolioBalance, 1007.5);

  const oversized = await request(base, 'POST', '/api/investments/mock-funded/trading/start', { amount: 2000 });
  assert.equal(oversized.status, 422);
  const empty = await request(base, 'POST', '/api/investments/mock-empty/trading/start', { amount: 10 });
  assert.equal(empty.status, 409);
  assert.match(empty.body.error, /no available funds/i);

  console.log('PASS trading amount allocation and active trade state');
  console.log('PASS admin timing settings drive profit/loss phases');
  console.log('PASS chart history includes green/up and red/down movement');
  console.log('PASS stop trade returns final value to portfolio balance');
  console.log('PASS empty balance returns top-up guidance');
  server.close();
}

main().catch(error => {
  console.error('FAIL', error.stack || error);
  server.close(() => { process.exitCode = 1; });
});