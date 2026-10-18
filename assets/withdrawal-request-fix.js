(function () {
  'use strict';

  /*
   * The deployed frontend is a compiled bundle. Keep this small compatibility
   * layer outside the bundle so the request contract stays correct even when
   * the host still has a cached copy of the main JavaScript asset.
   *
   * The withdrawal form already owns the destination field in the DOM. Add it
   * to the JSON request at the last possible moment, without touching any
   * unrelated API calls.
   */
  var originalFetch = window.fetch;
  if (typeof originalFetch !== 'function') return;

  function safeSetFetch(fn) {
    try {
      window.fetch = fn;
    } catch (e) {
      try {
        Object.defineProperty(window, 'fetch', {
          value: fn,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (err) {}
    }
  }

  safeSetFetch(function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    if (method !== 'POST' || url.indexOf('/api/withdrawals') === -1 || !init || typeof init.body !== 'string') {
      return originalFetch.apply(this, arguments);
    }

    try {
      var payload = JSON.parse(init.body);
      if (!payload.walletAddress || !payload.destination) {
        var destination = document.querySelector(
          '#ttinc-withdraw-details, textarea[name="walletAddress"], textarea[name="destination"]'
        );
        var value = destination && destination.value ? destination.value.trim() : '';
        if (value) {
          // The deployed clients have used both names over time. Keep both
          // values in sync so the overview modal and the standalone
          // /withdraw route submit the same request contract.
          if (!payload.walletAddress) payload.walletAddress = value;
          if (!payload.destination) payload.destination = value;
          init = Object.assign({}, init, { body: JSON.stringify(payload) });
        }
      }
    } catch (error) {
      // Let the original request and server-side validation report malformed
      // payloads; this compatibility layer must never hide an API error.
    }

    return originalFetch.call(this, input, init);
  };

  /*
   * The compiled dashboard withdrawal modal used to render only amount and
   * method, even though the API correctly requires a destination. Add the
   * missing field to that modal when it appears. This keeps old cached bundles
   * usable and makes the server contract explicit to the investor.
   */
  function ensureWithdrawalDetailsField() {
    var headings = document.querySelectorAll('h3');
    for (var i = 0; i < headings.length; i++) {
      var heading = (headings[i].textContent || '').trim().toLowerCase();
      if (heading !== 'request withdrawal') continue;

      var scope = headings[i].parentElement;
      for (var depth = 0; scope && depth < 8; depth++, scope = scope.parentElement) {
        var submit = Array.prototype.slice.call(scope.querySelectorAll('button')).find(function (button) {
          return (button.textContent || '').trim().toLowerCase() === 'submit request';
        });
        if (!submit || !scope.querySelector('select')) continue;
        if (scope.querySelector('#ttinc-withdraw-details')) return;

        var field = document.createElement('div');
        field.style.marginTop = '12px';
        field.innerHTML =
          '<label for="ttinc-withdraw-details" style="display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Receiving wallet or bank details</label>' +
          '<textarea id="ttinc-withdraw-details" name="walletAddress" rows="3" maxlength="255" placeholder="Wallet address or bank account details" style="width:100%;box-sizing:border-box;background:#1a1a1a;border:1px solid #333;color:#fff;border-radius:6px;padding:10px;font:inherit;resize:vertical;"></textarea>' +
          '<div style="color:#64748b;font-size:10px;margin-top:5px;">Required so the admin knows where to send the withdrawal.</div>';
        submit.parentNode.insertBefore(field, submit);
        return;
      }
    }
  }

  /*
   * The overview quick-action used to send investors to /dashboard instead
   * of the working withdrawal route. Capture that exact action before React's
   * handler runs and use the same destination as the sidebar.
   */
  function routeOverviewWithdrawAction(event) {
    if (window.location.pathname !== '/overview') return;
    var button = event.target && event.target.closest && event.target.closest('button');
    if (!button) return;
    if ((button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() !== 'withdraw') return;
    event.preventDefault();
    event.stopPropagation();
    window.location.href = '/withdraw';
  }

  /*
   * The compiled withdrawal route renders its own no-investment state before
   * a POST can be made. Keep that state aligned with the server-side guard.
   */
  function syncNoInvestmentMessage() {
    if (window.location.pathname !== '/withdraw') return;
    var investmentId = localStorage.getItem('ttinc_investment_id') || '';
    if (investmentId) return;
    var root = document.getElementById('root');
    if (!root) return;

    var exact = "You don't have any active investments. Fund an active account before requesting a withdrawal.";
    var paragraphs = root.querySelectorAll('p');
    for (var i = 0; i < paragraphs.length; i++) {
      var text = (paragraphs[i].textContent || '').trim();
      if (text.indexOf('Your account is not yet eligible for withdrawals') !== -1
        || text.indexOf('No active investment found') !== -1
        || text.indexOf('No active investment account was found') !== -1) {
        paragraphs[i].textContent = exact;
      }
    }
  }

  document.addEventListener('click', routeOverviewWithdrawAction, true);
  setInterval(syncNoInvestmentMessage, 500);
  syncNoInvestmentMessage();
  setInterval(ensureWithdrawalDetailsField, 300);
  ensureWithdrawalDetailsField();
}());