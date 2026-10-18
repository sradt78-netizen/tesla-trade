(function () {
  'use strict';

  var STORAGE_KEY = 'ttinc_invitation_code';
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var KNOWN_PATHS = [
    '/', '/login', '/register', '/overview', '/dashboard', '/portfolio',
    '/invest', '/payment', '/deposit', '/make-deposit', '/transactions',
    '/withdraw', '/profile', '/settings', '/kyc', '/admin', '/store',
    '/shop', '/cars', '/plans', '/my-plans', '/orders', '/support',
    '/waiting', '/connect', '/buy-crypto', '/fund', '/trading-state',
    '/investments', '/p', '/about.php', '/contact.php', '/faq.php',
    '/press.php', '/privacy.php', '/terms.php'
  ];

  function normalize(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function validFormat(value) {
    return /^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(normalize(value));
  }

  function clearStoredCode() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (error) {}
  }

  function set(value) {
    var code = normalize(value);
    if (!validFormat(code)) {
      clearStoredCode();
      return '';
    }
    try { localStorage.setItem(STORAGE_KEY, code); } catch (error) {}
    try { sessionStorage.setItem(STORAGE_KEY, code); } catch (error) {}
    return code;
  }

  function get() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY) ||
        sessionStorage.getItem(STORAGE_KEY) ||
        '';
      return validFormat(stored) ? normalize(stored) : '';
    } catch (error) {
      return '';
    }
  }

  function hasSavedAccount() {
    try {
      var account = JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
      return !!(
        account &&
        typeof account.email === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim())
      );
    } catch (error) {
      return false;
    }
  }

  function queryCode() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('invitation') ||
        params.get('invitationCode') ||
        params.get('invite') ||
        '';
    } catch (error) {
      return '';
    }
  }

  /*
   * The public shell is invitation-only. Add the lock class before the body
   * is parsed so the homepage cannot flash before the access screen appears.
   */
  document.documentElement.classList.add('ttinc-invitation-locked');

  function pathCode() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    if (KNOWN_PATHS.indexOf(pathname) !== -1 || pathname.indexOf('/api/') === 0) return '';
    var parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1 || parts[0].indexOf('.') !== -1) return '';
    return parts[0];
  }

  var suppliedFromLink = !!(queryCode() || pathCode());
  var supplied = queryCode() || pathCode();
  if (validFormat(supplied)) {
    set(supplied);
    if (pathCode()) {
      window.location.replace('/register?invitation=' + encodeURIComponent(normalize(supplied)));
      return;
    }
  }

  window.ttincInvitation = {
    get: get,
    set: set,
    normalize: normalize,
    validFormat: validFormat,
    isFromLink: function () { return suppliedFromLink; }
  };

  /*
   * The invitation gate is for first-time visitors. A browser with a saved
   * verified account must be able to open the dashboard without re-entering
   * its invitation after a refresh, redirect, or new tab.
   */
  if (hasSavedAccount()) {
    document.documentElement.classList.remove('ttinc-invitation-locked');
    return;
  }

  function verifyCode(code) {
    if (!nativeFetch) return Promise.reject(new Error('Invitation verification is unavailable.'));
    var controller = window.AbortController ? new AbortController() : null;
    var timeoutId = setTimeout(function () {
      if (controller) controller.abort();
    }, 12000);
    var request = nativeFetch(
      '/api/invitation/verify?code=' + encodeURIComponent(normalize(code)),
      {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }
    ).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || !payload.valid) {
          var error = new Error(payload.error || 'This invitation code is invalid or no longer active.');
          error.invitationInvalid =
            (response.ok && !payload.valid) ||
            response.status === 401 ||
            response.status === 403 ||
            response.status === 422;
          throw error;
        }
        return payload;
      });
    });
    return request.then(function (payload) {
      clearTimeout(timeoutId);
      return payload;
    }, function (error) {
      clearTimeout(timeoutId);
      if (error && error.name === 'AbortError') {
        throw new Error('Invitation verification timed out. Please try again.');
      }
      throw error;
    });
  }

  function unlockPage() {
    document.documentElement.classList.remove('ttinc-invitation-locked');
    var gate = document.getElementById('ttinc-invitation-gate');
    if (gate) gate.remove();
  }

  function setGateMessage(message, isError) {
    var messageNode = document.querySelector('#ttinc-invitation-gate [data-invitation-message]');
    if (!messageNode) return;
    messageNode.textContent = message;
    messageNode.classList.toggle('ttinc-invitation-error', !!isError);
  }

  function showGate() {
    if (
      !document.body ||
      !document.documentElement.classList.contains('ttinc-invitation-locked') ||
      document.getElementById('ttinc-invitation-gate')
    ) return;

    var gate = document.createElement('main');
    gate.id = 'ttinc-invitation-gate';
    gate.setAttribute('aria-labelledby', 'ttinc-invitation-title');
    gate.innerHTML =
      '<div class="ttinc-invitation-card">' +
        '<div class="ttinc-invitation-mark" aria-hidden="true">T</div>' +
        '<div class="ttinc-invitation-kicker">Private access</div>' +
        '<h1 id="ttinc-invitation-title">Invitation required</h1>' +
        '<p>Enter the invitation code you received to continue to Tesla Trade Inc.</p>' +
        '<form novalidate>' +
          '<label for="ttinc-invitation-input">Invitation code</label>' +
          '<input id="ttinc-invitation-input" name="invitationCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter invitation code" required>' +
          '<button type="submit">CONTINUE</button>' +
          '<div class="ttinc-invitation-message" data-invitation-message role="status" aria-live="polite">Use the invitation link you received or enter your code.</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(gate);

    var form = gate.querySelector('form');
    var input = gate.querySelector('input');
    input.value = get();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var code = normalize(input.value);
      if (!validFormat(code)) {
        setGateMessage('Enter a valid invitation code.', true);
        input.focus();
        return;
      }

      var button = form.querySelector('button');
      button.disabled = true;
      button.textContent = 'CHECKING…';
      setGateMessage('Checking your invitation…', false);
      verifyCode(code).then(function () {
        set(code);
        unlockPage();
      }).catch(function (error) {
        button.disabled = false;
        button.textContent = 'CONTINUE';
        setGateMessage(error.message || 'This invitation code is invalid or no longer active.', true);
        input.focus();
      });
    });
  }

  function beginAccessCheck() {
    var code = get();
    if (!code) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showGate);
      } else {
        showGate();
      }
      return;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        showGate();
        setGateMessage('Checking your invitation…', false);
      });
    } else {
      showGate();
      setGateMessage('Checking your invitation…', false);
    }

    verifyCode(code).then(function () {
      unlockPage();
    }).catch(function (error) {
      if (error && error.invitationInvalid) clearStoredCode();
      showGate();
      setGateMessage(error.message || 'This invitation code is invalid or no longer active.', true);
    });
  }

  function addRegisterField() {
    if (window.location.pathname !== '/register') return;
    var root = document.getElementById('root');
    if (!root) return;
    var emailInput = root.querySelector('input[type="email"]');
    if (!emailInput) return;
    var form = root.querySelector('form') ||
      emailInput.closest('[role="form"]') ||
      emailInput.parentElement;
    if (!form) return;

    var existing = root.querySelector('#ttinc-register-invitation');
    var field = existing
      ? (existing.closest('#ttinc-register-invitation-field') || existing.parentElement)
      : null;
    if (!existing) {
      field = document.createElement('div');
      field.id = 'ttinc-register-invitation-field';
      field.style.cssText = 'margin:0 0 14px;';
      field.innerHTML =
        '<label for="ttinc-register-invitation" style="display:block;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:.12em;margin:0 0 7px">Invitation code</label>' +
        '<input id="ttinc-register-invitation" name="invitationCode" type="text" autocomplete="off" required placeholder="Enter your invitation code" style="width:100%;box-sizing:border-box;background:#1a1a1a;border:1px solid #303030;border-radius:10px;color:#fff;padding:13px 14px;font-size:15px;outline:none">' +
        '<div style="color:#777;font-size:11px;line-height:1.45;margin-top:6px">Use the invitation link you received, or enter the code provided by your inviter.</div>';
      var anchor = form.querySelector('input[type="password"]') ||
        form.querySelector('button[type="submit"]') || form.firstChild;
      form.insertBefore(field, anchor || null);
      existing = field.querySelector('#ttinc-register-invitation');
      existing.addEventListener('input', function () { set(existing.value); });
    }

    var code = get();
    if (code && !existing.value) existing.value = code;
    if (code && suppliedFromLink) {
      /*
       * A signed invitation URL is already the user's proof of invitation.
       * Keep the value in the form for the account API, but do not make the
       * user type or validate it a second time. This also covers social OAuth
       * callbacks, where the browser returns to /register after leaving the
       * site.
       */
      existing.value = code;
      existing.readOnly = true;
      existing.required = false;
      existing.setAttribute('data-ttinc-invitation-source', 'link');
      existing.style.opacity = '0.72';
      var label = field.querySelector('label');
      if (label) label.textContent = 'Invitation code (from your link)';
      var help = field.querySelector('div');
      if (help) help.textContent = 'This invitation code was filled from your invitation link.';
    }
  }

  function injectInvitation(url, options) {
    var urlString = typeof url === 'string'
      ? url
      : (url && url.url ? url.url : String(url || ''));
    var route = urlString.split('?')[0].replace(/\/+$/, '');
    if (!options || String(options.method || 'GET').toUpperCase() !== 'POST') {
      return [url, options];
    }
    if (
      route !== '/api/accounts' &&
      route !== '/api/auth/social-session'
    ) {
      return [url, options];
    }

    var code = get();
    if (!code || !options.body || typeof options.body !== 'string') {
      return [url, options];
    }
    try {
      var payload = JSON.parse(options.body);
      if (!payload.invitationCode) {
        payload.invitationCode = code;
        options = Object.assign({}, options, { body: JSON.stringify(payload) });
      }
    } catch (error) {}
    return [url, options];
  }

  var originalFetch = window.fetch && window.fetch.bind(window);
  if (originalFetch) {
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

    safeSetFetch(function (url, options) {
      var prepared = injectInvitation(url, options);
      return originalFetch(prepared[0], prepared[1]);
    });
  }

  var observer = new MutationObserver(addRegisterField);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addRegisterField();
  setInterval(addRegisterField, 700);
  beginAccessCheck();
}());