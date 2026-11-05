(function () {
  'use strict';

  /*
   * Own /withdraw so older cached bundles cannot revive the retired
   * pay-to-withdraw screen. No withdrawal deposit, proof, or trade gate is
   * presented here; KYC and admin review remain server-side requirements.
   */
  var MARKER = 'ttinc-safe-withdrawal-flow';
  var observer;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getAuth() {
    try { return JSON.parse(localStorage.getItem('ttinc_auth') || 'null'); } catch (e) { return null; }
  }

  function renderMessage(root, message, tone) {
    var box = root.querySelector('[data-withdraw-message]');
    if (!box) return;
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
    box.style.color = tone === 'success' ? '#86efac' : '#fca5a5';
    box.style.background = tone === 'success' ? '#052e16' : '#3f0b12';
    box.style.borderColor = tone === 'success' ? '#166534' : '#7f1d1d';
  }

  function renderUnavailable(root, message) {
    root.innerHTML = '<div style="min-height:100vh;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:28px 16px;"><div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #292929;border-radius:14px;padding:22px;"><a href="/overview" style="color:#94a3b8;text-decoration:none;font-size:12px;">← Back to overview</a><h1 style="font-size:22px;margin:22px 0 10px;">Withdrawal unavailable</h1><p role="alert" style="color:#fca5a5;font-size:13px;line-height:1.6;">' + escapeHtml(message || 'Your verified account balance could not be loaded. Please retry later.') + '</p><button type="button" onclick="location.reload()" style="background:#e31937;color:#fff;border:0;border-radius:8px;padding:11px 16px;font-weight:700;">Retry</button></div></div>';
  }

  function renderWithdrawal(root, investment, auth) {
    var principal = Number(investment.total || 0);
    var balance = Number(investment.totalCurrentValue != null ? investment.totalCurrentValue : (investment.total_current_value != null ? investment.total_current_value : principal));
    var bonus = Number(investment.bonus != null ? investment.bonus : Math.max(0, balance - principal));
    if (!investment || !investment.id || !Number.isFinite(balance) || balance <= 0) {
      renderUnavailable(root, 'No verified active balance is available for withdrawal. Please check your investor dashboard or contact support.');
      return;
    }

    root.innerHTML =
      '<div id="' + MARKER + '" style="min-height:100vh;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;padding:28px 16px;">' +
        '<div style="max-width:520px;margin:0 auto;">' +
          '<a href="/overview" style="display:inline-block;color:#94a3b8;text-decoration:none;font-size:12px;margin-bottom:26px;">← Back to overview</a>' +
          '<h1 style="font-size:26px;margin:0 0 7px;text-transform:uppercase;">Request <span style="color:#e31937;">Withdrawal</span></h1>' +
          '<p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 18px;">No upfront payment or withdrawal deposit is required. Complete identity verification if requested, then your withdrawal is sent for admin review.</p>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px;margin-bottom:18px;">' +
            '<div><span style="color:#94a3b8;font-size:12px;display:block;">Available Wallet Balance</span><span style="color:#22c55e;font-size:11px;font-weight:700;">Verified balance · Bonus: ' + money(bonus) + '</span></div>' +
            '<strong style="font-size:20px;color:#fff;">' + money(balance) + '</strong>' +
          '</div>' +
          '<div data-withdraw-message role="alert" style="display:none;border:1px solid;border-radius:9px;padding:11px 12px;font-size:12px;line-height:1.5;margin-bottom:14px;"></div>' +
          '<form data-withdraw-form style="background:#111;border:1px solid #1e1e1e;border-radius:14px;padding:20px;">' +
            '<label style="display:block;color:#94a5b8;font-size:11px;margin-bottom:6px;">AMOUNT (USD)</label>' +
            '<input data-withdraw-amount type="number" min="0.01" max="' + escapeHtml(balance) + '" step="0.01" required style="width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #2a2a2a;color:#fff;border-radius:8px;padding:12px;margin-bottom:14px;">' +
            '<label style="display:block;color:#94a5b8;font-size:11px;margin-bottom:6px;">METHOD</label>' +
            '<select data-withdraw-method style="width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #2a2a2a;color:#fff;border-radius:8px;padding:12px;margin-bottom:14px;"><option value="usdt">USDT (TRC-20)</option><option value="eth">Ethereum (ERC-20)</option><option value="btc">Bitcoin (BTC)</option><option value="bank">Bank Wire Transfer</option></select>' +
            '<label style="display:block;color:#94a5b8;font-size:11px;margin-bottom:6px;">RECEIVING WALLET / BANK DETAILS</label>' +
            '<textarea data-withdraw-details required maxlength="255" rows="4" style="width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #2a2a2a;color:#fff;border-radius:8px;padding:12px;resize:vertical;"></textarea>' +
            '<button type="submit" style="width:100%;margin-top:14px;border:0;border-radius:9px;background:#e31937;color:#fff;padding:13px;font-weight:700;cursor:pointer;">SUBMIT REQUEST</button>' +
          '</form>' +
        '</div>' +
      '</div>';

    root.querySelector('[data-withdraw-form]').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var amount = Number(form.querySelector('[data-withdraw-amount]').value || 0);
      var method = form.querySelector('[data-withdraw-method]').value;
      var details = form.querySelector('[data-withdraw-details]').value.trim();
      if (!amount || amount <= 0 || amount > balance || !details) {
        renderMessage(root, 'Enter an amount within your available balance and provide receiving details.');
        return;
      }

      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'SUBMITTING…';
      fetch('/api/withdrawals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investmentId: investment.id,
          amount: amount,
          method: method,
          walletAddress: details,
          destination: details
        })
      }).then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            if (data.kyc_required || data.kyc_pending || data.kyc_rejected) {
              var kycUrl = '/kyc?id=' + encodeURIComponent(investment.id) +
                '&email=' + encodeURIComponent(auth.email || '');
              throw new Error((data.error || 'Identity verification is required.') +
                ' Open KYC: ' + kycUrl);
            }
            throw new Error(data.error || 'Withdrawal request failed.');
          }
          return data;
        });
      }).then(function () {
        form.style.display = 'none';
        renderMessage(root, 'Withdrawal request received. It is pending admin review.', 'success');
      }).catch(function (error) {
        renderMessage(root, error.message || 'Withdrawal request failed.');
        submit.disabled = false;
        submit.textContent = 'SUBMIT REQUEST';
      });
    });
  }

  function takeOver() {
    if (window.location.pathname !== '/withdraw') return;
    var root = document.getElementById('root');
    var auth = getAuth();
    if (!root || !auth || !auth.email) {
      if (root && !auth) window.location.href = '/login';
      return;
    }
    if (root.querySelector('#' + MARKER)) return;

    var investmentId = localStorage.getItem('ttinc_investment_id') || '';
    if (!investmentId) {
      try {
        investmentId = (JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}') || {}).id || '';
      } catch (e) {}
    }

    var fetchUrl = investmentId
      ? '/api/investments/' + encodeURIComponent(investmentId)
      : '/api/investments?email=' + encodeURIComponent(auth.email);

    fetch(fetchUrl, {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) throw new Error('Could not load account');
      return response.json();
    }).then(function (resData) {
      var investment = Array.isArray(resData) ? (resData[0] || {}) : resData;
      if (investment && investment.id) localStorage.setItem('ttinc_investment_id', investment.id);
      if (window.location.pathname === '/withdraw' && !root.querySelector('#' + MARKER)) {
        if (investment && ['active', 'approved'].includes(String(investment.status || '').toLowerCase())) renderWithdrawal(root, investment, auth);
        else renderUnavailable(root, 'Your account does not have a verified active investment balance yet.');
      }
    }).catch(function () {
      if (window.location.pathname === '/withdraw' && !root.querySelector('#' + MARKER)) {
        renderUnavailable(root, 'The investor database could not be reached. No balance has been assumed or displayed. Please retry later.');
      }
    });
  }

  takeOver();
  setTimeout(takeOver, 800);
  setTimeout(takeOver, 1800);
  observer = new MutationObserver(takeOver);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}());