(function () {
  'use strict';

  var BANNER_ID = 'ttinc-pending-payment-banner';
  var lastRoute = '';
  var timer = null;

  function onInvestorRoute() {
    return window.location.pathname === '/overview' ||
      window.location.pathname === '/dashboard';
  }

  function auth() {
    try {
      return JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
    } catch (error) {
      return null;
    }
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function removeBanner() {
    var node = document.getElementById(BANNER_ID);
    if (node) node.remove();
  }

  function render(data) {
    removeBanner();
    if (!data || !data.hasActiveInvestment ||
        !Array.isArray(data.pendingPayments) || !data.pendingPayments.length) {
      return;
    }

    var total = Number(data.pendingDepositTotal || 0);
    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.style.cssText =
      'width:100%;box-sizing:border-box;padding:12px 16px;' +
      'background:#241b05;border:1px solid #6b5315;color:#f6d365;' +
      'font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    banner.innerHTML =
      '<div style="max-width:1024px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '<div><strong style="color:#ffe38a;">Payment pending review</strong>' +
      '<div style="color:#c9bb78;">' + data.pendingPayments.length +
      ' new payment' + (data.pendingPayments.length === 1 ? '' : 's') +
      ' totaling ' + money(total) +
      ' is awaiting admin approval. Your existing balance and dashboard remain available.</div></div>' +
      '<a href="/overview" style="color:#ffe38a;text-decoration:underline;font-weight:700;">Track status</a>' +
      '</div>';

    var root = document.getElementById('root');
    var anchor = document.getElementById('ttinc-dashboard-addon-stack') || root;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(banner, anchor);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  function refresh() {
    if (!onInvestorRoute()) {
      removeBanner();
      return;
    }
    var current = auth();
    if (!current || !current.email) {
      removeBanner();
      return;
    }
    fetch('/api/account-status?email=' + encodeURIComponent(current.email), {
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(render).catch(function () {});
  }

  function routeTick() {
    if (window.location.pathname !== lastRoute) {
      lastRoute = window.location.pathname;
      refresh();
    }
  }

  refresh();
  setInterval(routeTick, 500);
  timer = setInterval(function () {
    if (onInvestorRoute()) refresh();
  }, 10000);
  window.addEventListener('beforeunload', function () {
    if (timer) window.clearInterval(timer);
  });
}());