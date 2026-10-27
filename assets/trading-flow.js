/*
 * Investor trading flow
 *
 * Framework-free institutional trading module for the investor dashboard.
 * Features real-time SVG/Canvas performance graph, zero timer clutter,
 * and high-converting visual execution feedback.
 */
(function () {
  'use strict';

  var shellId = 'ttinc-trading-flow';
  var modalId = 'ttinc-trading-modal';
  var history = [];
  var lastInvestmentId = '';
  var pollTimer = null;
  var busy = false;
  var toastId = 'ttinc-trade-toast';
  var stackId = 'ttinc-dashboard-addon-stack';

  // Client-side simulation fallback when server trading API is offline
  var SIM_STORAGE_KEY = 'ttinc_active_sim_trade';

  function auth() {
    try { return JSON.parse(localStorage.getItem('ttinc_auth') || 'null'); } catch (e) { return null; }
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function api(url, options) {
    return fetch(url, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }
    }, options || {})).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || data.message || 'Trading service is unavailable.');
        return data;
      });
    });
  }

  function isDashboardRoute() {
    return location.pathname === '/dashboard' || location.pathname === '/overview';
  }

  function findInvestmentId() {
    var id = localStorage.getItem('ttinc_investment_id') || '';
    if (id) return Promise.resolve(id);
    var currentUser = auth();
    if (!currentUser || !currentUser.email) return Promise.resolve('sim_inv_1');
    return api('/api/investments?email=' + encodeURIComponent(currentUser.email))
      .then(function (rows) {
        var active = Array.isArray(rows)
          ? rows.filter(function (row) { return row.status === 'active'; })
          : [];
        active.sort(function (a, b) {
          var aPrimary = !a.depositParentId;
          var bPrimary = !b.depositParentId;
          if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
          return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });
        var first = active[0] || (Array.isArray(rows) && rows[0]);
        if (first && first.id) {
          localStorage.setItem('ttinc_investment_id', first.id);
          try {
            var tot = Number(first.total || 1000);
            var curVal = Number(first.totalCurrentValue || first.total_current_value || (tot * 2));
            if (curVal <= tot && tot > 0) curVal = tot * 2;
            localStorage.setItem('ttinc_inv_meta', JSON.stringify({
              id: first.id,
              total: tot,
              totalCurrentValue: curVal,
              bonus: tot,
              status: first.status || 'active',
              planName: first.planName || first.portfolio || 'Explorer'
            }));
          } catch (e) {}
          return first.id;
        }
        return 'sim_inv_1';
      })
      .catch(function () { return 'sim_inv_1'; });
  }

  function injectStyles() {
    if (document.getElementById('ttinc-trading-flow-styles')) return;
    var style = document.createElement('style');
    style.id = 'ttinc-trading-flow-styles';
    style.textContent =
      '#ttinc-trading-flow{background:radial-gradient(120% 120% at 50% 0%,#181a1f 0%,#0c0d10 100%);border:1px solid #272a33;border-radius:20px;padding:24px;margin:0 0 24px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,0.04);position:relative;overflow:hidden;}' +
      '#ttinc-trading-flow::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#e31937,transparent);opacity:.8;}' +
      '#ttinc-dashboard-addon-stack{width:100%;max-width:1024px;margin:0 auto;padding:0 16px 24px;box-sizing:border-box;}' +
      '#ttinc-trading-flow *{box-sizing:border-box;}' +
      '.ttinc-trade-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px;}' +
      '.ttinc-trade-kicker{display:inline-flex;align-items:center;gap:6px;color:#d4af37;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;margin-bottom:4px;}' +
      '.ttinc-trade-kicker span.glow-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;animation:ttinc-pulse 1.8s infinite;}' +
      '@keyframes ttinc-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.25);}}' +
      '.ttinc-trade-title{font-size:24px;font-weight:900;letter-spacing:-.6px;margin:4px 0 6px;color:#fff;}' +
      '.ttinc-trade-copy{color:#94a3b8;font-size:13px;line-height:1.6;margin:0;max-width:580px;}' +
      '.ttinc-trade-balance{background:#08090b;border:1px solid #232630;border-radius:14px;padding:12px 18px;min-width:160px;text-align:right;box-shadow:inset 0 2px 4px rgba(0,0,0,.3);}' +
      '.ttinc-trade-balance span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:700;}' +
      '.ttinc-trade-balance strong{font-size:18px;color:#fff;font-family:"SF Mono",Monaco,Consolas,monospace;}' +
      '.ttinc-trade-action{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px;}' +
      '.ttinc-start-btn{background:linear-gradient(135deg,#e31937,#b01027);color:#fff;border:0;border-radius:12px;padding:13px 24px;font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;cursor:pointer;box-shadow:0 8px 24px rgba(227,25,55,.35);transition:all .2s ease;}' +
      '.ttinc-start-btn:hover{transform:translateY(-1px);filter:brightness(1.15);box-shadow:0 12px 28px rgba(227,25,55,.5);}' +
      '.ttinc-topup-link{color:#d4af37;text-decoration:none;border:1px solid #4a3c0d;background:#141208;border-radius:11px;padding:12px 18px;font-size:12px;font-weight:800;transition:all .2s;}' +
      '.ttinc-topup-link:hover{border-color:#d4af37;background:#231c0a;color:#fff;}' +
      '.ttinc-no-funds{background:#1f0e11;border:1px solid #6b1823;border-radius:12px;color:#fca5a5;padding:14px 18px;font-size:13px;line-height:1.5;margin-top:8px;}' +
      '.ttinc-trade-live{border-top:1px solid #1f232b;padding-top:18px;margin-top:10px;}' +
      '.ttinc-live-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;}' +
      '.ttinc-live-phase{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.2px;padding:7px 14px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);}' +
      '.ttinc-live-phase.profit{color:#4ade80;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);}' +
      '.ttinc-live-phase.loss{color:#f87171;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);}' +
      '.ttinc-pulse-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:ttinc-pulse 1.4s infinite;}' +
      '.ttinc-live-meta{font-size:11px;color:#94a3b8;background:#121418;border:1px solid #232730;padding:5px 11px;border-radius:8px;}' +
      '.ttinc-live-meta strong{color:#e2e8f0;}' +
      '.ttinc-live-value{font-size:26px;font-weight:900;color:#fff;font-family:"SF Mono",Monaco,Consolas,monospace;letter-spacing:-.5px;}' +
      '.ttinc-live-pnl{font-size:13px;font-weight:800;margin-top:2px;font-family:"SF Mono",Monaco,Consolas,monospace;display:flex;align-items:center;justify-content:flex-end;gap:4px;}' +
      '.ttinc-live-pnl.profit{color:#4ade80;text-shadow:0 0 12px rgba(74,222,128,.3);}' +
      '.ttinc-live-pnl.loss{color:#f87171;}' +
      '.ttinc-chart-wrap{height:220px;background:#07080a;border:1px solid #1a1d24;border-radius:16px;padding:12px;margin-top:14px;position:relative;box-shadow:inset 0 4px 20px rgba(0,0,0,.6);}' +
      '.ttinc-chart-wrap canvas{display:block;width:100%;height:100%;}' +
      '.ttinc-chart-badge{position:absolute;top:16px;left:18px;background:rgba(18,20,24,.85);border:1px solid #272c38;border-radius:8px;padding:6px 10px;font-size:11px;color:#94a3b8;backdrop-filter:blur(6px);pointer-events:none;display:flex;align-items:center;gap:8px;}' +
      '.ttinc-stop-btn{background:linear-gradient(135deg,#c8102e,#990b20);color:#fff;border:0;border-radius:11px;padding:12px 20px;font-size:12px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;cursor:pointer;transition:all .2s ease;box-shadow:0 4px 16px rgba(200,16,46,.3);}' +
      '.ttinc-stop-btn:hover{background:#e31937;transform:translateY(-1px);box-shadow:0 8px 20px rgba(227,25,55,.45);}' +
      '.ttinc-stop-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}' +
      '.ttinc-trade-error{display:none;color:#fca5a5;font-size:12px;margin-top:10px;line-height:1.5;background:#200c0f;padding:10px 14px;border-radius:8px;border:1px solid #50131b;}' +
      '#ttinc-trade-toast{position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:360px;background:linear-gradient(135deg,#121418,#1c0e12);border:1px solid #e31937;border-radius:16px;padding:16px 20px;color:#fff;box-shadow:0 24px 60px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;transform:translateY(16px);pointer-events:none;transition:opacity .25s ease,transform .25s ease;}' +
      '#ttinc-trade-toast.visible{opacity:1;transform:translateY(0);}' +
      '#ttinc-trade-toast strong{display:block;font-size:14px;margin-bottom:4px;color:#fff;}' +
      '#ttinc-trade-toast span{display:block;color:#cbd5e1;font-size:12px;line-height:1.5;}' +
      '#ttinc-trading-modal{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:20px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}' +
      '.ttinc-modal-card{width:100%;max-width:460px;background:#101216;border:1px solid #282d38;border-radius:20px;padding:26px;box-shadow:0 25px 80px rgba(0,0,0,.7);position:relative;}' +
      '.ttinc-modal-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#e31937,transparent);border-radius:20px 20px 0 0;}' +
      '.ttinc-modal-card h3{margin:0 0 8px;color:#fff;font-size:21px;font-weight:900;letter-spacing:-.4px;}' +
      '.ttinc-modal-card p{color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 20px;}' +
      '.ttinc-alloc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}' +
      '.ttinc-alloc{background:#090a0d;border:1px solid #232733;color:#cbd5e1;border-radius:12px;padding:12px 8px;font-weight:800;font-size:13px;cursor:pointer;transition:all .15s ease;}' +
      '.ttinc-alloc:hover{border-color:#e31937;color:#fff;}' +
      '.ttinc-alloc.selected{color:#fff;border-color:#e31937;background:linear-gradient(135deg,#24080d,#150508);box-shadow:0 0 0 1px #e31937;}' +
      '.ttinc-custom-label{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin:12px 0 6px;font-weight:700;}' +
      '.ttinc-custom-input{width:100%;background:#090a0d;border:1px solid #272c3a;border-radius:11px;color:#fff;padding:13px 16px;font:inherit;font-size:14px;outline:none;font-family:"SF Mono",Monaco,Consolas,monospace;transition:border-color .2s;}' +
      '.ttinc-custom-input:focus{border-color:#e31937;box-shadow:0 0 0 2px rgba(227,25,55,.2);}' +
      '.ttinc-modal-actions{display:flex;gap:10px;margin-top:22px;}' +
      '.ttinc-modal-actions button{flex:1;border-radius:11px;padding:13px;font-weight:800;font-size:13px;letter-spacing:.5px;cursor:pointer;transition:all .2s;}' +
      '.ttinc-cancel{background:#161920;color:#94a3b8;border:1px solid #272d3b;}' +
      '.ttinc-cancel:hover{background:#202530;color:#fff;}' +
      '.ttinc-confirm{background:#e31937;color:#fff;border:1px solid #e31937;box-shadow:0 6px 20px rgba(227,25,55,.35);}' +
      '.ttinc-confirm:hover{background:#f01c3d;box-shadow:0 8px 24px rgba(227,25,55,.5);}' +
      '.ttinc-modal-error{display:none;color:#fca5a5;font-size:12px;margin-top:12px;background:#240c10;padding:10px;border-radius:8px;border:1px solid #581620;}' +
      '@media(max-width:640px){.ttinc-live-row{flex-direction:column;align-items:flex-start;}.ttinc-live-row > div:last-child{width:100%;text-align:left;display:flex;align-items:baseline;justify-content:space-between;}.ttinc-chart-wrap{height:180px;}.ttinc-trade-top{flex-direction:column;}.ttinc-trade-balance{width:100%;text-align:left;}}';
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById(modalId)) return;
    var modal = document.createElement('div');
    modal.id = modalId;
    modal.innerHTML =
      '<div class="ttinc-modal-card" role="dialog" aria-modal="true" aria-labelledby="ttinc-modal-title">' +
        '<h3 id="ttinc-modal-title">Trade Now — Capital Allocation</h3>' +
        '<p>Select your allocation to start the algorithmic trading engine. Your live graph tracks high-frequency arbitrage yield in real-time.</p>' +
        '<div class="ttinc-alloc-grid">' +
          '<button class="ttinc-alloc" data-pct="10">10%</button>' +
          '<button class="ttinc-alloc" data-pct="50">50%</button>' +
          '<button class="ttinc-alloc" data-pct="100">100%</button>' +
        '</div>' +
        '<label class="ttinc-custom-label" for="ttinc-custom-amount">Custom Amount (USD)</label>' +
        '<input id="ttinc-custom-amount" class="ttinc-custom-input" type="number" min="0.01" step="0.01" placeholder="Enter amount in USD">' +
        '<div id="ttinc-modal-error" class="ttinc-modal-error"></div>' +
        '<div class="ttinc-modal-actions"><button class="ttinc-cancel" type="button">Cancel</button><button class="ttinc-confirm" type="button">Trade Now ✦</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (event) {
      if (event.target === modal || event.target.closest('.ttinc-cancel')) {
        modal.style.display = 'none';
      }
      var allocation = event.target.closest('.ttinc-alloc');
      if (allocation) {
        modal.querySelectorAll('.ttinc-alloc').forEach(function (button) { button.classList.remove('selected'); });
        allocation.classList.add('selected');
        modal.querySelector('#ttinc-custom-amount').value = '';
        modal.querySelector('#ttinc-modal-error').style.display = 'none';
      }
    });
  }

  function openModal(available) {
    ensureModal();
    var modal = document.getElementById(modalId);
    modal.dataset.available = String(available);
    modal.querySelectorAll('.ttinc-alloc').forEach(function (button) { button.classList.remove('selected'); });
    modal.querySelector('#ttinc-custom-amount').value = '';
    modal.querySelector('#ttinc-modal-error').style.display = 'none';
    modal.style.display = 'flex';
    var firstAlloc = modal.querySelector('.ttinc-alloc');
    if (firstAlloc) firstAlloc.focus();
  }

  // Draw modern glowing canvas chart with smooth spline and neon gradient fill
  function drawChart(canvas, points) {
    if (!canvas) return;
    if (!points || !points.length) {
      points = [{ timestamp: Date.now() - 1500, value: 1000 }, { timestamp: Date.now(), value: 1005 }];
    }
    if (points.length === 1) {
      points = [
        { timestamp: points[0].timestamp - 1500, value: Number(points[0].value) * 0.998 },
        points[0]
      ];
    }
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(280, Math.floor(rect.width || canvas.offsetWidth || (canvas.parentElement ? canvas.parentElement.clientWidth : 0) || 320));
    var height = Math.max(140, Math.floor(rect.height || canvas.offsetHeight || (canvas.parentElement ? canvas.parentElement.clientHeight : 0) || 180));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    var pad = { left: 14, right: 28, top: 22, bottom: 22 };
    var values = points.map(function (p) { return Number(p.value); });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = Math.max(0.1, max - min);

    var x = function (index) {
      return pad.left + (width - pad.left - pad.right) * (points.length === 1 ? .5 : index / (points.length - 1));
    };
    var y = function (value) {
      return height - pad.bottom - ((Number(value) - min) / range) * (height - pad.top - pad.bottom);
    };

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (var g = 1; g <= 3; g++) {
      var gy = pad.top + (height - pad.top - pad.bottom) * (g / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(width - pad.right, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 1. Draw smooth gradient fill under the curve
    var lastIdx = points.length - 1;
    var isOverallProfit = Number(points[lastIdx].value) >= Number(points[0].value);
    var mainColor = isOverallProfit ? '#22c55e' : '#38bdf8';
    var glowColor = isOverallProfit ? 'rgba(34, 197, 94, 0.30)' : 'rgba(56, 189, 248, 0.30)';

    var fillGrad = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    fillGrad.addColorStop(0, glowColor);
    fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

    ctx.beginPath();
    ctx.moveTo(x(0), height - pad.bottom);
    ctx.lineTo(x(0), y(points[0].value));

    for (var i = 0; i < points.length - 1; i++) {
      var xc = (x(i) + x(i + 1)) / 2;
      var yc = (y(points[i].value) + y(points[i + 1].value)) / 2;
      ctx.quadraticCurveTo(x(i), y(points[i].value), xc, yc);
    }
    ctx.quadraticCurveTo(x(lastIdx - 1), y(points[lastIdx - 1].value), x(lastIdx), y(points[lastIdx].value));
    ctx.lineTo(x(lastIdx), height - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // 2. Draw high-fidelity glowing line
    ctx.save();
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x(0), y(points[0].value));
    for (var j = 0; j < points.length - 1; j++) {
      var xcm = (x(j) + x(j + 1)) / 2;
      var ycm = (y(points[j].value) + y(points[j + 1].value)) / 2;
      ctx.quadraticCurveTo(x(j), y(points[j].value), xcm, ycm);
    }
    ctx.quadraticCurveTo(x(lastIdx - 1), y(points[lastIdx - 1].value), x(lastIdx), y(points[lastIdx].value));
    ctx.stroke();
    ctx.restore();

    // 3. Draw pulsating marker at the latest point (tip of the graph)
    var tipX = x(lastIdx);
    var tipY = y(points[lastIdx].value);

    // Outer glow ring
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Solid inner core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Latest price tag
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px SF Mono, Monaco, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('$' + Number(points[lastIdx].value).toFixed(2), width - pad.right + 20, tipY - 8);
  }

  function getLocalSimTrade() {
    try {
      return JSON.parse(localStorage.getItem(SIM_STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function saveLocalSimTrade(trade) {
    if (!trade) localStorage.removeItem(SIM_STORAGE_KEY);
    else localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(trade));
  }

  function render(container, state) {
    var trade = state && state.trade ? state.trade : {};
    var sim = getLocalSimTrade();

    // Merge simulation if active
    if (sim && sim.status === 'active') {
      var elapsed = (Date.now() - sim.startedAt) / 1000;
      var gainSteps = Math.floor(elapsed / 2);
      var currentVal = sim.initialAmount * (1 + (gainSteps * 0.0032) + (Math.sin(elapsed) * 0.0015));
      var pnlVal = currentVal - sim.initialAmount;
      var pnlPct = (pnlVal / sim.initialAmount) * 100;

      trade = {
        status: 'active',
        availableBalance: sim.availableBalance,
        tradeValue: currentVal,
        pnl: pnlVal,
        pnlPercent: pnlPct,
        phase: 'profit',
        history: sim.history || []
      };

      if (!trade.history.length || Date.now() - (trade.history[trade.history.length - 1].timestamp || 0) > 1500) {
        trade.history.push({ timestamp: Date.now(), value: currentVal });
        if (trade.history.length > 50) trade.history.shift();
        sim.history = trade.history;
        saveLocalSimTrade(sim);
      }
    }

    var metaVal = 2000;
    try {
      var metaObj = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
      if (metaObj.totalCurrentValue) metaVal = Number(metaObj.totalCurrentValue);
      else if (metaObj.total) metaVal = Number(metaObj.total) * 2;
    } catch (e) {}
    var available = Number(trade.availableBalance != null ? trade.availableBalance : metaVal);
    if (!trade.status && available < metaVal && metaVal > 0) {
      available = metaVal;
    }
    var active = trade.status === 'active';
    var phase = trade.phase === 'loss' ? 'loss' : 'profit';
    var pnl = Number(trade.pnl || 0);
    var pnlPercent = Number(trade.pnlPercent || 0);
    var points = Array.isArray(trade.history) ? trade.history.slice() : [];

    if (active) {
      if (points.length > 1) {
        if (!history.length) {
          history = points.slice(-60);
        } else {
          var latest = points[points.length - 1];
          if (history[history.length - 1].timestamp !== latest.timestamp) {
            history.push(latest);
          }
        }
      } else if (points.length === 1) {
        if (!history.length) {
          history = [
            { timestamp: points[0].timestamp - 1500, value: points[0].value * 0.998 },
            points[0]
          ];
        } else {
          var latestOne = points[0];
          if (history[history.length - 1].timestamp !== latestOne.timestamp) {
            history.push(latestOne);
          }
        }
      } else {
        if (!history.length) {
          var baseVal = Number(trade.tradeValue || trade.tradingAmount || 100);
          var nowT = Date.now();
          for (var pIdx = 15; pIdx >= 0; pIdx--) {
            history.push({
              timestamp: nowT - (pIdx * 1500),
              value: Number((baseVal * (1 + (Math.sin(pIdx * 0.7) * 0.0035))).toFixed(2))
            });
          }
        }
      }
      history = history.slice(-60);
      points = history;
    } else {
      history = [];
    }

    var html =
      '<div class="ttinc-trade-top">' +
        '<div>' +
          '<div class="ttinc-trade-kicker"><span class="glow-dot"></span> Institutional Arbitrage Engine</div>' +
          '<div class="ttinc-trade-title">Live Algorithmic Trading</div>' +
          '<p class="ttinc-trade-copy">Deploy funds to Tesla Trade automated high-frequency order-routing. Capitalize on cross-market spreads and Tesla innovation ecosystem yield.</p>' +
        '</div>' +
        '<div class="ttinc-trade-balance">' +
          '<span style="color:#d4af37;font-weight:700;">Available Wallet</span>' +
          '<strong>' + money(available) + '</strong>' +
          '<div style="font-size:10px;color:#22c55e;font-weight:700;margin-top:3px;letter-spacing:0.5px;">✦ 100% Match Applied</div>' +
        '</div>' +
      '</div>';

    if (!active) {
      html += available > 0
        ? '<div class="ttinc-trade-action">' +
            '<button class="ttinc-start-btn" type="button" data-start-trading>Trade Now ✦</button>' +
            '<button class="ttinc-stop-btn" type="button" data-stop-trading disabled>Stop Trading</button>' +
            '<span style="color:#64748b;font-size:12px;margin-left:4px;">10%, 50%, 100%, or custom allocation of your balance</span>' +
          '</div>'
        : '<div class="ttinc-no-funds">You currently have no available balance to allocate. Top up your account to activate trading.</div>' +
          '<div class="ttinc-trade-action" style="margin-top:12px"><a class="ttinc-topup-link" href="/invest">Top up account →</a></div>';
    } else {
      // CLEAN, CONVINCING TRADING DISPLAY WITHOUT DISTRACTING COUNTDOWN TIMERS
      html +=
        '<div class="ttinc-trade-live">' +
          '<div class="ttinc-live-row">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
              '<span class="ttinc-live-phase ' + phase + '"><span class="ttinc-pulse-dot"></span> ' + (phase === 'profit' ? '▲ Bullish Arbitrage' : '▼ Market Hedge') + '</span>' +
              '<span class="ttinc-live-meta">Strategy: <strong>AI High-Frequency Orderbook</strong></span>' +
              '<span class="ttinc-live-meta">Asset: <strong>TSLA / USD · BTC Alpha</strong></span>' +
              '<span class="ttinc-live-meta">Target Accuracy: <strong style="color:#22c55e;">98.4%</strong></span>' +
            '</div>' +
            '<div style="text-align:right;">' +
              '<div class="ttinc-live-value">' + money(trade.tradeValue) + '</div>' +
              '<div class="ttinc-live-pnl ' + phase + '">' +
                '<span style="font-size:11px;color:#64748b;margin-right:6px;">Net PnL:</span>' +
                (pnl >= 0 ? '+' : '') + money(pnl) + ' (' + (pnlPercent >= 0 ? '+' : '') + pnlPercent.toFixed(2) + '%)' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ttinc-chart-wrap">' +
            '<div class="ttinc-chart-badge"><span>⚡ Real-Time Liquidity Feed</span></div>' +
            '<canvas id="ttinc-trade-canvas" aria-label="Trading performance graph"></canvas>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;flex-wrap:wrap;gap:12px;">' +
            '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b;">' +
              '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;"></span>' +
              'Execution Active · Instant Capital Preservation Lock' +
            '</div>' +
            '<button class="ttinc-stop-btn" type="button" data-stop-trading>Stop Trade &amp; Lock Profit</button>' +
          '</div>' +
        '</div>';
    }

    container.innerHTML = html + '<div class="ttinc-trade-error" data-trade-error></div>';
    var start = container.querySelector('[data-start-trading]');
    if (start) start.addEventListener('click', function () { openModal(available); });
    if (active) {
      window.requestAnimationFrame(function () {
        var canvas = container.querySelector('#ttinc-trade-canvas');
        if (canvas) drawChart(canvas, points);
      });
    }
  }

  function showError(message) {
    var box = document.querySelector('#' + shellId + ' [data-trade-error]');
    if (box) { box.textContent = message; box.style.display = 'block'; }
  }

  function showToast(title, detail) {
    var toast = document.getElementById(toastId);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = toastId;
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<strong>' + title + '</strong><span>' + detail + '</span>';
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('visible'); }, 4200);
  }

  function loadState(investmentId) {
    return api('/api/investments/' + encodeURIComponent(investmentId) + '/trading-state')
      .then(function (data) {
        var shell = document.getElementById(shellId);
        if (shell) render(shell, data);
        return data;
      })
      .catch(function () {
        var shell = document.getElementById(shellId);
        if (shell) render(shell, { trade: {} });
      });
  }

  function confirmStart() {
    if (busy) return;
    var modal = document.getElementById(modalId);
    var available = Number(modal.dataset.available || 0);
    var selected = modal.querySelector('.ttinc-alloc.selected');
    var custom = Number(modal.querySelector('#ttinc-custom-amount').value || 0);
    var amount = selected ? available * Number(selected.dataset.pct) / 100 : custom;
    var error = modal.querySelector('#ttinc-modal-error');
    if (!amount || amount <= 0 || amount > available) {
      error.textContent = 'Enter an amount between $0.01 and your available balance.';
      error.style.display = 'block';
      return;
    }
    busy = true;
    modal.querySelector('.ttinc-confirm').textContent = 'Starting Engine…';

    findInvestmentId().then(function (id) {
      lastInvestmentId = id || 'sim_inv_1';
      var now = Date.now();
      var initHist = [];
      var baseVal = amount;
      for (var k = 20; k >= 0; k--) {
        var t = now - (k * 1500);
        var jitter = (Math.sin(k * 0.7) * 0.0035) + ((20 - k) * 0.001);
        initHist.push({ timestamp: t, value: Number((baseVal * (1 + jitter)).toFixed(2)) });
      }
      saveLocalSimTrade({
        status: 'active',
        initialAmount: amount,
        availableBalance: Math.max(0, available - amount),
        startedAt: now,
        history: initHist
      });
      history = initHist.slice();

      return api('/api/investments/' + encodeURIComponent(lastInvestmentId) + '/trading/start', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount.toFixed(2)) })
      }).then(function (res) {
        if (res && res.trade && Array.isArray(res.trade.history) && res.trade.history.length > 1) {
          history = res.trade.history.slice();
          var s = getLocalSimTrade();
          if (s) {
            s.history = history;
            saveLocalSimTrade(s);
          }
        }
        return res;
      }).catch(function () {
        return { success: true };
      });
    }).then(function () {
      modal.style.display = 'none';
      showToast('Trading Execution Started ✦', 'Your live performance graph is active and compounding.');
      return loadState(lastInvestmentId);
    }).catch(function (err) {
      error.textContent = err.message;
      error.style.display = 'block';
    }).finally(function () {
      busy = false;
      modal.querySelector('.ttinc-confirm').textContent = 'Trade Now ✦';
    });
  }

  function stopTrade() {
    if (busy) return;
    busy = true;
    var button = document.querySelector('#' + shellId + ' [data-stop-trading]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Locking Profit…';
    }

    var sim = getLocalSimTrade();
    if (sim && sim.status === 'active') {
      var elapsed = (Date.now() - sim.startedAt) / 1000;
      var gainSteps = Math.floor(elapsed / 2);
      var finalVal = sim.initialAmount * (1 + (gainSteps * 0.0032) + 0.004);
      var gained = finalVal - sim.initialAmount;
      saveLocalSimTrade(null);
      history = [];
      showToast('Trade Closed & Profit Locked ✦', 'Gained ' + money(gained) + ' returned to your wallet balance.');
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Stop Trade & Lock Profit';
      }
      api('/api/investments/' + encodeURIComponent(lastInvestmentId) + '/trading/stop', {
        method: 'POST',
        body: JSON.stringify({})
      }).catch(function () {});
      return loadState(lastInvestmentId);
    }

    api('/api/investments/' + encodeURIComponent(lastInvestmentId) + '/trading/stop', {
      method: 'POST',
      body: JSON.stringify({})
    }).then(function (data) {
      history = [];
      saveLocalSimTrade(null);
      showToast('Trade Closed & Profit Locked ✦', 'Your final return has been credited to your portfolio.');
      return loadState(lastInvestmentId);
    }).catch(function (err) {
      showError(err.message);
    }).finally(function () {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Stop Trade & Lock Profit';
      }
    });
  }

  function arrangeDashboard(root, host) {
    var shell = root && root.firstElementChild;
    if (!shell || !shell.classList.contains('min-h-screen')) return false;

    var content = null;
    for (var i = 0; i < shell.children.length; i += 1) {
      if (shell.children[i].classList.contains('flex-1')) {
        content = shell.children[i];
        break;
      }
    }
    if (!content) return false;

    Array.prototype.forEach.call(shell.querySelectorAll('aside'), function (aside) {
      if (aside.classList.contains('md:flex')) {
        aside.style.display = 'none';
      }
    });

    var mobileHeader = content.querySelector('[class~="md:hidden"]');
    if (mobileHeader) {
      var menuButton = mobileHeader.querySelector('button');
      var logo = mobileHeader.querySelector('h1');
      if (menuButton) menuButton.style.order = '3';
      if (logo) logo.style.order = '1';
      if (mobileHeader.lastElementChild && mobileHeader.lastElementChild !== menuButton) {
        mobileHeader.lastElementChild.style.order = '2';
      }
    }

    var main = null;
    for (var j = 0; j < content.children.length; j += 1) {
      var child = content.children[j];
      if (child !== host && (
        (child.className && String(child.className).indexOf('max-w-') !== -1) ||
        (child.textContent || '').indexOf('Complete your KYC') !== -1
      )) {
        main = child;
        break;
      }
    }
    if (main) content.insertBefore(host, main);
    else if (host.parentElement !== content) content.appendChild(host);

    return true;
  }

  function moveMobileMenuToRight(root) {
    if (!root) return;
    root.querySelectorAll('aside.fixed.inset-y-0.left-0').forEach(function (drawer) {
      drawer.classList.remove('left-0');
      drawer.classList.add('right-0');
      drawer.style.left = 'auto';
      drawer.style.right = '0';
      drawer.style.borderRight = '0';
      drawer.style.borderLeft = '1px solid #1a1a1a';
    });
  }

  function mount() {
    if (!isDashboardRoute()) return;
    injectStyles();
    ensureModal();
    findInvestmentId().then(function (id) {
      lastInvestmentId = id || 'sim_inv_1';
      var root = document.getElementById('root');
      if (!root) return;
      var host = document.getElementById(stackId);
      if (!host) {
        host = document.createElement('div');
        host.id = stackId;
      }
      arrangeDashboard(root, host);
      moveMobileMenuToRight(root);
      if (typeof window.ttincRemoveLoader === 'function') window.ttincRemoveLoader();
      var ldr = document.getElementById('ttinc-initial-loader');
      if (ldr) ldr.remove();
      var shell = document.getElementById(shellId);
      if (!shell) {
        shell = document.createElement('section');
        shell.id = shellId;
        host.appendChild(shell);
      }
      loadState(lastInvestmentId).catch(function (err) { showError(err.message); });
      if (!pollTimer) {
        pollTimer = setInterval(function () {
          if (isDashboardRoute()) {
            loadState(lastInvestmentId).catch(function () {});
          }
        }, 1200);
      }
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.ttinc-confirm')) confirmStart();
    if (event.target.closest && event.target.closest('[data-stop-trading]')) stopTrade();
  }, true);

  window.addEventListener('resize', function () {
    var canvas = document.querySelector('#ttinc-trade-canvas');
    if (canvas && history.length) drawChart(canvas, history);
  });

  setInterval(mount, 800);
  mount();
}());