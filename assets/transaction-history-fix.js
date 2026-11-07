(function () {
  'use strict';

  var HISTORY_ID = 'ttinc-transaction-history';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character];
    });
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function labelForType(type) {
    return ({
      deposit: 'Deposit',
      trade_debit: 'Trade debit',
      trade_credit: 'Trade credit',
      bonus: 'Deposit bonus',
      withdrawal: 'Withdrawal',
      return: 'Investment return',
      profit: 'Trading profit',
      loss: 'Trading loss',
      fee: 'Fee',
    })[String(type || '').toLowerCase()] || 'Account activity';
  }

  function statusLabel(status) {
    var value = String(status || '').toLowerCase();
    if (value === 'processed' || value === 'active' || value === 'completed') return 'Completed';
    if (value === 'pending' || value === 'pending_approval') return 'Pending';
    if (value === 'declined' || value === 'failed' || value === 'rejected') return 'Declined';
    return status || 'Pending';
  }

  function statusColors(status) {
    var label = statusLabel(status);
    if (label === 'Completed') return 'color:#34d399;background:#064e3b';
    if (label === 'Pending') return 'color:#facc15;background:#422006';
    return 'color:#f87171;background:#450a0a';
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderLoading(root) {
    root.innerHTML =
      '<div id="' + HISTORY_ID + '" style="min-height:100vh;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:28px 16px;">' +
        '<div style="max-width:900px;margin:0 auto;">' +
          '<div style="color:#64748b;font-size:12px;padding:50px 0;text-align:center;">Loading your transaction history…</div>' +
        '</div>' +
      '</div>';
  }

  var DASHBOARD_HISTORY_ID = 'ttinc-dashboard-history';

  function dashboardAuth() {
    try { return JSON.parse(localStorage.getItem('ttinc_auth') || 'null'); }
    catch (error) { return null; }
  }

  function isDashboardRoute() {
    var path = String(window.location.pathname || '').toLowerCase();
    if (path === '/overview' || path === '/dashboard' ||
        path.indexOf('/overview/') === 0 || path.indexOf('/dashboard/') === 0 ||
        path.indexOf('/portfolio') === 0) return true;
    return path === '/' && !!document.getElementById('ttinc-dashboard-addon-stack');
  }

  function renderDashboardHistory(rows, email) {
    if (!isDashboardRoute()) return;
    var root = document.getElementById('root');
    if (!root) return;
    var host = document.getElementById('ttinc-dashboard-addon-stack') || root;
    var card = document.getElementById(DASHBOARD_HISTORY_ID);
    if (!card) {
      card = document.createElement('section');
      card.id = DASHBOARD_HISTORY_ID;
      card.setAttribute('aria-label', 'Recent transaction history');
      card.style.cssText = 'box-sizing:border-box;width:100%;margin:18px 0;padding:16px;background:#111;border:1px solid #252525;border-radius:14px;color:#fff;font-family:Arial,sans-serif;';
      if (host.id === 'ttinc-dashboard-addon-stack' && host.parentNode) {
        host.parentNode.insertBefore(card, host.nextSibling);
      } else {
        host.appendChild(card);
      }
    }
    var items = (Array.isArray(rows) ? rows : []).slice(0, 5);
    var list = items.length ? items.map(function (item) {
      var type = String(item.type || '').toLowerCase();
      var positive = ['deposit','return','profit','bonus','trade_credit','credit'].indexOf(type) !== -1;
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:11px 0;border-bottom:1px solid #202020;">' +
        '<div style="min-width:0;"><div style="font-size:13px;color:#f3f4f6;font-weight:700;">' + escapeHtml(labelForType(type)) + '</div>' +
        '<div style="font-size:11px;color:#78808e;margin-top:4px;">' + escapeHtml(formatDate(item.createdAt || item.created_at)) +
        (item.method ? ' · ' + escapeHtml(item.method) : '') + '</div></div>' +
        '<div style="text-align:right;white-space:nowrap;"><div style="font-size:13px;font-weight:800;color:' + (positive ? '#34d399' : '#f87171') + ';">' +
        (positive ? '+' : '−') + money(item.amount) + '</div><div style="font-size:10px;color:#94a3b8;margin-top:4px;">' + escapeHtml(statusLabel(item.status)) + '</div></div></div>';
    }).join('') : '<div style="padding:18px 0;color:#78808e;font-size:12px;">No transaction records yet.</div>';
    card.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">' +
      '<div><div style="font-size:14px;font-weight:800;letter-spacing:.02em;">Recent history</div>' +
      '<div style="font-size:11px;color:#78808e;margin-top:4px;">Latest account activity from your transaction ledger</div></div>' +
      '<a href="/transactions" style="color:#f05a6e;text-decoration:none;font-size:11px;font-weight:800;white-space:nowrap;">View all →</a></div>' +
      list;
    card.setAttribute('data-email', email);
  }

  var dashboardHistoryInFlight = false;
  var dashboardHistoryLastEmail = '';
  var dashboardHistoryLastFetch = 0;
  function loadDashboardHistory(force) {
    if (!isDashboardRoute()) {
      var old = document.getElementById(DASHBOARD_HISTORY_ID);
      if (old) old.remove();
      dashboardHistoryLastEmail = '';
      return;
    }
    var root = document.getElementById('root');
    var auth = dashboardAuth();
    if (!root || !auth || !auth.email || dashboardHistoryInFlight) return;
    var email = String(auth.email).toLowerCase();
    var now = Date.now();
    if (!force && email === dashboardHistoryLastEmail && now - dashboardHistoryLastFetch < 20000 &&
        document.getElementById(DASHBOARD_HISTORY_ID)) return;
    dashboardHistoryInFlight = true;
    dashboardHistoryLastEmail = email;
    dashboardHistoryLastFetch = now;
    fetch('/api/transactions?email=' + encodeURIComponent(email), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('History temporarily unavailable');
      return response.json();
    }).then(function (rows) {
      var currentAuth = dashboardAuth();
      if (isDashboardRoute() && currentAuth && String(currentAuth.email || '').toLowerCase() === email) {
        renderDashboardHistory(rows, email);
      }
    }).catch(function () {
      // Leave the existing dashboard and portfolio untouched if the ledger is unavailable.
    }).finally(function () { dashboardHistoryInFlight = false; });
  }

  setTimeout(function () { loadDashboardHistory(true); }, 900);
  setInterval(function () { loadDashboardHistory(false); }, 5000);
  if (typeof MutationObserver !== 'undefined' && document.body) {
    var dashboardHistoryObserver = new MutationObserver(function () {
      if (isDashboardRoute() && !document.getElementById(DASHBOARD_HISTORY_ID)) loadDashboardHistory(true);
    });
    dashboardHistoryObserver.observe(document.body, { childList: true, subtree: true });
  }

  function renderTransactions(rows) {
    var root = document.getElementById('root');
    if (!root || window.location.pathname !== '/transactions') return;
    var items = Array.isArray(rows) ? rows : [];
    var totalDeposits = items.filter(function (item) { return item.type === 'deposit'; })
      .reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    var totalWithdrawals = items.filter(function (item) { return item.type === 'withdrawal'; })
      .reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    var totalCredits = items.filter(function (item) {
      return item.type === 'deposit' || item.type === 'return' || item.type === 'profit' || item.type === 'bonus' || item.type === 'trade_credit' || item.type === 'credit';
    }).reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    var totalDebits = items.filter(function (item) {
      return item.type === 'withdrawal' || item.type === 'loss' || item.type === 'fee' || item.type === 'trade_debit' || item.type === 'debit';
    }).reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    var pending = items.filter(function (item) { return statusLabel(item.status) === 'Pending'; }).length;

    var content = items.length
      ? items.map(function (item) {
          var type = String(item.type || '').toLowerCase();
          var positive = type === 'deposit' || type === 'return' || type === 'profit' || type === 'bonus' || type === 'trade_credit' || type === 'credit';
          return (
            '<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1.1fr 1fr;align-items:center;gap:12px;padding:15px 16px;border-bottom:1px solid #171717;">' +
              '<div style="display:flex;align-items:center;gap:9px;color:#fff;font-size:13px;min-width:0;">' +
                '<span style="width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:' + (positive ? '#064e3b' : '#450a0a') + ';color:' + (positive ? '#34d399' : '#f87171') + ';font-size:15px;">' + (positive ? '+' : '−') + '</span>' +
                '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(labelForType(type)) + '</span>' +
              '</div>' +
              '<div style="font-size:12px;color:#94a3b8;">' + escapeHtml(formatDate(item.createdAt || item.created_at)) + '</div>' +
              '<div style="font-family:monospace;font-size:14px;font-weight:700;color:' + (positive ? '#34d399' : '#f87171') + ';">' + (positive ? '+' : '−') + money(item.amount) + '</div>' +
              '<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.method || item.note || '—') + '</div>' +
              '<div><span style="display:inline-block;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' + statusColors(item.status) + ';">' + escapeHtml(statusLabel(item.status)) + '</span></div>' +
            '</div>'
          );
        }).join('')
      : '<div style="padding:48px 20px;text-align:center;color:#64748b;font-size:14px;">No transactions yet.</div>';

    root.innerHTML =
      '<div id="' + HISTORY_ID + '" style="min-height:100vh;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:28px 16px;">' +
        '<div style="max-width:900px;margin:0 auto;">' +
          '<a href="/overview" style="display:inline-block;color:#94a3b8;text-decoration:none;font-size:12px;margin-bottom:26px;">Back to overview</a>' +
          '<h1 style="font-size:26px;line-height:1.1;margin:0 0 6px;text-transform:uppercase;"><span style="color:#e31937;">Transaction</span> history</h1>' +
          '<p style="color:#94a3b8;font-size:13px;margin:0 0 24px;">A complete record of credits, debits, trading profit/loss, deposits, and withdrawals.</p>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">' +
            '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:14px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;">Credits</div><strong style="display:block;margin-top:6px;font-size:18px;color:#34d399;">' + money(totalCredits) + '</strong></div>' +
            '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:14px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;">Debits</div><strong style="display:block;margin-top:6px;font-size:18px;color:#f87171;">' + money(totalDebits) + '</strong></div>' +
            '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:14px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;">Deposits</div><strong style="display:block;margin-top:6px;font-size:18px;">' + money(totalDeposits) + '</strong></div>' +
            '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:14px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;">Withdrawals</div><strong style="display:block;margin-top:6px;font-size:18px;">' + money(totalWithdrawals) + '</strong></div>' +
            '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:14px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;">Pending items</div><strong style="display:block;margin-top:6px;font-size:18px;">' + pending + '</strong></div>' +
          '</div>' +
          '<div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;overflow:auto;">' +
            '<div style="min-width:680px;">' +
              '<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1.1fr 1fr;gap:12px;padding:11px 16px;border-bottom:1px solid #1e1e1e;color:#64748b;font-size:9px;letter-spacing:.12em;text-transform:uppercase;"><span>Type</span><span>Date</span><span>Amount</span><span>Method</span><span>Status</span></div>' +
              content +
            '</div>' +
          '</div>' +
          '<p style="color:#64748b;font-size:11px;line-height:1.6;margin-top:16px;">Amounts are shown as recorded by your account ledger. Pending withdrawals remain pending until the admin review is complete.</p>' +
        '</div>' +
      '</div>';
  }

  function loadTransactions() {
    var root = document.getElementById('root');
    if (window.location.pathname !== '/transactions') {
      // React keeps the same #root element while changing screens. Clear the
      // per-user marker when leaving this route so a later visit fetches fresh
      // server data instead of being mistaken for the already-rendered page.
      if (root) {
        root.removeAttribute('data-ttinc-transactions');
        root.removeAttribute('data-ttinc-transactions-loading');
      }
      return;
    }

    var raw = localStorage.getItem('ttinc_auth');
    if (!root) return;
    if (!raw) {
      window.location.replace('/login');
      return;
    }

    var auth;
    try { auth = JSON.parse(raw); } catch (error) { auth = null; }
    if (!auth || !auth.email) {
      window.location.replace('/login');
      return;
    }

    // Do not refetch while our view is still mounted, but do refetch after
    // React has replaced it during a route change. The old email-only guard
    // left users looking at the compiled component's stale empty state.
    if (
      root.getAttribute('data-ttinc-transactions') === auth.email &&
      document.getElementById(HISTORY_ID)
    ) return;
    if (root.getAttribute('data-ttinc-transactions-loading') === auth.email) return;

    root.setAttribute('data-ttinc-transactions', auth.email);
    root.setAttribute('data-ttinc-transactions-loading', auth.email);
    renderLoading(root);

    fetch('/api/transactions?email=' + encodeURIComponent(auth.email), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Could not load transactions');
        return response.json();
      })
      .then(renderTransactions)
      .catch(function () {
        if (!root || window.location.pathname !== '/transactions') return;
        root.innerHTML = '<div id="' + HISTORY_ID + '" style="min-height:100vh;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:48px 16px;text-align:center;"><div style="max-width:520px;margin:0 auto;"><h2 style="font-size:20px;margin:0 0 10px;">History could not be loaded</h2><p style="color:#94a3b8;font-size:13px;line-height:1.6;">Your transaction records have not been marked as empty. The account ledger could not be reached. Please retry.</p><button type="button" id="ttinc-retry-history" style="margin-top:12px;padding:11px 18px;border:0;border-radius:8px;background:#e31937;color:#fff;font-weight:700;">Retry</button><p style="margin-top:20px;"><a href="/overview" style="color:#94a3b8;font-size:12px;">Back to overview</a></p></div></div>';
        var retry = document.getElementById('ttinc-retry-history');
        if (retry) retry.addEventListener('click', function () {
          root.removeAttribute('data-ttinc-transactions');
          root.removeAttribute('data-ttinc-transactions-loading');
          loadTransactions();
        });
      })
      .then(function () {
        root.removeAttribute('data-ttinc-transactions-loading');
      });
  }

  setTimeout(loadTransactions, 350);
  setInterval(loadTransactions, 1200);
}());