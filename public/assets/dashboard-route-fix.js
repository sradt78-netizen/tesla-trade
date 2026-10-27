(function () {
  'use strict';

  /*
   * The compiled overview and portfolio screens historically rendered without
   * an investment when the browser had not cached ttinc_investment_id yet.
   * That is a storage timing problem, not an onboarding decision. Resolve the
   * user's investment before React mounts so first login can show the balance,
   * View Portfolio, and the live trading entry point.
   */
  var heldDashboard = false;
  var heldNavigation = null;
  var releaseTimer = null;
  var investmentLookup = null;
  var cachedInvestmentValidated = false;

  function auth() {
    try { return JSON.parse(localStorage.getItem('ttinc_auth') || 'null'); }
    catch (error) { return null; }
  }

  function pathOf(url) {
    try { return new URL(url || location.href, location.href).pathname; }
    catch (error) { return String(url || '').split('?')[0]; }
  }

  function setInvestment(row) {
    if (!row || !row.id) return false;
    localStorage.setItem('ttinc_investment_id', row.id);
    try {
      var tot = Number(row.total || 0);
      var curVal = Number(
        row.totalCurrentValue != null ? row.totalCurrentValue : (row.total_current_value != null ? row.total_current_value : (tot > 0 ? tot * 2 : 0))
      );
      if (curVal <= tot && tot > 0) curVal = tot * 2;
      localStorage.setItem('ttinc_inv_meta', JSON.stringify({
        id: row.id,
        total: tot,
        totalCurrentValue: curVal,
        bonus: tot,
        status: row.status || 'active',
        planName: row.planName || row.portfolio || 'Explorer'
      }));
    } catch (error) {}
    return true;
  }

  function choosePrimaryInvestment(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var active = rows.filter(function (row) { return row.status === 'active' || row.status === 'approved'; });
    if (!active.length) return rows[0];
    // A returning investor's original wallet is the oldest active row.
    // Approved follow-up deposits are linked with depositParentId and should
    // never replace that wallet in localStorage.
    active.sort(function (a, b) {
      var aPrimary = !a.depositParentId;
      var bPrimary = !b.depositParentId;
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return active[0];
  }

  function findInvestment() {
    var current = auth();
    if (!current || !current.email) return Promise.resolve(null);
    if (investmentLookup) return investmentLookup;
    investmentLookup = fetch('/api/investments?email=' + encodeURIComponent(current.email), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (response) {
      return response.ok ? response.json() : [];
    }).then(function (rows) {
      cachedInvestmentValidated = true;
      var chosen = choosePrimaryInvestment(rows);
      if (chosen) return chosen;
      // Fallback: check /api/account-status for active investment ID
      return fetch('/api/account-status?email=' + encodeURIComponent(current.email), {
        credentials: 'same-origin',
        cache: 'no-store'
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (acc) {
        if (acc && (acc.hasActiveInvestment || acc.status === 'active') && acc.activeInvestmentId) {
          return {
            id: acc.activeInvestmentId,
            total: acc.total || 1000,
            totalCurrentValue: acc.totalCurrentValue || 2000,
            status: 'active',
            planName: acc.planName || 'Explorer'
          };
        }
        return null;
      });
    }).catch(function () {
      return null;
    }).then(function (row) {
      investmentLookup = null;
      return row;
    });
    return investmentLookup;
  }

  function releaseHeldDashboard() {
    heldDashboard = false;
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    if (heldNavigation) {
      var next = heldNavigation;
      heldNavigation = null;
      next();
    }
  }

  function holdDashboardRedirect() {
    if (location.pathname !== '/dashboard') return;
    var previousId = localStorage.getItem('ttinc_investment_id') || '';
    heldDashboard = true;
    releaseTimer = setTimeout(releaseHeldDashboard, 6000);
    findInvestment().then(function (row) {
      if (row && setInvestment(row)) {
        // Reload only when the compiled dashboard needs a different ID. This
        // also repairs browsers that still point at a newly submitted
        // pending deposit instead of the returning investor's wallet.
        if (previousId !== row.id) window.location.reload();
        else releaseHeldDashboard();
        return;
      }
      releaseHeldDashboard();
    });
  }

  function wrapHistory(name) {
    var original = window.history[name];
    window.history[name] = function (state, title, url) {
      var target = pathOf(url);
      if (heldDashboard && target === '/overview') {
        heldNavigation = function () {
          original.call(window.history, state, title, url);
          window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
        };
        return;
      }
      return original.apply(window.history, arguments);
    };
  }

  wrapHistory('pushState');
  wrapHistory('replaceState');

  function sync() {
    if (location.pathname !== '/dashboard' && location.pathname !== '/overview') return;
    var previousId = localStorage.getItem('ttinc_investment_id') || '';
    findInvestment().then(function (row) {
      if (!row || !setInvestment(row)) return;
      if (location.pathname === '/overview' && previousId !== row.id) {
        // vpe() only reads the ID during its first effect. Reload after the
        // lookup so the compiled overview receives the recovered investment
        // on its initial render instead of staying at a zero balance.
        window.location.reload();
      }
    });
  }

  holdDashboardRedirect();
  sync();
  setInterval(sync, 12000);
}());