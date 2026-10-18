/*
 * Investor trading flow
 *
 * This is intentionally framework-free because the dashboard is a compiled
 * SPA. It mounts alongside the existing dashboard without replacing it and
 * uses the same session-protected API as the PHP application.
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
    // The account overview is the main dashboard. Keep the same live trading
    // surface available there as well as on the full portfolio screen.
    return location.pathname === '/dashboard' || location.pathname === '/overview';
  }

  function findInvestmentId() {
    var id = localStorage.getItem('ttinc_investment_id') || '';
    if (id) return Promise.resolve(id);
    var currentUser = auth();
    if (!currentUser || !currentUser.email) return Promise.resolve('');
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
          return first.id;
        }
        return '';
      })
      .catch(function () { return ''; });
  }

  function injectStyles() {
    if (document.getElementById('ttinc-trading-flow-styles')) return;
    var style = document.createElement('style');
    style.id = 'ttinc-trading-flow-styles';
    style.textContent =
      '#ttinc-trading-flow{background:#111;border:1px solid #262626;border-radius:18px;padding:20px;margin:0 0 20px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.18)}' +
       '#ttinc-dashboard-addon-stack{width:100%;max-width:1024px;margin:0 auto;padding:0 16px 24px;box-sizing:border-box}' +
      '#ttinc-trading-flow *{box-sizing:border-box}' +
      '.ttinc-trade-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}' +
      '.ttinc-trade-kicker{color:#d4af37;font-size:10px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase}' +
      '.ttinc-trade-title{font-size:22px;font-weight:900;letter-spacing:-.5px;margin:5px 0 5px}' +
      '.ttinc-trade-copy{color:#88909c;font-size:12px;line-height:1.55;margin:0;max-width:560px}' +
      '.ttinc-trade-balance{background:#0a0a0a;border:1px solid #282828;border-radius:11px;padding:10px 13px;min-width:142px;text-align:right}' +
      '.ttinc-trade-balance span{display:block;color:#777;font-size:10px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px}' +
      '.ttinc-trade-balance strong{font-size:16px;color:#fff}' +
      '.ttinc-trade-action{display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
      '.ttinc-start-btn{background:#e31937;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:12px;font-weight:900;letter-spacing:.7px;text-transform:uppercase;cursor:pointer}' +
      '.ttinc-start-btn:hover{filter:brightness(1.12)}' +
      '.ttinc-topup-link{color:#d4af37;text-decoration:none;border:1px solid #4a3c0d;border-radius:9px;padding:11px 14px;font-size:12px;font-weight:800}' +
      '.ttinc-no-funds{background:#24110f;border:1px solid #8b3028;border-radius:10px;color:#fca5a5;padding:12px;font-size:12px;line-height:1.55;margin-top:4px}' +
      '.ttinc-trade-live{border-top:1px solid #242424;padding-top:16px}' +
      '.ttinc-live-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:11px}' +
      '.ttinc-live-phase{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;padding:6px 10px;border-radius:999px}' +
      '.ttinc-live-phase.profit{color:#4ade80;background:#052e16;border:1px solid #166534}.ttinc-live-phase.loss{color:#f87171;background:#3b0a0a;border:1px solid #991b1b}' +
      '.ttinc-live-value{font-size:24px;font-weight:900}.ttinc-live-pnl{font-size:12px;font-weight:800;margin-left:8px}.ttinc-live-pnl.profit{color:#4ade80}.ttinc-live-pnl.loss{color:#f87171}' +
      '.ttinc-chart-wrap{height:190px;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:12px;padding:8px;margin-top:12px}.ttinc-chart-wrap canvas{display:block;width:100%;height:100%}' +
      '.ttinc-stop-btn{background:#c8102e;color:#fff;border:0;border-radius:9px;padding:11px 14px;font-size:12px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;cursor:pointer}.ttinc-stop-btn:hover{background:#e31937}.ttinc-stop-btn:disabled{opacity:.55;cursor:not-allowed}' +
      '.ttinc-trade-error{display:none;color:#fca5a5;font-size:12px;margin-top:10px;line-height:1.5}' +
      '#ttinc-trade-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:330px;background:linear-gradient(135deg,#171717,#241014);border:1px solid #e31937;border-radius:14px;padding:14px 16px;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.45);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .2s ease,transform .2s ease}#ttinc-trade-toast.visible{opacity:1;transform:translateY(0)}#ttinc-trade-toast strong{display:block;font-size:13px;margin-bottom:3px}#ttinc-trade-toast span{display:block;color:#cbd5e1;font-size:11px;line-height:1.45}' +
      '#ttinc-trading-modal{position:fixed;inset:0;background:rgba(0,0,0,.78);display:none;align-items:center;justify-content:center;padding:18px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      '.ttinc-modal-card{width:100%;max-width:440px;background:#111;border:1px solid #333;border-radius:17px;padding:22px;box-shadow:0 20px 70px rgba(0,0,0,.55)}' +
      '.ttinc-modal-card h3{margin:0 0 6px;color:#fff;font-size:19px}.ttinc-modal-card p{color:#8b929d;font-size:12px;line-height:1.55;margin:0 0 17px}' +
      '.ttinc-alloc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.ttinc-alloc{background:#0a0a0a;border:1px solid #2d2d2d;color:#bfc3ca;border-radius:9px;padding:11px 7px;font-weight:800;cursor:pointer}.ttinc-alloc.selected{color:#fff;border-color:#e31937;background:#26070c}' +
      '.ttinc-custom-label{display:block;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.7px;margin:10px 0 6px}.ttinc-custom-input{width:100%;background:#0a0a0a;border:1px solid #333;border-radius:9px;color:#fff;padding:12px;font:inherit;outline:none}.ttinc-modal-actions{display:flex;gap:8px;margin-top:18px}.ttinc-modal-actions button{flex:1;border-radius:9px;padding:12px;font-weight:800;cursor:pointer}.ttinc-cancel{background:#1b1b1b;color:#aaa;border:1px solid #333}.ttinc-confirm{background:#e31937;color:#fff;border:1px solid #e31937}.ttinc-modal-error{display:none;color:#fca5a5;font-size:12px;margin-top:10px}' +
      '@media(max-width:640px){#root{width:100%;overflow-x:hidden}#root [class*="max-w-4xl"],#root [class*="max-w-5xl"],#root [class*="max-w-2xl"]{max-width:none!important;width:100%!important}#root [class*="px-6"]{padding-left:16px!important;padding-right:16px!important}#root [class*="p-6"]{padding:16px!important}#root [class*="text-5xl"]{font-size:2.35rem!important}#root [class*="grid-cols-3"]{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}}' +
       '@media(max-width:560px){#ttinc-trading-flow{padding:16px;border-radius:14px;margin-top:0}.ttinc-trade-top{display:block}.ttinc-trade-balance{margin-top:13px;text-align:left}.ttinc-trade-action{display:flex;flex-direction:column;align-items:stretch;gap:10px}.ttinc-trade-action .ttinc-start-btn,.ttinc-trade-action .ttinc-stop-btn{width:100%}.ttinc-live-value{font-size:21px}.ttinc-stop-btn{width:100%}#ttinc-trade-toast{left:14px;right:14px;bottom:14px;max-width:none}}' +
      '#root > div.flex.min-h-screen > div.flex-1{width:100%;min-width:0}' +
      '#root > div.flex.min-h-screen > div.flex-1 > [class~="md:hidden"] button{order:3}' +
      '#root > div.flex.min-h-screen > div.flex-1 > [class~="md:hidden"] h1{order:1}' +
      '#root > div.flex.min-h-screen > div.flex-1 > [class~="md:hidden"] > div{order:2}' +
      '@media(max-width:767px){#ttinc-dashboard-addon-stack{padding-left:16px;padding-right:16px}#root > div.flex.min-h-screen > div.flex-1 > [class~="md:hidden"]{padding-left:16px!important;padding-right:16px!important}}';
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById(modalId)) return;
    var modal = document.createElement('div');
    modal.id = modalId;
    modal.innerHTML =
      '<div class="ttinc-modal-card" role="dialog" aria-modal="true" aria-labelledby="ttinc-modal-title">' +
        '<h3 id="ttinc-modal-title">Choose trading amount</h3>' +
         '<p>Use a portion of your wallet balance. Your live performance graph will show every move while the trade is running.</p>' +
        '<div class="ttinc-alloc-grid">' +
          '<button class="ttinc-alloc" data-pct="10">10%</button>' +
          '<button class="ttinc-alloc" data-pct="50">50%</button>' +
          '<button class="ttinc-alloc" data-pct="100">100%</button>' +
        '</div>' +
        '<label class="ttinc-custom-label" for="ttinc-custom-amount">Custom amount (USD)</label>' +
        '<input id="ttinc-custom-amount" class="ttinc-custom-input" type="number" min="0.01" step="0.01" placeholder="Enter an amount">' +
        '<div id="ttinc-modal-error" class="ttinc-modal-error"></div>' +
        '<div class="ttinc-modal-actions"><button class="ttinc-cancel" type="button">Cancel</button><button class="ttinc-confirm" type="button">Start trading</button></div>' +
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
    modal.querySelector('.ttinc-alloc').focus();
  }

  function drawChart(canvas, points) {
    if (!canvas || !points || !points.length) return;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(260, Math.floor(rect.width));
    var height = Math.max(120, Math.floor(rect.height));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    var pad = { left: 8, right: 8, top: 14, bottom: 14 };
    var min = Math.min.apply(null, points.map(function (p) { return Number(p.value); }));
    var max = Math.max.apply(null, points.map(function (p) { return Number(p.value); }));
    var range = Math.max(0.01, max - min);
    var x = function (index) {
      return pad.left + (width - pad.left - pad.right) * (points.length === 1 ? .5 : index / (points.length - 1));
    };
    var y = function (value) {
      return height - pad.bottom - ((Number(value) - min) / range) * (height - pad.top - pad.bottom);
    };
    ctx.strokeStyle = '#20252b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, height - pad.bottom);
    ctx.lineTo(width - pad.right, height - pad.bottom);
    ctx.stroke();
    if (points.length === 1) {
      ctx.fillStyle = '#d4af37';
      ctx.beginPath(); ctx.arc(x(0), y(points[0].value), 4, 0, Math.PI * 2); ctx.fill();
      return;
    }
    for (var i = 1; i < points.length; i++) {
      var rising = Number(points[i].value) >= Number(points[i - 1].value);
      ctx.strokeStyle = rising ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x(i - 1), y(points[i - 1].value));
      ctx.lineTo(x(i), y(points[i].value));
      ctx.stroke();
    }
    ctx.fillStyle = '#d4af37';
    ctx.beginPath(); ctx.arc(x(points.length - 1), y(points[points.length - 1].value), 4, 0, Math.PI * 2); ctx.fill();
  }

  function render(container, state) {
    var trade = state && state.trade ? state.trade : {};
    var available = Number(trade.availableBalance || 0);
    var active = trade.status === 'active';
    var phase = trade.phase === 'loss' ? 'loss' : 'profit';
    var pnl = Number(trade.pnl || 0);
    var pnlPercent = Number(trade.pnlPercent || 0);
    var points = Array.isArray(trade.history) ? trade.history.slice() : [];
    if (active && points.length) {
      var latest = points[points.length - 1];
      if (!history.length || history[history.length - 1].timestamp !== latest.timestamp) history.push(latest);
      history = history.slice(-60);
      points = history;
    } else if (!active) {
      history = [];
    }
    var html =
      '<div class="ttinc-trade-top"><div><div class="ttinc-trade-kicker">Live trading</div><div class="ttinc-trade-title">Start trading</div><p class="ttinc-trade-copy">Choose how much of your wallet balance to put to work. Watch the live graph move up and down while your trade is running.</p></div>' +
      '<div class="ttinc-trade-balance"><span>Wallet balance</span><strong>' + money(available) + '</strong></div></div>';
    if (!active) {
      html += available > 0
        ? '<div class="ttinc-trade-action"><button class="ttinc-start-btn" type="button" data-start-trading>Start trading</button><button class="ttinc-stop-btn" type="button" data-stop-trading disabled>Stop trading</button><span style="color:#777;font-size:11px">10%, 50%, 100%, or a custom amount of your wallet balance</span></div>'
        : '<div class="ttinc-no-funds">You have no available funds to trade. Top up your account to continue.</div><div class="ttinc-trade-action" style="margin-top:10px"><a class="ttinc-topup-link" href="/invest">Top up account</a></div>';
    } else {
      html += '<div class="ttinc-trade-live"><div class="ttinc-live-row"><div><span class="ttinc-live-phase ' + phase + '">' + (phase === 'profit' ? '↑ Up' : '↓ Down') + '</span><span style="color:#777;font-size:11px;margin-left:8px">Live for ' + Number(trade.elapsedSeconds || 0) + 's · ' + (phase === 'profit' ? 'profit' : 'loss') + ' window: ' + Number(trade.phaseRemainingSeconds || 0) + 's left</span></div><div><span class="ttinc-live-value">' + money(trade.tradeValue) + '</span><span class="ttinc-live-pnl ' + phase + '">' + (pnl >= 0 ? '+' : '') + money(pnl) + ' (' + (pnlPercent >= 0 ? '+' : '') + pnlPercent.toFixed(2) + '%)</span></div></div><div class="ttinc-chart-wrap"><canvas id="ttinc-trade-canvas" aria-label="Trading performance graph"></canvas></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="ttinc-stop-btn" type="button" data-stop-trading>Stop trade</button></div></div>';
    }
    container.innerHTML = html + '<div class="ttinc-trade-error" data-trade-error></div>';
    var start = container.querySelector('[data-start-trading]');
    if (start) start.addEventListener('click', function () { openModal(available); });
    if (active) drawChart(container.querySelector('#ttinc-trade-canvas'), points);
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
    modal.querySelector('.ttinc-confirm').textContent = 'Starting…';
    findInvestmentId().then(function (id) {
      if (!id) throw new Error('Your active investment could not be found.');
      lastInvestmentId = id;
      return api('/api/investments/' + encodeURIComponent(id) + '/trading/start', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount.toFixed(2)) })
      });
    }).then(function () {
      modal.style.display = 'none';
      history = [];
      showToast('Your trade has started ✦', 'Your live performance graph is ready.');
      return loadState(lastInvestmentId);
    }).catch(function (err) {
      error.textContent = err.message;
      error.style.display = 'block';
    }).finally(function () {
      busy = false;
      modal.querySelector('.ttinc-confirm').textContent = 'Start trading';
    });
  }

  function stopTrade() {
    if (busy || !lastInvestmentId) return;
    var button = document.querySelector('#' + shellId + ' [data-stop-trading]');
    busy = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Stopping…';
    }
    api('/api/investments/' + encodeURIComponent(lastInvestmentId) + '/trading/stop', {
      method: 'POST',
      body: JSON.stringify({})
    }).then(function (data) {
      history = [];
      showToast('Trade stopped safely', 'Your final result is now back in your portfolio.');
      return loadState(lastInvestmentId);
    }).catch(function (err) {
      showError(err.message);
    }).finally(function () {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Stop trade';
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

    // Remove the desktop left rail; the existing mobile menu button remains
    // in the header and is repositioned to the right below.
    Array.prototype.forEach.call(shell.querySelectorAll('aside'), function (aside) {
      if (aside.classList.contains('md:flex')) {
        aside.style.display = 'none';
      }
    });

    // Keep the existing mobile header, but put its hamburger on the right.
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

    // Put the trading card after the dashboard header and before KYC/balance.
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
      if (!id) return;
      lastInvestmentId = id;
       var root = document.getElementById('root');
       if (!root) return;
       var host = document.getElementById(stackId);
       if (!host) {
         host = document.createElement('div');
         host.id = stackId;
       }
       arrangeDashboard(root, host);
       moveMobileMenuToRight(root);
      var shell = document.getElementById(shellId);
       if (shell) return;
      if (!shell) {
        shell = document.createElement('section');
        shell.id = shellId;
        host.appendChild(shell);
      }
      loadState(id).catch(function (err) { showError(err.message); });
      if (!pollTimer) {
        pollTimer = setInterval(function () {
          if (isDashboardRoute() && lastInvestmentId) {
            loadState(lastInvestmentId).catch(function () {});
          }
        }, 1000);
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
  setInterval(mount, 700);
  mount();
}());