/*
 * Tesla Trade Inc — authoritative investment onboarding flow.
 *
 * The compiled React bundle and earlier compatibility scripts contain older
 * investment/payment screens. This file deliberately owns /invest and
 * /payment so that an investor always follows the same sequence:
 *
 *   1. Stock/watchlist context
 *   2. Investment plan
 *   3. Amount + payment method
 *   4. "I've made payment" → proof upload
 *
 * The final request prefers /api/payment-submit.php and retries the routed
 * /api/investments endpoint only when the direct cPanel route is unavailable.
 * Both requests carry the same proof-required multipart payload.
 */
(function () {
  'use strict';

  var FLOW_ID = 'ttinc-authoritative-investment-flow';
  var STATE_KEY = 'ttinc_investment_flow_state';
  var MAX_PROOF_BYTES = 10 * 1024 * 1024;
  var ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];

  var PLANS = [
    {
      id: 'starter_ai',
      name: 'Explorer',
      roi: '70%',
      term: '30 days',
      min: 30,
      max: 1000,
      range: '$30 – $1,000',
      description: 'A straightforward starting tier for a smaller allocation with enhanced returns.'
    },
    {
      id: 'growth_ai',
      name: 'Pioneer',
      roi: '100%',
      term: '60 days',
      min: 1000,
      max: 10000,
      range: '$1,000 – $10,000',
      description: 'A broader allocation tier for investors seeking increased exposure and maximized profit.'
    },
    {
      id: 'elite_ai',
      name: 'Visionary',
      roi: '140%',
      term: '90 days',
      min: 10000,
      max: 25000,
      range: '$10,000 – $25,000',
      description: 'A higher-capital tier for larger participation with boosted institutional yield.'
    },
    {
      id: 'legacy_elite_ai',
      name: 'Pioneer Plus',
      roi: '200%',
      term: '180 days',
      min: 25000,
      max: 55000,
      range: '$25,000 – $55,000',
      description: 'The highest tier for premier allocations with our top institutional yield tier.'
    },
    {
      id: 'dogecoin_reserve',
      name: 'Dogecoin Reserve Fund',
      roi: '60%–140%',
      term: '90 days',
      min: 1000,
      max: 25000,
      range: '$1,000 – $25,000',
      description: 'A dedicated digital-asset participation fund with enhanced performance.'
    }
  ];

  var FALLBACK_STOCKS = [
    { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', price: 248.50, private: false },
    { symbol: 'X', name: 'X Corp.', exchange: 'Private', price: 54.20, private: true },
    { symbol: 'STARLINK', name: 'Starlink', exchange: 'Private', price: 185.40, private: true },
    { symbol: 'SPACEX', name: 'SpaceX', exchange: 'Private', price: 185.40, private: true },
    { symbol: 'XAI', name: 'xAI Corp. (Grok)', exchange: 'Private', price: 48.75, private: true },
    { symbol: 'NEURA', name: 'Neuralink Corporation', exchange: 'Private', price: 22.10, private: true },
    { symbol: 'TBC', name: 'The Boring Company', exchange: 'Private', price: 12.80, private: true }
  ];

  var PAYMENT_METHODS = [
    { key: 'usdt', label: 'USDT (TRC-20)', field: 'address', icon: '₮' },
    { key: 'bank', label: 'Bank transfer', field: 'account', icon: '⌂' },
    { key: 'btc', label: 'Bitcoin (BTC)', field: 'address', icon: '₿' },
    { key: 'eth', label: 'Ethereum (ERC-20)', field: 'address', icon: '◆' },
    { key: 'paypal', label: 'PayPal', field: 'handle', icon: 'P' },
    { key: 'cashapp', label: 'Cash App', field: 'handle', icon: '$' },
    { key: 'venmo', label: 'Venmo', field: 'handle', icon: 'V' },
    { key: 'alipay', label: 'Alipay', field: 'account', icon: 'A' },
    { key: 'wechat', label: 'WeChat Pay', field: 'account', icon: 'W' }
  ];

  var state = {
    step: 1,
    stock: 'TSLA',
    planId: '',
    amount: '',
    method: 'usdt',
    stocks: FALLBACK_STOCKS.slice(),
    settings: null,
    submitting: false
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function money(value) {
    return '$' + Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
    } catch (error) {
      return null;
    }
  }

  function findPlan(planId) {
    for (var i = 0; i < PLANS.length; i += 1) {
      if (PLANS[i].id === planId) return PLANS[i];
    }
    return null;
  }

  function findStock(symbol) {
    for (var i = 0; i < state.stocks.length; i += 1) {
      if (state.stocks[i].symbol === symbol) return state.stocks[i];
    }
    return state.stocks[0] || FALLBACK_STOCKS[0];
  }

  function persistState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        step: state.step,
        stock: state.stock,
        planId: state.planId,
        amount: state.amount,
        method: state.method
      }));
    } catch (error) {}
  }

  function restoreState() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (saved.stock) state.stock = saved.stock;
      if (saved.planId && findPlan(saved.planId)) state.planId = saved.planId;
      if (saved.amount) state.amount = String(saved.amount);
      if (saved.method) state.method = saved.method;
      if (saved.step >= 1 && saved.step <= 4) state.step = Number(saved.step);
    } catch (error) {}
  }

  function clearState() {
    try { sessionStorage.removeItem(STATE_KEY); } catch (error) {}
  }

  function routeIsOwned() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    return path === '/invest' || path.indexOf('/invest/') === 0
      || path === '/payment' || path === '/p';
  }

  function hideLegacySurfaces() {
    [
      'ttinc-investment-plan-flow',
      'ttinc-investment-payment-methods',
      'ttinc-deposit-confirmation',
      'ttinc-plans-ov'
    ].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
        element.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function addStyles() {
    if (document.getElementById('ttinc-authoritative-investment-flow-styles')) return;
    var style = document.createElement('style');
    style.id = 'ttinc-authoritative-investment-flow-styles';
    style.textContent =
      '#' + FLOW_ID + '{position:fixed;inset:0;z-index:2147483647;overflow-y:auto;background:#090909;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}' +
      '#' + FLOW_ID + ' *{box-sizing:border-box;}' +
      '#' + FLOW_ID + ' .ttif-shell{width:min(760px,100%);margin:0 auto;padding:22px 18px 80px;}' +
      '#' + FLOW_ID + ' .ttif-top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:34px;}' +
      '#' + FLOW_ID + ' .ttif-brand{font-size:12px;font-weight:900;letter-spacing:2.5px;}' +
      '#' + FLOW_ID + ' .ttif-brand b{color:#e31937;}' +
      '#' + FLOW_ID + ' .ttif-back{background:none;border:0;color:#9ca3af;padding:5px 0;font:inherit;font-size:13px;cursor:pointer;}' +
      '#' + FLOW_ID + ' .ttif-progress{display:flex;gap:6px;margin-bottom:28px;}' +
      '#' + FLOW_ID + ' .ttif-progress span{height:4px;flex:1;border-radius:99px;background:#242424;}' +
      '#' + FLOW_ID + ' .ttif-progress span.active{background:#d4af37;}' +
      '#' + FLOW_ID + ' .ttif-kicker{color:#d4af37;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;}' +
      '#' + FLOW_ID + ' h1{font-size:34px;line-height:1.08;letter-spacing:-1px;margin:0 0 12px;}' +
      '#' + FLOW_ID + ' h1 em{color:#d4af37;font-style:normal;}' +
      '#' + FLOW_ID + ' .ttif-sub{color:#929292;font-size:14px;line-height:1.7;margin:0 0 24px;}' +
      '#' + FLOW_ID + ' .ttif-note{background:#171305;border:1px solid #4a3c0d;border-radius:12px;color:#c9bb78;font-size:12px;line-height:1.6;padding:13px 14px;margin:0 0 18px;}' +
      '#' + FLOW_ID + ' .ttif-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}' +
      '#' + FLOW_ID + ' .ttif-stock,#' + FLOW_ID + ' .ttif-plan{appearance:none;text-align:left;width:100%;background:#121212;border:1px solid #292929;border-radius:15px;color:#fff;padding:15px;cursor:pointer;font:inherit;transition:border-color .15s,transform .15s,background .15s;}' +
      '#' + FLOW_ID + ' .ttif-stock:hover,#' + FLOW_ID + ' .ttif-plan:hover{border-color:#8b7120;transform:translateY(-1px);}' +
      '#' + FLOW_ID + ' .ttif-stock.selected,#' + FLOW_ID + ' .ttif-plan.selected{border-color:#d4af37;background:#191706;box-shadow:0 0 0 1px #d4af3733;}' +
      '#' + FLOW_ID + ' .ttif-symbol{font-size:18px;font-weight:900;letter-spacing:.4px;}' +
      '#' + FLOW_ID + ' .ttif-stock-name{color:#e5e7eb;font-size:12px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '#' + FLOW_ID + ' .ttif-meta{color:#707070;font-size:11px;margin-top:8px;}' +
      '#' + FLOW_ID + ' .ttif-stock-price{color:#d4af37;font-size:12px;font-weight:800;margin-top:12px;}' +
      '#' + FLOW_ID + ' .ttif-plan{padding:18px;margin-bottom:10px;}' +
      '#' + FLOW_ID + ' .ttif-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}' +
      '#' + FLOW_ID + ' .ttif-plan-name{font-size:20px;font-weight:900;}' +
      '#' + FLOW_ID + ' .ttif-plan-roi{color:#d4af37;font-size:20px;font-weight:900;white-space:nowrap;}' +
      '#' + FLOW_ID + ' .ttif-plan-range{color:#9ca3af;font-size:12px;margin-top:9px;}' +
      '#' + FLOW_ID + ' .ttif-plan-description{color:#777;font-size:12px;line-height:1.55;margin-top:10px;}' +
      '#' + FLOW_ID + ' .ttif-field{display:block;color:#aaa;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin:0 0 7px;}' +
      '#' + FLOW_ID + ' input[type=number],#' + FLOW_ID + ' input[type=text],#' + FLOW_ID + ' input[type=file],#' + FLOW_ID + ' select{width:100%;background:#111;border:1px solid #333;border-radius:10px;color:#fff;padding:13px;font:inherit;font-size:14px;}' +
      '#' + FLOW_ID + ' input:focus,#' + FLOW_ID + ' select:focus{outline:0;border-color:#d4af37;}' +
      '#' + FLOW_ID + ' .ttif-card{background:#121212;border:1px solid #292929;border-radius:16px;padding:18px;margin-bottom:14px;}' +
      '#' + FLOW_ID + ' .ttif-summary{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid #292929;padding-bottom:15px;margin-bottom:15px;}' +
      '#' + FLOW_ID + ' .ttif-summary-label{color:#777;font-size:10px;letter-spacing:1px;text-transform:uppercase;}' +
      '#' + FLOW_ID + ' .ttif-summary-value{font-size:18px;font-weight:900;line-height:1.25;margin-top:4px;overflow-wrap:anywhere;}' +
      '#' + FLOW_ID + ' .ttif-method{display:flex;align-items:center;gap:11px;width:100%;border:1px solid #292929;background:#0d0d0d;border-radius:11px;padding:12px;text-align:left;color:#fff;cursor:pointer;font:inherit;margin-bottom:8px;}' +
      '#' + FLOW_ID + ' .ttif-method.selected{border-color:#d4af37;background:#191706;}' +
      '#' + FLOW_ID + ' .ttif-method-icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#24200e;color:#d4af37;font-weight:900;flex:none;}' +
      '#' + FLOW_ID + ' .ttif-method-copy{min-width:0;flex:1;}' +
      '#' + FLOW_ID + ' .ttif-method-name{font-size:13px;font-weight:800;}' +
      '#' + FLOW_ID + ' .ttif-method-detail{font-size:11px;color:#777;overflow-wrap:anywhere;margin-top:3px;}' +
      '#' + FLOW_ID + ' .ttif-copy{flex:none;border:1px solid #4a421d;border-radius:7px;background:#171305;color:#d4af37;padding:7px 9px;font:inherit;font-size:10px;font-weight:800;cursor:pointer;}' +
      '#' + FLOW_ID + ' .ttif-copy:hover,#' + FLOW_ID + ' .ttif-copy:focus-visible{border-color:#d4af37;background:#211b08;outline:0;}' +
      '#' + FLOW_ID + ' .ttif-copy.is-copied{color:#b7d8bf;border-color:#28613b;background:#0d1a0d;}' +
      '#' + FLOW_ID + ' .ttif-check{color:#d4af37;font-size:15px;font-weight:900;}' +
      '#' + FLOW_ID + ' .ttif-actions{display:flex;gap:10px;margin-top:20px;}' +
      '#' + FLOW_ID + ' .ttif-button{width:100%;border:0;border-radius:11px;padding:15px;background:#d4af37;color:#090909;font:inherit;font-size:13px;font-weight:900;letter-spacing:.7px;cursor:pointer;text-transform:uppercase;}' +
      '#' + FLOW_ID + ' .ttif-button.secondary{background:#1d1d1d;border:1px solid #333;color:#c5c5c5;}' +
      '#' + FLOW_ID + ' .ttif-button:disabled{opacity:.55;cursor:not-allowed;}' +
      '#' + FLOW_ID + ' .ttif-error{display:none;color:#fca5a5;background:#2b0b0b;border:1px solid #632222;border-radius:9px;font-size:12px;line-height:1.55;padding:11px;margin-top:12px;}' +
      '#' + FLOW_ID + ' .ttif-success{background:#0d1a0d;border:1px solid #28613b;color:#b7d8bf;border-radius:13px;padding:15px;font-size:13px;line-height:1.6;}' +
      '#' + FLOW_ID + ' .ttif-file-name{color:#9ca3af;font-size:12px;line-height:1.5;margin-top:8px;}' +
      '#' + FLOW_ID + ' .ttif-small{color:#666;font-size:11px;line-height:1.55;margin-top:8px;}' +
      '@media(max-width:560px){#' + FLOW_ID + ' h1{font-size:29px;}#' + FLOW_ID + ' .ttif-grid{grid-template-columns:1fr 1fr;}#' + FLOW_ID + ' .ttif-actions{flex-direction:column-reverse;}#' + FLOW_ID + ' .ttif-summary>div{min-width:0;max-width:100%;}#' + FLOW_ID + ' .ttif-summary>div:last-child{text-align:left!important;} }';
    document.head.appendChild(style);
  }

  function setError(message) {
    var box = document.getElementById('ttif-error');
    if (!box) return;
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
  }

  function go(path) {
    window.location.href = path;
  }

  function showStepHeader(step, title, subtitle) {
    return '<div class="ttif-progress" aria-label="Investment progress">' +
      [1, 2, 3, 4].map(function (number) {
        return '<span class="' + (number <= step ? 'active' : '') + '"></span>';
      }).join('') +
      '</div>' +
      '<div class="ttif-kicker">Step ' + step + ' of 4</div>' +
      '<h1>' + title + '</h1>' +
      '<p class="ttif-sub">' + subtitle + '</p>';
  }

  function renderShell(content) {
    var existing = document.getElementById(FLOW_ID);
    if (existing) existing.remove();
    addStyles();
    var root = document.createElement('div');
    root.id = FLOW_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Investment flow');
    root.innerHTML =
      '<div class="ttif-shell">' +
        '<div class="ttif-top">' +
          '<button type="button" class="ttif-back" data-action="back">← Back</button>' +
          '<div class="ttif-brand"><b>TESLA</b> TRADE INC</div>' +
        '</div>' +
        content +
      '</div>';
    document.body.appendChild(root);
    return root;
  }

  function renderStockStep() {
    var stockCards = state.stocks.map(function (stock) {
      var selected = stock.symbol === state.stock;
      var price = Number(stock.price || 0);
      return '<button type="button" class="ttif-stock ' + (selected ? 'selected' : '') + '" data-stock="' + esc(stock.symbol) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        '<div class="ttif-symbol">' + esc(stock.symbol) + '</div>' +
        '<div class="ttif-stock-name">' + esc(stock.name) + '</div>' +
        '<div class="ttif-meta">' + esc(stock.exchange || (stock.private ? 'Private' : 'Market')) + '</div>' +
        '<div class="ttif-stock-price">' + (price ? money(price) : 'Watchlist') + '</div>' +
      '</button>';
    }).join('');

    var root = renderShell(
      showStepHeader(1, 'Choose an <em>investment</em> focus', 'Review the stocks and innovation companies supported by our current investment programs. No amount is entered on this screen.') +
      '<div class="ttif-note">This is a watchlist step only. Select the company you want to focus on, then click Next to view the available investment plans.</div>' +
      '<div class="ttif-grid" id="ttif-stock-list">' + stockCards + '</div>' +
      '<div class="ttif-actions"><button type="button" class="ttif-button" data-action="next-stock">Next: view plans →</button></div>' +
      '<div id="ttif-error" class="ttif-error"></div>'
    );
    root.querySelectorAll('[data-stock]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.stock = button.getAttribute('data-stock') || 'TSLA';
        persistState();
        root.querySelectorAll('[data-stock]').forEach(function (other) {
          var isSelected = other === button;
          other.classList.toggle('selected', isSelected);
          other.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
      });
    });
  }

  function renderPlanStep() {
    var planCards = PLANS.map(function (plan) {
      return '<button type="button" class="ttif-plan" data-plan="' + esc(plan.id) + '">' +
        '<div class="ttif-plan-head"><span class="ttif-plan-name">' + esc(plan.name) + '</span><span class="ttif-plan-roi">' + esc(plan.roi) + '</span></div>' +
        '<div class="ttif-plan-range">' + esc(plan.range) + ' · ' + esc(plan.term) + '</div>' +
        '<div class="ttif-plan-description">' + esc(plan.description) + '</div>' +
        '<div class="ttif-small">Select this plan to enter your investment amount.</div>' +
      '</button>';
    }).join('');

    var selectedStock = findStock(state.stock);
    var root = renderShell(
      showStepHeader(2, 'Choose your <em>investment plan</em>', 'You selected ' + esc(selectedStock.name) + '. Choose a plan before entering an amount.') +
      '<div class="ttif-note">Your amount is not requested yet. Each plan has its own minimum, maximum, term, and projected return range.</div>' +
      '<div id="ttif-plan-list">' + planCards + '</div>' +
      '<div id="ttif-error" class="ttif-error"></div>'
    );
    root.querySelectorAll('[data-plan]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.planId = button.getAttribute('data-plan') || '';
        state.amount = '';
        state.step = 3;
        persistState();
        renderAmountStep();
      });
    });
  }

  function methodDetail(settings, method) {
    var value = settings && settings[method.key];
    if (!value || typeof value !== 'object') return 'Payment details will be provided by support.';
    if (method.key === 'bank') {
      return [
        value.bankName || value.name,
        value.accountName,
        value.accountNumber || value.account,
        value.routing ? 'Routing: ' + value.routing : '',
        value.swift ? 'SWIFT: ' + value.swift : ''
      ].filter(Boolean).join(' · ') || 'Not configured — contact support';
    }
    return value[method.field] || value.address || value.handle || value.account || 'Not configured — contact support';
  }

  function copyPaymentText(value, button) {
    var text = String(value == null ? '' : value).trim();
    if (!text || !button) return;

    function copied() {
      var original = button.textContent;
      button.textContent = 'Copied';
      button.classList.add('is-copied');
      button.setAttribute('aria-label', 'Copied payment information');
      window.setTimeout(function () {
        button.textContent = original;
        button.classList.remove('is-copied');
        button.setAttribute('aria-label', 'Copy payment information');
      }, 1600);
    }

    function fallbackCopy() {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      var copiedSuccessfully = false;
      try { copiedSuccessfully = document.execCommand('copy'); } catch (error) {}
      textarea.remove();
      if (copiedSuccessfully) copied();
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(copied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function renderMethods(root) {
    var list = root.querySelector('#ttif-method-list');
    if (!list) return;
    list.innerHTML = PAYMENT_METHODS.map(function (method) {
      var selected = method.key === state.method;
      var detail = methodDetail(state.settings, method);
      var copyValue = method.label + ': ' + detail;
      return '<div class="ttif-method ' + (selected ? 'selected' : '') + '" data-method="' + method.key + '" role="button" tabindex="0" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        '<span class="ttif-method-icon">' + esc(method.icon) + '</span>' +
        '<span class="ttif-method-copy"><span class="ttif-method-name">' + esc(method.label) + '</span>' +
        '<span class="ttif-method-detail">' + esc(detail) + '</span></span>' +
        '<button type="button" class="ttif-copy" data-copy-value="' + esc(copyValue) + '" aria-label="Copy payment information">Copy</button>' +
        '<span class="ttif-check">' + (selected ? '✓' : '') + '</span>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-method]').forEach(function (button) {
      function selectMethod() {
        state.method = button.getAttribute('data-method') || 'usdt';
        persistState();
        renderMethods(root);
      }
      button.addEventListener('click', selectMethod);
      button.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectMethod();
        }
      });
    });
    list.querySelectorAll('[data-copy-value]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        copyPaymentText(button.getAttribute('data-copy-value'), button);
      });
    });
  }

  function loadPaymentSettings(root) {
    function apply(settings) {
      state.settings = settings && typeof settings === 'object' ? settings : {};
      renderMethods(root);
    }
    fetch('/api/payment-settings', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Payment settings unavailable');
        return response.json();
      })
      .then(apply)
      .catch(function () {
        fetch('/api/payment-settings.php', { credentials: 'same-origin', cache: 'no-store' })
          .then(function (response) { return response.ok ? response.json() : {}; })
          .then(apply)
          .catch(function () { apply({}); });
      });
  }

  function renderAmountStep() {
    var plan = findPlan(state.planId) || PLANS[0];
    var selectedStock = findStock(state.stock);
    var root = renderShell(
      showStepHeader(3, 'Set your <em>investment amount</em>', 'Choose an amount within the selected plan range. You will review payment details before confirming that payment was made.') +
      '<div class="ttif-card">' +
        '<div class="ttif-summary"><div><div class="ttif-summary-label">Focus</div><div class="ttif-summary-value">' + esc(selectedStock.name) + '</div></div><div style="text-align:right"><div class="ttif-summary-label">Plan</div><div class="ttif-summary-value">' + esc(plan.name) + '</div></div></div>' +
        '<label class="ttif-field" for="ttif-amount">Investment amount (USD)</label>' +
        '<input id="ttif-amount" type="number" min="' + plan.min + '" max="' + plan.max + '" step="0.01" inputmode="decimal" placeholder="' + esc(plan.min.toFixed(2)) + ' – ' + esc(plan.max.toFixed(2)) + '" value="' + esc(state.amount) + '">' +
        '<div class="ttif-small">Allowed range: ' + esc(plan.range) + '</div>' +
      '</div>' +
      '<div class="ttif-card"><div class="ttif-field">Choose where to send payment</div><div id="ttif-method-list"><div class="ttif-small">Loading payment methods…</div></div></div>' +
      '<div id="ttif-error" class="ttif-error"></div>' +
      '<div class="ttif-actions"><button type="button" class="ttif-button secondary" data-action="back-plan">Back</button><button type="button" class="ttif-button" data-action="made-payment">I’ve made payment →</button></div>'
    );
    renderMethods(root);
    loadPaymentSettings(root);
    root.querySelector('#ttif-amount').addEventListener('input', function (event) {
      state.amount = event.target.value;
      persistState();
      setError('');
    });
    root.querySelector('[data-action="made-payment"]').addEventListener('click', function () {
      var amount = Number(root.querySelector('#ttif-amount').value || 0);
      if (!Number.isFinite(amount) || amount < plan.min || amount > plan.max) {
        setError('Enter an amount from ' + money(plan.min) + ' to ' + money(plan.max) + ' for the ' + plan.name + ' plan.');
        return;
      }
      state.amount = amount.toFixed(2);
      state.step = 4;
      persistState();
      renderProofStep();
    });
    root.querySelector('[data-action="back-plan"]').addEventListener('click', function () {
      state.step = 2;
      persistState();
      renderPlanStep();
    });
  }

  function submitProof(root) {
    if (state.submitting) return;
    var account = getAuth();
    var plan = findPlan(state.planId);
    var input = root.querySelector('#ttif-proof');
    var referenceInput = root.querySelector('#ttif-reference');
    var proof = input && input.files ? input.files[0] : null;
    var error = root.querySelector('#ttif-error');
    var button = root.querySelector('[data-action="submit-proof"]');
    var amount = Number(state.amount || 0);

    function fail(message) {
      if (error) {
        error.textContent = message;
        error.style.display = 'block';
      }
      if (button) {
        button.disabled = false;
        button.textContent = 'SUBMIT PROOF FOR REVIEW';
      }
      state.submitting = false;
    }

    if (!account || !account.email) {
      fail('Please sign in before submitting your payment proof. Your selected stock, plan, and amount are saved on this device.');
      return;
    }
    if (!plan || !amount || amount < plan.min || amount > plan.max) {
      fail('Your selected plan or amount is no longer valid. Go back and choose the plan again.');
      return;
    }
    if (!proof) {
      fail('Upload your proof of payment before submitting.');
      return;
    }
    var extension = String(proof.name || '').toLowerCase().split('.').pop();
    if (ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
      fail('Upload a JPG, PNG, WEBP, GIF, or PDF file.');
      return;
    }
    if (proof.size <= 0 || proof.size > MAX_PROOF_BYTES) {
      fail('Payment proof must be a non-empty file under 10MB.');
      return;
    }

    state.submitting = true;
    if (error) error.style.display = 'none';
    if (button) {
      button.disabled = true;
      button.textContent = 'SUBMITTING…';
    }

    var selectedStock = findStock(state.stock);
    var form = new FormData();
    form.append('userId', account.email);
    form.append('userName', account.name || account.email);
    form.append('userEmail', account.email);
    form.append('email', account.email);
    form.append('portfolio', selectedStock.name + ' · ' + plan.name);
    form.append('total', amount.toFixed(2));
    form.append('amount', amount.toFixed(2));
    form.append('method', state.method || 'usdt');
    form.append('planId', plan.id);
    form.append('planName', plan.name);
    form.append('projectedRoi', plan.roi.replace('%', '').split('–')[0]);
    form.append('paymentConfirmed', 'true');
    form.append('paymentReference', referenceInput ? referenceInput.value.trim() : '');
    form.append('paymentProof', proof, proof.name);

    function sendPayment(url) {
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: form
      }).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (parseError) {}
          if (
            !response.ok ||
            (!data.success && data.status !== 'pending_approval')
          ) {
            var failure = new Error(
              data.error || data.message || 'Payment proof could not be submitted.'
            );
            /*
             * Some cPanel installs do not expose direct PHP files through
             * the same rewrite rules as /api/*. Retry only routing failures;
             * never retry a validation or session error.
             */
            failure.retryable = response.status === 404 ||
              response.status === 405 ||
              response.status === 401 ||
              response.status === 403 ||
              response.status >= 500;
            throw failure;
          }
          return data;
        });
      });
    }

    sendPayment('/api/payment-submit').catch(function (firstError) {
      if (!firstError.retryable) throw firstError;
      return sendPayment('/api/payment-submit.php');
    }).catch(function (secondError) {
      if (!secondError.retryable) throw secondError;
      return sendPayment('/api/investments');
    }).then(function (data) {
      /*
       * Returning investors already have a canonical wallet. Keep the
       * dashboard pointed at it while this new deposit is pending; replacing
       * it with data.id makes the dashboard show only the new deposit and can
       * trigger the onboarding lock.
       */
      try {
        var invId = data.dashboardInvestmentId || data.id || ('dep_' + Date.now());
        var chosenPlan = findPlan(state.planId) || PLANS[0];
        localStorage.setItem('ttinc_investment_id', invId);
        localStorage.setItem('ttinc_payment_status', 'pending_approval');
        localStorage.setItem('ttinc_deposit_status', 'pending_approval');
        localStorage.setItem('ttinc_deposit_amount', String(state.amount || ''));
        localStorage.setItem('ttinc_deposit_plan', chosenPlan.name || 'Explorer');
        localStorage.setItem('ttinc_deposit_method', String(state.method || 'USDT (TRC-20)'));
        localStorage.setItem(
          'ttinc_inv_meta',
          JSON.stringify({
            id: invId,
            txId: data.id || invId,
            total: Number(state.amount || 0),
            totalCurrentValue: Number(state.amount || 0),
            status: 'pending_approval',
            planName: chosenPlan.name || 'Explorer',
            method: state.method
          })
        );
        sessionStorage.removeItem('ttinc_email_onboarding');
        sessionStorage.removeItem('ttinc_social_onboarding');
        sessionStorage.removeItem('ttinc_registration_pending');
      } catch (error) {}
      clearState();
      root.querySelector('.ttif-shell').innerHTML =
        '<div class="ttif-top"><div class="ttif-brand"><b>TESLA</b> TRADE INC</div></div>' +
        '<div class="ttif-kicker">Submitted for review</div>' +
        '<h1>Payment proof <em>received</em></h1>' +
        '<div class="ttif-success">Your payment proof has been uploaded and your investment is pending admin approval. You can track its status from your dashboard.</div>' +
        '<div class="ttif-actions"><button type="button" class="ttif-button" data-action="dashboard">Go to dashboard →</button></div>';
      root.querySelector('[data-action="dashboard"]').addEventListener('click', function () { go('/overview'); });
      /*
       * Do not strand the investor on a success screen. The dashboard gate
       * owns the pending-approval state and will poll until an admin acts.
       * Keep the button above as a no-JavaScript/manual fallback.
       */
      if (!window.__ttincDisableAutoPendingRedirect) {
        setTimeout(function () { go('/overview?payment=pending'); }, 450);
      }
    }).catch(function (submitError) {
      fail(submitError.message || 'Payment proof could not be submitted. Please try again.');
    });
  }

  function renderProofStep() {
    var plan = findPlan(state.planId) || PLANS[0];
    var selectedStock = findStock(state.stock);
    var root = renderShell(
      showStepHeader(4, 'Upload your <em>proof of payment</em>', 'You confirmed that payment was made. Upload the receipt or transfer proof so the admin team can review your investment.') +
      '<div class="ttif-card">' +
        '<div class="ttif-summary"><div><div class="ttif-summary-label">Investment focus</div><div class="ttif-summary-value">' + esc(selectedStock.name) + '</div></div><div style="text-align:right"><div class="ttif-summary-label">Amount</div><div class="ttif-summary-value">' + money(state.amount) + '</div></div></div>' +
        '<div class="ttif-small" style="margin-top:-4px;margin-bottom:14px;">' + esc(plan.name) + ' · ' + esc(plan.term) + ' · Payment method: ' + esc(state.method) + '</div>' +
        '<label class="ttif-field" for="ttif-proof">Proof of payment</label>' +
        '<input id="ttif-proof" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,image/jpeg,image/png,image/webp,image/gif,application/pdf">' +
        '<div id="ttif-file-name" class="ttif-file-name">Required · JPG, PNG, WEBP, GIF, or PDF · maximum 10MB</div>' +
        '<label class="ttif-field" for="ttif-reference" style="margin-top:18px;">Payment reference (optional)</label>' +
        '<input id="ttif-reference" type="text" maxlength="255" placeholder="Transaction ID or bank reference">' +
      '</div>' +
      '<div id="ttif-error" class="ttif-error"></div>' +
      '<div class="ttif-actions"><button type="button" class="ttif-button secondary" data-action="back-amount">Back</button><button type="button" class="ttif-button" data-action="submit-proof">Submit proof for review</button></div>'
    );
    root.querySelector('#ttif-proof').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      var label = root.querySelector('#ttif-file-name');
      if (label) label.textContent = file ? file.name + ' · ' + Math.ceil(file.size / 1024) + ' KB' : 'Required · JPG, PNG, WEBP, GIF, or PDF · maximum 10MB';
      setError('');
    });
    root.querySelector('[data-action="submit-proof"]').addEventListener('click', function () { submitProof(root); });
    root.querySelector('[data-action="back-amount"]').addEventListener('click', function () {
      state.step = 3;
      persistState();
      renderAmountStep();
    });
  }

  function render() {
    if (!routeIsOwned()) {
      var old = document.getElementById(FLOW_ID);
      if (old) old.remove();
      return;
    }
    hideLegacySurfaces();
    if (location.pathname === '/payment' || location.pathname === '/p') {
      if (!state.planId) {
        state.step = 1;
        renderStockStep();
      } else {
        state.step = state.step < 3 ? 3 : state.step;
        if (state.step === 4) renderProofStep();
        else renderAmountStep();
      }
      return;
    }
    if (state.step === 2 && state.planId) renderPlanStep();
    else if (state.step === 3 && state.planId) renderAmountStep();
    else if (state.step === 4 && state.planId) renderProofStep();
    else {
      state.step = 1;
      renderStockStep();
    }
  }

  function loadStocks() {
    fetch('/api/stocks', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Stocks unavailable');
        return response.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.stocks) && data.stocks.length) {
          var liveStocks = data.stocks.slice();
          var symbols = liveStocks.map(function (stock) { return stock.symbol; });
          /*
           * The backend watchlist currently exposes SpaceX but not a separate
           * Starlink row. Keep Starlink visible in the investor UI rather than
           * letting a successful API response remove it.
           */
          FALLBACK_STOCKS.forEach(function (stock) {
            if (symbols.indexOf(stock.symbol) === -1) liveStocks.push(stock);
          });
          state.stocks = liveStocks;
          if (!findStock(state.stock)) state.stock = state.stocks[0].symbol;
          if (routeIsOwned() && state.step === 1) renderStockStep();
        }
      })
      .catch(function () {});
  }

  function onNextStock() {
    state.step = 2;
    persistState();
    renderPlanStep();
  }

  function installGlobalActions() {
    document.addEventListener('click', function (event) {
      var element = event.target && event.target.closest ? event.target.closest('button,a') : null;
      if (!element || element.closest('#' + FLOW_ID)) return;
      var label = (element.textContent || '').trim().toLowerCase();
      if (label === 'invest' || label === 'invest now' || label === 'subscribe to plan') {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.step = 1;
        state.planId = '';
        state.amount = '';
        persistState();
        go('/invest');
      }
    }, true);

    document.addEventListener('click', function (event) {
      var element = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
      if (!element) return;
      var action = element.getAttribute('data-action');
      if (action === 'back') {
        event.preventDefault();
        if (state.step <= 1) {
          go('/overview');
        } else if (state.step === 2) {
          state.step = 1;
          persistState();
          renderStockStep();
        } else if (state.step === 3) {
          state.step = 2;
          persistState();
          renderPlanStep();
        } else if (state.step === 4) {
          state.step = 3;
          persistState();
          renderAmountStep();
        }
      } else if (action === 'next-stock') {
        event.preventDefault();
        onNextStock();
      }
    }, true);
  }

  function hookHistory() {
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      history[method] = function () {
        var result = original.apply(this, arguments);
        setTimeout(render, 0);
        return result;
      };
    });
    window.addEventListener('popstate', render);
  }

  restoreState();
  installGlobalActions();
  hookHistory();
  render();
  if (routeIsOwned()) loadStocks();

  /*
   * Exposed only for the dependency-free mock regression test. It is not
   * used by the production UI.
   */
  window.__ttincInvestmentFlowContract = {
    steps: ['stocks', 'plans', 'amount-and-payment', 'proof-upload'],
    planCount: PLANS.length,
    allowedProofExtensions: ALLOWED_EXTENSIONS.slice(),
    maxProofBytes: MAX_PROOF_BYTES,
    validateAmount: function (planId, value) {
      var plan = findPlan(planId);
      var amount = Number(value);
      return !!plan && Number.isFinite(amount) && amount >= plan.min && amount <= plan.max;
    }
  };
}());