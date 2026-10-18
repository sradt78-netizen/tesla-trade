(function () {
  'use strict';

  var TARGET_KEY = 'ttinc_portfolio_focus';
  var FOCUS_ID = 'ttinc-portfolio-focus';
  var STACK_ID = 'ttinc-dashboard-addon-stack';
  var NAVIGATION_KEY = 'ttinc_portfolio_entry_pending';
  var lastRoute = '';

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

  function readAuth() {
    try {
      return JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
    } catch (error) {
      return null;
    }
  }

  function readTarget() {
    try {
      return JSON.parse(sessionStorage.getItem(TARGET_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function markPortfolioEntry() {
    try { sessionStorage.setItem(NAVIGATION_KEY, '1'); } catch (error) {}
  }

  function portfolioEntryPending() {
    try { return sessionStorage.getItem(NAVIGATION_KEY) === '1'; } catch (error) { return false; }
  }

  function clearPortfolioEntry() {
    try { sessionStorage.removeItem(NAVIGATION_KEY); } catch (error) {}
  }

  function resetScrollPosition() {
    try {
      if (window.history && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
    } catch (error) {}
    if (typeof window.scrollTo === 'function') {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (error) {
        try { window.scrollTo(0, 0); } catch (ignored) {}
      }
    }
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (error) {}
  }

  function focusPortfolioContent() {
    if (window.location.pathname !== '/dashboard' || !portfolioEntryPending()) return false;
    // /dashboard is the compiled portfolio screen.  Consume the entry marker
    // immediately instead of waiting for the optional add-on/API panel.  The
    // old wait left navigation dependent on content below the React app and
    // made the first viewport look like a blank dark screen until scrolling.
    clearPortfolioEntry();
    resetScrollPosition();
    /*
     * Mobile browsers can restore the scroll offset from /portfolio after the
     * new document has painted, which otherwise wins over the first reset.
     * These are one-shot route-entry corrections, not a scroll listener, so
     * normal investor scrolling is unaffected after the dashboard opens.
     */
    [0, 120, 600, 1200].forEach(function (delay) {
      setTimeout(resetScrollPosition, delay);
    });
    return true;
  }

  function choosePlan(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var active = rows.filter(function (row) { return row.status === 'active'; });
    if (!active.length) return rows[0];
    active.sort(function (a, b) {
      var aPrimary = !a.depositParentId;
      var bPrimary = !b.depositParentId;
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return active[0];
  }

  function rememberPlan(plan) {
    if (!plan || !plan.id) return;
    try {
      localStorage.setItem('ttinc_investment_id', plan.id);
      localStorage.setItem('ttinc_inv_meta', JSON.stringify(plan));
    } catch (error) {}
  }

  function fetchPlans(auth) {
    if (!auth || !auth.email) return Promise.resolve([]);
    return fetch('/api/investments?email=' + encodeURIComponent(auth.email), {
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(function (response) {
      if (!response.ok) throw new Error('Could not load investment plans');
      return response.json();
    }).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    });
  }

  function renderFocus(plan) {
    if (window.location.pathname !== '/dashboard' || document.getElementById(FOCUS_ID)) return;
    var host = document.getElementById(STACK_ID);
    if (!host) return;

    var name = plan.planName || plan.portfolio || 'Investment plan';
    var status = plan.status === 'active' ? 'Active' : (plan.status || 'Pending');
    var principal = Number(plan.total || 0);
    var current = Number(plan.totalCurrentValue || plan.total || 0);
    var roi = plan.roiPercent == null ? '—' : Number(plan.roiPercent).toFixed(2) + '%';
    var cycle = plan.planCycle || 'Investment term';

    var section = document.createElement('section');
    section.id = FOCUS_ID;
    section.style.cssText = [
      'max-width:900px', 'margin:18px auto', 'padding:20px',
      'background:#111', 'border:1px solid #d4af3766', 'border-radius:18px',
      'color:#fff', 'font-family:Arial,sans-serif', 'box-shadow:0 16px 40px #0005'
    ].join(';');
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;">' +
        '<div>' +
          '<div style="color:#d4af37;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;font-weight:800;">Your invested plan</div>' +
          '<h2 style="font-size:24px;line-height:1.1;margin:7px 0 5px;">' + escapeHtml(name) + '</h2>' +
          '<p style="margin:0;color:#94a3b8;font-size:12px;">This is the active plan connected to your portfolio.</p>' +
        '</div>' +
        '<span style="color:#34d399;background:#064e3b;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">' +
          escapeHtml(status) +
        '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:20px;">' +
        '<div style="background:#0a0a0a;border-radius:10px;padding:12px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;">Principal</div><strong style="display:block;margin-top:5px;font-size:16px;">' + money(principal) + '</strong></div>' +
        '<div style="background:#0a0a0a;border-radius:10px;padding:12px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;">Current value</div><strong style="display:block;margin-top:5px;font-size:16px;">' + money(current) + '</strong></div>' +
        '<div style="background:#0a0a0a;border-radius:10px;padding:12px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;">Projected ROI</div><strong style="display:block;margin-top:5px;font-size:16px;">' + escapeHtml(roi) + '</strong></div>' +
        '<div style="background:#0a0a0a;border-radius:10px;padding:12px;"><div style="color:#64748b;font-size:10px;text-transform:uppercase;">Term</div><strong style="display:block;margin-top:5px;font-size:16px;">' + escapeHtml(cycle) + '</strong></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">' +
        '<a href="/withdraw" style="display:inline-block;background:#e31937;color:#fff;text-decoration:none;border-radius:9px;padding:11px 14px;font-size:12px;font-weight:800;">Request withdrawal</a>' +
        '<a href="/transactions" style="display:inline-block;color:#d4af37;border:1px solid #d4af3766;text-decoration:none;border-radius:9px;padding:10px 14px;font-size:12px;font-weight:800;">View transactions</a>' +
      '</div>';

    host.appendChild(section);
  }

  function loadPlan() {
    var auth = readAuth();
    if (!auth || !auth.email || window.location.pathname !== '/dashboard') return;
    var target = readTarget();
    if (target && target.id) renderFocus(target);

    fetchPlans(auth)
      .then(function (rows) {
        var plan = choosePlan(rows);
        if (!plan) return;
        var cachedId = null;
        try { cachedId = localStorage.getItem('ttinc_investment_id'); } catch (error) {}
        rememberPlan(plan);
        sessionStorage.setItem(TARGET_KEY, JSON.stringify(plan));
        // The compiled dashboard reads its investment only once, during its
        // first effect. If a previous session left a stale ID behind, it
        // remains on the full-screen loader while this compatibility card is
        // rendered below it. Reload once with the validated ID so the real
        // portfolio screen renders in the first viewport.
        if (cachedId !== plan.id && typeof window.location.reload === 'function') {
          window.location.reload();
          return;
        }
        renderFocus(plan);
      })
      .catch(function () {
        // Keep the dashboard visible. The existing app will show its own
        // account error state instead of leaving the user on a blank screen.
      });
  }

  function redirectPortfolioRoute() {
    if (window.location.pathname !== '/portfolio' || window.__ttincPortfolioRedirecting) return;
    window.__ttincPortfolioRedirecting = true;
    markPortfolioEntry();
    resetScrollPosition();
    // /dashboard is the compiled app's portfolio screen. A real navigation
    // avoids the old replaceState/popstate/setInterval race that made the
    // screen visibly bounce between routes on mobile.
    window.location.replace('/dashboard');
  }

  function navigateToPortfolio() {
    markPortfolioEntry();
    resetScrollPosition();

    var auth = readAuth();
    if (!auth || !auth.email) {
      window.location.replace('/dashboard');
      return;
    }

    // Always validate the cached ID before entering the compiled dashboard.
    // A stale ID makes that screen wait forever, even though the account has
    // a valid plan that the fallback panel can render after scrolling.
    fetchPlans(auth).then(function (rows) {
      var plan = choosePlan(rows);
      if (plan) rememberPlan(plan);
    }).catch(function () {
      // Fall back to the cached value if the lookup is temporarily unavailable.
    }).then(function () {
      window.location.replace('/dashboard');
    });
  }

  function ensureAddonStack() {
    if (window.location.pathname !== '/dashboard') return null;
    var stack = document.getElementById(STACK_ID);
    if (!stack) {
      stack = document.createElement('div');
      stack.id = STACK_ID;
      stack.style.cssText = [
        'width:100%',
        'max-width:1024px',
        'margin:0 auto',
        // Leave room for the fixed Back/menu controls on small screens.
        'padding:52px 16px 24px',
        'box-sizing:border-box'
      ].join(';');
      /*
       * The React dashboard root has a min-height of 100vh while it loads.
       * Appending this compatibility card after #root put the first useful
       * portfolio content one full viewport below the click target. Keep the
       * card in normal flow, but place it before the app root so it is the
       * first content an investor sees while the live dashboard hydrates.
       */
      var root = document.getElementById('root');
      if (root && root.parentNode) {
        root.parentNode.insertBefore(stack, root);
      } else {
        document.body.appendChild(stack);
      }
    }
    return stack;
  }

  function handleRoute() {
    var path = window.location.pathname;
    if (path !== lastRoute) {
      lastRoute = path;
      if (path === '/dashboard') {
        ensureAddonStack();
        // Render the cached/validated plan on the first paint. Waiting here
        // recreated the blank mobile viewport even when the plan was ready.
        loadPlan();
      } else {
        var stack = document.getElementById(STACK_ID);
        if (stack) stack.remove();
      }
    }
    focusPortfolioContent();
  }

  // Cover normal links and client-side history navigation without polling.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href="/portfolio"],a[href="/dashboard"]');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var text = (link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    var isPortfolioDashboardLink = href === '/dashboard' &&
      (text.indexOf('view portfolio') !== -1 || text.indexOf('my portfolio') !== -1);
    if (href !== '/portfolio' && !isPortfolioDashboardLink) return;
    event.preventDefault();
    navigateToPortfolio();
  }, true);
  window.addEventListener('popstate', redirectPortfolioRoute);
  redirectPortfolioRoute();
  handleRoute();
  setInterval(handleRoute, 400);
}());