(function () {
  'use strict';

  /*
   * Keep the investor overview/dashboard synchronized with admin credits.
   * The main React bundle keeps the selected investment ID in localStorage;
   * this small compatibility layer re-reads that same record without cache
   * and refreshes the page only when its balance actually changes.
   */
  var previous = null;
  var timer = null;

  function isBalancePage() {
    var path = window.location.pathname;
    return path === '/overview' || path === '/dashboard';
  }

  function readAuth() {
    try {
      return JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
    } catch (error) {
      return null;
    }
  }

  function readBalance() {
    // The app is a client-side router. This script loads once from index.html,
    // so checking pathname only at startup misses later navigation to the
    // dashboard.
    if (!isBalancePage()) {
      previous = null;
      return;
    }

    var auth = readAuth();
    var investmentId = localStorage.getItem('ttinc_investment_id') || '';
    if (!auth || !auth.email || !investmentId) return;

    var url = '/api/investments/' + encodeURIComponent(investmentId)
      + '?balance_refresh=' + Date.now();

    fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Balance refresh failed');
      return response.json();
    }).then(function (investment) {
      var principal = Number(investment.total || 0);
      var current = Number(
        investment.totalCurrentValue != null
          ? investment.totalCurrentValue
          : principal
      );
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
        oldMeta.total = principal;
        oldMeta.totalCurrentValue = current;
        // index.html namespaces this key per signed-in investor.
        localStorage.setItem('ttinc_inv_meta', JSON.stringify(oldMeta));
      } catch (error) {}

      // If the dashboard was already rendered with an older server value,
      // compare against that value on the first poll too. The previous
      // implementation only compared poll N with poll N+1, so it could store
      // the new balance silently without refreshing the visible dashboard.
      if (!previous && oldPrincipal !== null && oldCurrent !== null) {
        previous = { principal: oldPrincipal, current: oldCurrent };
      }

      if (
        previous &&
        (Math.abs(previous.principal - principal) > 0.005 ||
          Math.abs(previous.current - current) > 0.005)
      ) {
        window.location.reload();
        return;
      }

      previous = { principal: principal, current: current };
    }).catch(function () {});
  }

  readBalance();
  timer = window.setInterval(readBalance, 5000);
  window.addEventListener('beforeunload', function () {
    if (timer) window.clearInterval(timer);
  });
})();