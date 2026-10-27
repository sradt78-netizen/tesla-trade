(function () {
  'use strict';

  var LOCK_OVERLAY_ID = 'ttinc-pending-deposit-lock-overlay';
  var BANNER_ID = 'ttinc-pending-payment-banner';
  var pollTimer = null;
  var lastCheckedStatus = '';

  function onInvestorRoute() {
    var p = (window.location.pathname || '').toLowerCase();
    return p === '/overview' || p === '/dashboard' || p === '/waiting' || p === '/invest' ||
      p.indexOf('/overview/') === 0 || p.indexOf('/dashboard/') === 0 ||
      p.indexOf('/portfolio') === 0;
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
      maximumFractionDigits: 2
    });
  }

  function isDepositPendingLocal() {
    try {
      var meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
      if (meta.status === 'active' || meta.status === 'approved') return false;
      var dep = localStorage.getItem('ttinc_deposit_status');
      var pay = localStorage.getItem('ttinc_payment_status');
      if (dep === 'active' || pay === 'active' || dep === 'approved' || pay === 'approved') return false;
      if (dep === 'pending_approval' || pay === 'pending_approval' ||
        meta.status === 'pending_approval' || meta.status === 'pending') {
        return true;
      }
      if (location.search && location.search.indexOf('payment=pending') !== -1) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function getPendingDetails() {
    var amt = localStorage.getItem('ttinc_deposit_amount') || '';
    var plan = localStorage.getItem('ttinc_deposit_plan') || '';
    var method = localStorage.getItem('ttinc_deposit_method') || '';
    try {
      var meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
      if (!amt && meta.total) amt = meta.total;
      if (!plan && meta.planName) plan = meta.planName;
      if (!method && meta.method) method = meta.method;
    } catch (e) {}
    return {
      amount: amt ? money(amt) : '$1,000.00',
      plan: plan || 'Pioneer (100% Projected ROI)',
      method: method || 'USDT (TRC-20)'
    };
  }

  // Intercept any attempts to redirect back to /invest when a deposit is active or pending
  function guardNavigation() {
    var origPush = window.history.pushState;
    var origReplace = window.history.replaceState;
    function shouldBlock(targetUrl) {
      var meta = {};
      try { meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}'); } catch (e) {}
      var dep = localStorage.getItem('ttinc_deposit_status');
      var pay = localStorage.getItem('ttinc_payment_status');
      var isActive = (meta.status === 'active' || meta.status === 'approved' || dep === 'active' || pay === 'active');
      var isPending = (dep === 'pending_approval' || pay === 'pending_approval' || meta.status === 'pending_approval' || meta.status === 'pending');
      var str = String(targetUrl || '').toLowerCase();

      // If active, prevent kicking back to /invest or /waiting
      if (isActive) {
        if (str.indexOf('/invest') !== -1 || str.indexOf('/waiting') !== -1) {
          if (window.location.pathname !== '/overview') {
            window.location.replace('/overview');
          }
          return true;
        }
        return false;
      }

      if (isPending || isDepositPendingLocal()) {
        return (str.indexOf('/invest') !== -1 || str.indexOf('/payment') !== -1) &&
          str.indexOf('approved') === -1;
      }
      return false;
    }

    window.history.pushState = function (state, title, url) {
      if (shouldBlock(url)) {
        return;
      }
      return origPush.apply(window.history, arguments);
    };

    window.history.replaceState = function (state, title, url) {
      if (shouldBlock(url)) {
        return;
      }
      return origReplace.apply(window.history, arguments);
    };
  }
  guardNavigation();

  function removeLock() {
    var node = document.getElementById(LOCK_OVERLAY_ID);
    if (node) node.remove();
  }

  function removeBanner() {
    var node = document.getElementById(BANNER_ID);
    if (node) node.remove();
  }

  function showLockedScreen(details) {
    if (!onInvestorRoute()) return;

    var existing = document.getElementById(LOCK_OVERLAY_ID);
    if (existing) return; // Already locked

    var det = details || getPendingDetails();

    var overlay = document.createElement('div');
    overlay.id = LOCK_OVERLAY_ID;
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:radial-gradient(ellipse at top, #141007 0%, #080808 100%)',
      'backdrop-filter:blur(18px)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:20px', 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'color:#fff', 'overflow-y:auto', 'box-sizing:border-box'
    ].join(';');

    overlay.innerHTML =
      '<div style="max-width:540px;width:100%;background:#111215;border:1px solid #33270f;border-radius:24px;padding:36px 30px;box-shadow:0 30px 80px rgba(0,0,0,0.85);text-align:center;position:relative;overflow:hidden;">' +
        // Top ambient glow line
        '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg, #d4af37, #e31937, #d4af37);"></div>' +

        // Institutional Badge
        '<div style="display:inline-flex;align-items:center;gap:7px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.35);border-radius:999px;padding:5px 14px;font-size:10px;font-weight:800;letter-spacing:1.8px;color:#fde047;text-transform:uppercase;margin-bottom:20px;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#eab308;box-shadow:0 0 8px #eab308;animation:ttinc-lock-pulse 1.8s infinite;"></span>' +
          'Tesla Trade Inc · Private Custody' +
        '</div>' +

        // Glowing Padlock Icon
        '<div style="width:72px;height:72px;margin:0 auto 20px;border-radius:50%;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(212,175,55,0.15);">' +
          '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>' +
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' +
          '</svg>' +
        '</div>' +

        // Title & Explicit Unlock Promise
        '<h2 style="font-size:24px;font-weight:900;color:#ffffff;margin:0 0 10px;letter-spacing:-0.5px;line-height:1.25;">Investors Dashboard Locked</h2>' +
        '<p style="font-size:15px;color:#fde047;font-weight:600;line-height:1.6;margin:0 0 24px;padding:0 10px;">' +
          'The dashboard will be unlocked as soon as admin approves deposit.' +
        '</p>' +

        // Deposit Verification Card
        '<div style="background:#0c0d10;border:1px solid #232733;border-radius:16px;padding:18px 20px;text-align:left;margin-bottom:24px;">' +
          '<div style="font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">' +
            '<span>Deposit Under Review</span>' +
            '<span style="color:#f59e0b;font-weight:700;">Awaiting Approval</span>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a1e28;">' +
            '<span style="color:#94a3b8;font-size:13px;">Amount Submitted</span>' +
            '<span style="color:#4ade80;font-weight:800;font-size:15px;font-family:monospace;">' + det.amount + '</span>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a1e28;">' +
            '<span style="color:#94a3b8;font-size:13px;">Selected Portfolio</span>' +
            '<span style="color:#ffffff;font-weight:700;font-size:13px;">' + det.plan + '</span>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">' +
            '<span style="color:#94a3b8;font-size:13px;">Payment Proof</span>' +
            '<span style="color:#38bdf8;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:4px;">' +
              '<span>✓</span> Receipt Uploaded &amp; Queued' +
            '</span>' +
          '</div>' +
        '</div>' +

        // Live Monitoring Status
        '<div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:14px 16px;font-size:12px;color:#cbd5e1;line-height:1.6;margin-bottom:24px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;color:#fde047;font-weight:700;margin-bottom:4px;">' +
            '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 6px #22c55e;"></span>' +
            'Live Verification Queue Active' +
          '</div>' +
          'Our compliance administrators are currently verifying your payment receipt. This screen automatically detects approval and unlocks your full dashboard with zero manual refresh required.' +
        '</div>' +

        // Animated Polling Pill
        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;color:#64748b;letter-spacing:0.5px;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#e31937;animation:ttinc-lock-pulse 1.2s infinite;"></span>' +
          '<span id="ttinc-lock-poll-status">Checking for administrator approval every 4 seconds…</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Inject pulse animation style if missing
    if (!document.getElementById('ttinc-lock-anim-style')) {
      var st = document.createElement('style');
      st.id = 'ttinc-lock-anim-style';
      st.textContent = '@keyframes ttinc-lock-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.2);}}';
      document.head.appendChild(st);
    }
  }

  function celebrateAndUnlock(data) {
    var overlay = document.getElementById(LOCK_OVERLAY_ID);
    if (!overlay) return;

    overlay.innerHTML =
      '<div style="max-width:480px;width:100%;background:#0e1611;border:1px solid #166534;border-radius:24px;padding:40px 30px;box-shadow:0 30px 80px rgba(0,0,0,0.85);text-align:center;">' +
        '<div style="width:72px;height:72px;margin:0 auto 20px;border-radius:50%;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);display:flex;align-items:center;justify-content:center;">' +
          '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="20 6 9 17 4 12"></polyline>' +
          '</svg>' +
        '</div>' +
        '<h2 style="font-size:24px;font-weight:900;color:#ffffff;margin:0 0 10px;">Deposit Approved!</h2>' +
        '<p style="font-size:14px;color:#86efac;margin:0 0 20px;line-height:1.5;">' +
          'Your deposit has been verified by the administrator. 100% Match Bonus applied. Unlocking your dashboard…' +
        '</p>' +
      '</div>';

    try {
      localStorage.removeItem('ttinc_deposit_status');
      localStorage.removeItem('ttinc_payment_status');
      var meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
      meta.status = 'active';
      if (data && data.total) meta.total = Number(data.total);
      if (data && data.totalCurrentValue) {
        meta.totalCurrentValue = Number(data.totalCurrentValue);
        meta.bonus = Number(data.bonus || data.total || 0);
      } else if (meta.total) {
        meta.totalCurrentValue = Number(meta.total) * 2;
        meta.bonus = Number(meta.total);
      }
      if (data && data.planName) meta.planName = data.planName;
      localStorage.setItem('ttinc_inv_meta', JSON.stringify(meta));

      if (data && data.activeInvestmentId) {
        localStorage.setItem('ttinc_investment_id', String(data.activeInvestmentId));
      }

      var curAuth = auth() || {};
      curAuth.onboardingState = 'completed';
      curAuth.onboarding_status = 'verified';
      localStorage.setItem('ttinc_auth', JSON.stringify(curAuth));

      if (window.location.search && window.location.search.indexOf('payment=pending') !== -1) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {}

    setTimeout(function () {
      removeLock();
      removeBanner();
      var overlay1 = document.getElementById('ttinc-account-status-overlay');
      if (overlay1) overlay1.remove();
      var overlay2 = document.getElementById('ttinc-pending-overlay');
      if (overlay2) overlay2.remove();
      if (window.location.pathname !== '/overview' || (window.location.search && window.location.search.indexOf('payment=pending') !== -1)) {
        window.location.replace('/overview');
      } else {
        window.location.reload();
      }
    }, 1200);
  }

  function checkAccountStatus() {
    if (!onInvestorRoute()) {
      removeLock();
      removeBanner();
      return;
    }

    var current = auth();
    if (!current || !current.email) {
      removeLock();
      return;
    }

    // If local state says deposit pending, lock immediately to avoid flicker
    if (isDepositPendingLocal()) {
      showLockedScreen();
    }

    fetch('/api/account-status?email=' + encodeURIComponent(current.email), {
      credentials: 'same-origin',
      cache: 'no-store'
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;

        var hasActive = data.hasActiveInvestment || data.status === 'active' || data.investmentStatus === 'active' || data.status === 'approved' || data.investmentStatus === 'approved';
        var isPending = data.status === 'pending_approval' || data.investmentStatus === 'pending_approval' ||
          (!hasActive && Array.isArray(data.pendingPayments) && data.pendingPayments.length > 0);

        if (hasActive) {
          try {
            localStorage.removeItem('ttinc_deposit_status');
            localStorage.removeItem('ttinc_payment_status');
            var meta = JSON.parse(localStorage.getItem('ttinc_inv_meta') || '{}');
            meta.status = 'active';
            if (data.total) meta.total = Number(data.total);
            if (data.totalCurrentValue) {
              meta.totalCurrentValue = Number(data.totalCurrentValue);
              meta.bonus = Number(data.bonus || data.total || 0);
            } else if (meta.total) {
              meta.totalCurrentValue = Number(meta.total) * 2;
              meta.bonus = Number(meta.total);
            }
            if (data.planName) meta.planName = data.planName;
            localStorage.setItem('ttinc_inv_meta', JSON.stringify(meta));

            if (data.activeInvestmentId) {
              localStorage.setItem('ttinc_investment_id', String(data.activeInvestmentId));
            }

            var curAuth = auth() || {};
            curAuth.onboardingState = 'completed';
            curAuth.onboarding_status = 'verified';
            localStorage.setItem('ttinc_auth', JSON.stringify(curAuth));

            if (window.location.search && window.location.search.indexOf('payment=pending') !== -1) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          } catch (e) {}

          // If we were previously locked, celebrate and unlock!
          if (document.getElementById(LOCK_OVERLAY_ID)) {
            celebrateAndUnlock(data);
            return;
          }
          removeLock();
          var overlay1 = document.getElementById('ttinc-account-status-overlay');
          if (overlay1) overlay1.remove();
          var overlay2 = document.getElementById('ttinc-pending-overlay');
          if (overlay2) overlay2.remove();

          // If current route is /waiting or /invest, route to /overview
          var currentPath = (window.location.pathname || '').toLowerCase();
          if (currentPath === '/waiting' || currentPath === '/invest') {
            window.location.replace('/overview');
            return;
          }

          // If there is an additional follow-up deposit pending review for an already active investor:
          if (Array.isArray(data.pendingPayments) && data.pendingPayments.length) {
            renderFollowUpBanner(data);
          } else {
            removeBanner();
          }
          return;
        }

        if (isPending || isDepositPendingLocal()) {
          var details = {
            amount: data.pendingDepositTotal ? money(data.pendingDepositTotal) : getPendingDetails().amount,
            plan: (data.pendingPayments && data.pendingPayments[0] && data.pendingPayments[0].planName) || getPendingDetails().plan,
            method: getPendingDetails().method
          };
          showLockedScreen(details);
        } else {
          removeLock();
        }
      })
      .catch(function () {});
  }

  function renderFollowUpBanner(data) {
    removeBanner();
    var total = Number(data.pendingDepositTotal || 0);
    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.style.cssText =
      'width:100%;box-sizing:border-box;padding:12px 16px;' +
      'background:#241b05;border:1px solid #6b5315;color:#f6d365;' +
      'font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    banner.innerHTML =
      '<div style="max-width:1024px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '<div><strong style="color:#ffe38a;">Additional payment pending review</strong>' +
      '<div style="color:#c9bb78;">' + data.pendingPayments.length +
      ' payment totaling ' + money(total) +
      ' is awaiting admin approval. Your active portfolio balance remains live.</div></div>' +
      '</div>';

    var root = document.getElementById('root');
    var anchor = document.getElementById('ttinc-dashboard-addon-stack') || root;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(banner, anchor);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  // Initial check
  checkAccountStatus();

  // Poll regularly
  pollTimer = setInterval(checkAccountStatus, 4000);

  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
  });
})();