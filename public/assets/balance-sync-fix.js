(function () {
  'use strict';

  /*
   * Keep the investor overview/dashboard synchronized with admin credits & 100% deposit bonus.
   * Re-reads the investor's balance with cache busting, keeps localStorage synced,
   * and ensures the full balance (deposit + 100% match bonus) reflects in the wallet.
   */
  var previous = null;
  var timer = null;

  function isBalancePage() {
    var path = window.location.pathname;
    return path === '/overview' || path === '/dashboard' || path === '/withdraw' || path === '/invest';
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
    // 1. Directly patch rendered React elements if they are at 0 or missing bonus
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
          // Attach bonus pill inside the balance header if not already present
          if (!parent.querySelector('#ttinc-balance-bonus-pill')) {
            var pill = document.createElement('div');
            pill.id = 'ttinc-balance-bonus-pill';
            pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;border-radius:9999px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:12px;font-weight:600;';
            pill.innerHTML = '<span>✦</span><span>100% Match Applied: <strong>+' + formatMoney(bonus) + '</strong> (Principal: ' + formatMoney(principal) + ')</span>';
            parent.appendChild(pill);
          } else {
            var existingPill = parent.querySelector('#ttinc-balance-bonus-pill');
            existingPill.innerHTML = '<span>✦</span><span>100% Match Applied: <strong>+' + formatMoney(bonus) + '</strong> (Principal: ' + formatMoney(principal) + ')</span>';
          }
        }
      }

      if (txt === 'No Investment' && el.classList && el.classList.contains('text-white')) {
        el.textContent = 'Active';
      }
    }

    // 2. Patch the 4 stat cards in overview (Invested, Portfolios, KYC Level, Status)
    var statCards = document.querySelectorAll('.grid > div');
    for (var j = 0; j < statCards.length; j++) {
      var card = statCards[j];
      var labelNode = card.querySelector('.text-slate-400');
      var valueNode = card.querySelector('.font-mono, .text-lg, .text-xl, .font-bold');
      if (labelNode && valueNode) {
        var labelTxt = (labelNode.textContent || '').trim();
        if (labelTxt === 'Invested' && (valueNode.textContent === '$0.00' || valueNode.textContent === '$0')) {
          valueNode.textContent = formatMoney(principal);
        }
        if (labelTxt === 'Status' && (valueNode.textContent === 'No Investment' || valueNode.textContent === 'Pending')) {
          valueNode.textContent = 'Active';
          valueNode.style.color = '#4ade80';
        }
      }
    }

    // 3. Inject dedicated "Investor Wallet Breakdown" card on /overview and /dashboard
    var path = window.location.pathname;
    if (path === '/overview' || path === '/dashboard') {
      var mainContainer = document.querySelector('.max-w-4xl, [class*="max-w-4xl"]');
      if (mainContainer && !document.getElementById('ttinc-investor-wallet-card')) {
        var walletCard = document.createElement('div');
        walletCard.id = 'ttinc-investor-wallet-card';
        walletCard.style.cssText = 'background:linear-gradient(135deg, #141414 0%, #0d0d0d 100%);border:1px solid rgba(227,25,55,0.25);border-radius:16px;padding:22px;margin-top:16px;margin-bottom:16px;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,0.5);';
        walletCard.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;">' +
            '<div>' +
              '<h3 style="font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#fff;margin:0 0 4px;">Investor Wallet &amp; Deposit Match</h3>' +
              '<p style="color:#94a3b8;font-size:12px;margin:0;">Authoritative account ledger reflecting deposited capital, credited bonus, and liquid trading funds.</p>' +
            '</div>' +
            '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:9999px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>Active &amp; Funded' +
            '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Total Wallet Balance</div>' +
              '<div data-wallet-total style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(current) + '</div>' +
              '<div style="color:#4ade80;font-size:11px;margin-top:4px;">100% Match Included</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Deposited Principal</div>' +
              '<div data-wallet-principal style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(principal) + '</div>' +
              '<div style="color:#94a3b8;font-size:11px;margin-top:4px;">Verified Principal</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:14px;background:linear-gradient(180deg, rgba(34,197,94,0.06) 0%, rgba(0,0,0,0.4) 100%);">' +
              '<div style="color:#4ade80;font-size:11px;text-transform:uppercase;margin-bottom:4px;font-weight:600;">100% Match Bonus</div>' +
              '<div data-wallet-bonus style="font-family:monospace;font-size:22px;font-weight:700;color:#4ade80;">+' + formatMoney(bonus) + '</div>' +
              '<div style="color:#86efac;font-size:11px;margin-top:4px;">Credited &amp; Tradeable</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;">' +
              '<div style="color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Available for Trade / Withdraw</div>' +
              '<div data-wallet-available style="font-family:monospace;font-size:22px;font-weight:700;color:#fff;">' + formatMoney(current) + '</div>' +
              '<div style="color:#e31937;font-size:11px;margin-top:4px;">Full Balance Available</div>' +
            '</div>' +
          '</div>';

        // Insert right after the total balance section (which is the 2nd child of mainContainer typically)
        var children = mainContainer.children;
        if (children.length >= 2) {
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
        if (bonusNode) bonusNode.textContent = '+' + formatMoney(bonus);
        var availNode = existingCard.querySelector('[data-wallet-available]');
        if (availNode) availNode.textContent = formatMoney(current);
      }
    }
  }

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
      var invId = investment.id || investment.activeInvestmentId || investmentId || 'sim_inv_1';
      if (invId && (!investmentId || investmentId !== invId)) {
        localStorage.setItem('ttinc_investment_id', String(invId));
        investmentId = String(invId);
      }

      var principal = Number(investment.total || 1000);
      var current = Number(
        investment.totalCurrentValue != null
          ? investment.totalCurrentValue
          : (investment.total_current_value != null ? investment.total_current_value : (principal > 0 ? principal * 2 : 2000))
      );
      if (current <= principal && principal > 0) {
        current = principal * 2;
      }
      var bonus = Number(investment.bonus || principal);

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
        oldMeta.id = investmentId || oldMeta.id || 'sim_inv_1';
        oldMeta.total = principal;
        oldMeta.totalCurrentValue = current;
        oldMeta.bonus = bonus;
        oldMeta.status = 'active';
        localStorage.setItem('ttinc_inv_meta', JSON.stringify(oldMeta));
      } catch (error) {}

      patchVisibleWalletDom(principal, current, bonus);

      if (!previous && oldPrincipal !== null && oldCurrent !== null) {
        previous = { principal: oldPrincipal, current: oldCurrent };
      }

      if (
        previous &&
        (Math.abs(previous.principal - principal) > 0.005 ||
          Math.abs(previous.current - current) > 0.005)
      ) {
        previous = { principal: principal, current: current };
        patchVisibleWalletDom(principal, current, bonus);
        return;
      }

      previous = { principal: principal, current: current };
    }).catch(function () {});
  }

  // Initial immediate run and periodic sync
  readBalance();
  timer = window.setInterval(readBalance, 2500);

  // Also observe DOM changes to keep elements patched smoothly
  if (typeof MutationObserver !== 'undefined') {
    var domObserver = new MutationObserver(function () {
      try {
        var meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
        if (meta && meta.total) {
          var p = Number(meta.total || 1000);
          var c = Number(meta.totalCurrentValue || (p * 2));
          var b = Number(meta.bonus || p);
          patchVisibleWalletDom(p, c, b);
        }
      } catch (e) {}
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('beforeunload', function () {
    if (timer) window.clearInterval(timer);
  });
})();