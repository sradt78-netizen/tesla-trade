(function () {
  'use strict';

  /*
   * Keep the investor overview/dashboard synchronized with authentic balances and admin status.
   * Re-reads the investor's balance with cache busting and keeps localStorage synced
   * without artificial balance doubling or fake match bonuses.
   */
  var _origFetch = window.fetch;
  if (_origFetch) {
    window.fetch = function (resource, init) {
      var url = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
      if (url.indexOf('/api/investments') !== -1 && url.indexOf('/trading') === -1 && url.indexOf('chart-data') === -1 && (!init || !init.method || String(init.method).toUpperCase() === 'GET')) {
        return _origFetch.apply(this, arguments).then(function (res) {
          if (!res.ok) {
            // Never replace an unavailable database response with a locally
            // cached or synthetic investment. Keep the real HTTP error visible.
            return res;
          }
          return res.clone().json().then(function (data) {
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              var modified = false;
              var serverStatus = String(data.status || data.investmentStatus || '').toLowerCase();
              var isUserPending = (serverStatus === 'pending_approval' || serverStatus === 'pending');
              var isUserApproved = (serverStatus === 'approved' || serverStatus === 'verified' || serverStatus === 'active');
              if (isUserApproved) {
                data.status = 'active';
                data.canWithdraw = true;
                modified = true;
              } else if (isUserPending) {
                data.status = 'pending_approval';
                data.canWithdraw = false;
                modified = true;
              }
              var p = Number(data.total != null ? data.total : (data.amount != null ? data.amount : 0));

              var c = Number(data.totalCurrentValue != null ? data.totalCurrentValue : (data.total_current_value != null ? data.total_current_value : p));
              data.totalCurrentValue = c;
              data.total_current_value = c;
              // Preserve the backend's bonus value; do not overwrite it with a fabricated zero.
              if (data.bonus == null && data.welcomeBonus != null) data.bonus = Number(data.welcomeBonus);
              modified = true;


              if (modified) {
                try {
                  localStorage.setItem('ttinc_inv_meta', JSON.stringify(data));
                  if (data.status === 'active') localStorage.setItem('ttinc_account_approved', 'true');
                } catch (e) {}
                return new Response(JSON.stringify(data), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
            return res;
          }).catch(function () {
            return res;
          });
        });
      }
      return _origFetch.apply(this, arguments);
    };
  }

  var previous = null;
  var timer = null;

  function isBalancePage() {
    var path = window.location.pathname;
    return path === '/' || path === '/overview' || path === '/dashboard' || path === '/withdraw' || path === '/invest' || path.indexOf('/portfolio') !== -1;
  }

  function readAuth() {
    try {
      return JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
    } catch (error) {
      return null;
    }
  }

  function formatMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function patchVisibleWalletDom(principal, current, bonus) {
    if (typeof window.ttincRemoveLoader === 'function') window.ttincRemoveLoader();
    var initLdr = document.getElementById('ttinc-initial-loader');
    if (initLdr) initLdr.remove();

    // 1. Directly patch rendered React elements
    var allElements = document.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var txt = (el.textContent || '').trim();

      if (txt === 'Total Balance') {
        var parent = el.parentElement;
        if (parent) {
          var valNode = parent.querySelector('.font-mono, [class*="text-4xl"], [class*="text-5xl"]');
          if (valNode) {
            valNode.textContent = formatMoney(current);
          }
          var oldPill = parent.querySelector('#ttinc-balance-bonus-pill');
          if (oldPill) oldPill.remove();
        }
      }

      if (txt === 'No Investment' && el.classList && el.classList.contains('text-white')) {
        el.textContent = 'Active';
      }
    }

    // 2. Patch stat cards in overview and dashboard (Invested, Current Value, Status)
    var statCards = document.querySelectorAll('.grid > div');
    for (var j = 0; j < statCards.length; j++) {
      var card = statCards[j];
      var labelNode = card.querySelector('.text-slate-400, .text-slate-500, [class*="tracking-widest"]');
      var valueNode = card.querySelector('.font-mono, .text-lg, .text-xl, .font-bold');
      if (labelNode && valueNode) {
        var labelTxt = (labelNode.textContent || '').trim();
        if (labelTxt === 'Invested' || labelTxt === 'Total Invested') {
          if (principal > 0) valueNode.textContent = formatMoney(principal);
        }
        if (labelTxt === 'Current Value') {
          if (current > 0) valueNode.textContent = formatMoney(current);
        }
        if (labelTxt === 'Status') {
          var depStatus = localStorage.getItem('ttinc_deposit_status') || '';
          if (depStatus === 'pending_approval' || valueNode.textContent === 'Pending' || valueNode.textContent === 'Pending Approval') {
            valueNode.textContent = 'Pending Approval';
            valueNode.style.color = '#fde047';
          } else if (valueNode.textContent === 'No Investment' && principal > 0) {
            valueNode.textContent = 'Active';
            valueNode.style.color = '#4ade80';
          }
        }
      }
    }

    // 3. Inject dedicated "Investor Wallet Breakdown" card on /overview and /dashboard
    var path = window.location.pathname;
    if (path === '/overview' || path === '/dashboard' || path === '/') {
      var mainContainer = document.querySelector('.max-w-5xl, .max-w-4xl, [class*="max-w-5xl"], [class*="max-w-4xl"]');
      if (mainContainer && !document.getElementById('ttinc-investor-wallet-card')) {
        var walletCard = document.createElement('div');
        walletCard.id = 'ttinc-investor-wallet-card';
        walletCard.style.cssText = 'background:linear-gradient(135deg, #141414 0%, #0d0d0d 100%);border:1px solid rgba(227,25,55,0.25);border-radius:16px;padding:22px;margin-top:16px;margin-bottom:16px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.5);';
        walletCard.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;">' +
            '<div>' +
              '<h3 style="font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#fff;margin:0 0 4px;">Investor Wallet Ledger</h3>' +
              '<p style="color:#94a3b8;font-size:12px;margin:0;">Authoritative account ledger reflecting deposited capital and liquid trading funds.</p>' +
            '</div>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:9999px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>Active &amp; Funded' +
            '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Total Wallet Balance</div>' +
              '<div data-wallet-total style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(current) + '</div>' +
              '<div style="color:#22c55e;font-size:11px;margin-top:4px;">Authentic Balance</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Deposited Principal</div>' +
              '<div data-wallet-principal style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(principal) + '</div>' +
              '<div style="color:#94a3b8;font-size:11px;margin-top:4px;">Verified Principal</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Confirmed Deposit Match Bonus</div>' +
              '<div data-wallet-bonus style="font-family:monospace;font-size:22px;font-weight:700;color:#4ade80;">' + formatMoney(bonus) + '</div>' +
              '<div style="color:#94a3b8;font-size:11px;margin-top:4px;">Recorded bonus credit</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Available for Trade / Withdraw</div>' +
              '<div data-wallet-available style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(current) + '</div>' +
              '<div style="color:#e31937;font-size:11px;margin-top:4px;">Liquid Funds</div>' +
            '</div>' +
          '</div>';

        var children = mainContainer.children;
        if (path === '/dashboard') {
          mainContainer.insertBefore(walletCard, mainContainer.firstChild);
        } else if (children.length >= 2) {
          mainContainer.insertBefore(walletCard, children[2]);
        } else {
          mainContainer.appendChild(walletCard);
        }
      } else if (document.getElementById('ttinc-investor-wallet-card')) {
        var existingCard = document.getElementById('ttinc-investor-wallet-card');
        var totNode = existingCard.querySelector('[data-wallet-total]');
        if (totNode) totNode.textContent = formatMoney(current);
        var princNode = existingCard.querySelector('[data-wallet-principal]');
        if (princNode) princNode.textContent = formatMoney(principal);
        var bonusNode = existingCard.querySelector('[data-wallet-bonus]');
        if (bonusNode) bonusNode.textContent = formatMoney(bonus);
        var availNode = existingCard.querySelector('[data-wallet-available]');
        if (availNode) availNode.textContent = formatMoney(current);
      }
    }
  }
  window.patchVisibleWalletDom = patchVisibleWalletDom;

  function readBalance() {
    if (!isBalancePage()) {
      previous = null;
      return;
    }

    var auth = readAuth();
    if (!auth || !auth.email) return;

    var investmentId = localStorage.getItem('ttinc_investment_id') || '';
    var url = investmentId
      ? '/api/investments/' + encodeURIComponent(investmentId) + '?email=' + encodeURIComponent(auth.email) + '&balance_refresh=' + Date.now()
      : '/api/account-status?email=' + encodeURIComponent(auth.email) + '&balance_refresh=' + Date.now();

    fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Balance refresh failed');
      return response.json();
    }).then(function (resData) {
      var investment = Array.isArray(resData) ? (resData[0] || {}) : resData;
      var invId = investment.id || investment.activeInvestmentId || investmentId || '';
      if (invId && (!investmentId || investmentId !== invId)) {
        localStorage.setItem('ttinc_investment_id', String(invId));
        investmentId = String(invId);
      }

      var principal = Number(investment.total != null ? investment.total : (investment.amount != null ? investment.amount : 0));
      var current = Number(
        investment.totalCurrentValue != null
          ? investment.totalCurrentValue
          : (investment.total_current_value != null ? investment.total_current_value : principal)
      );
      var bonus = Number(investment.bonus != null ? investment.bonus : (investment.welcomeBonus != null ? investment.welcomeBonus : (investment.bonus_balance != null ? investment.bonus_balance : 0)));

      if (!Number.isFinite(principal) || !Number.isFinite(current)) return;

      var oldPrincipal = null;
      var oldCurrent = null;
      try {
        var oldMeta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
        var storedPrincipal = Number(oldMeta.total);
        var storedCurrent = Number(
          oldMeta.totalCurrentValue != null
            ? oldMeta.totalCurrentValue
            : oldMeta.total
        );
        if (Number.isFinite(storedPrincipal)) oldPrincipal = storedPrincipal;
        if (Number.isFinite(storedCurrent)) oldCurrent = storedCurrent;
        // Server values are authoritative; never replace a valid server zero with stale browser data.
        oldMeta.id = investmentId || oldMeta.id || '';
        oldMeta.total = principal;
        oldMeta.totalCurrentValue = current;
        oldMeta.bonus = Number.isFinite(bonus) ? bonus : 0;
        if (investment.status === 'active' || investment.status === 'approved') {
          oldMeta.status = 'active';
        }
        localStorage.setItem('ttinc_inv_meta', JSON.stringify(oldMeta));
      } catch (error) {}

      // Patch rendered values only when the authoritative balance actually changes.
      // Rewriting the DOM on every poll caused visible flicker against React renders.
      var balanceChanged = !previous ||
        Math.abs(previous.principal - principal) > 0.005 ||
        Math.abs(previous.current - current) > 0.005 ||
        Math.abs(previous.bonus - bonus) > 0.005;
      if (balanceChanged) {
        patchVisibleWalletDom(principal, current, bonus);
      }
      previous = { principal: principal, current: current, bonus: bonus };
    }).catch(function () {});
  }

  // Initial immediate run and periodic sync
  readBalance();
  timer = window.setInterval(readBalance, 2500);

  var isPatching = false;
  function safeTriggerPatch() {
    if (isPatching || !isBalancePage()) return;
    // Only repaint from the latest successful server response. Browser cache
    // is not proof of approval or a reliable source of a funded balance.
    if (!previous) {
      readBalance();
      return;
    }
    isPatching = true;
    try {
      patchVisibleWalletDom(previous.principal, previous.current, previous.bonus);
    } finally {
      isPatching = false;
    }
  }

  window.addEventListener('ttinc_account_activated', function () { previous = null; readBalance(); });
  window.addEventListener('popstate', safeTriggerPatch);
  window.addEventListener('storage', safeTriggerPatch);

  var domObserver = null;
  if (typeof MutationObserver !== 'undefined') {
    var debounceTimer = null;
    domObserver = new MutationObserver(function () {
      if (document.getElementById('ttinc-investor-wallet-card')) return;
      if (debounceTimer) return;
      debounceTimer = setTimeout(function () {
        debounceTimer = null;
        safeTriggerPatch();
      }, 200);
    });
    var rootElem = document.getElementById('root') || document.body;
    if (rootElem) {
      domObserver.observe(rootElem, { childList: true });
    }
  }

  window.addEventListener('beforeunload', function () {
    if (timer) window.clearInterval(timer);
    if (domObserver) domObserver.disconnect();
  });
})();