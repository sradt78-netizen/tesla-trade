(function () {
  'use strict';

  var MOBILE_DASHBOARD_ROUTES = [
    '/admin',
    '/dashboard',
    '/overview',
    '/invest',
    '/payment',
    '/deposit',
    '/withdraw',
    '/kyc',
    '/support',
    '/settings',
    '/transactions',
    '/buy-crypto',
    '/my-plans',
    '/orders',
    '/connect',
    '/login',
    '/register',
    '/waiting',
  ];

  var LANGUAGE_BY_COUNTRY = {
    CN: 'zh-CN',
    SG: 'zh-CN',
    TW: 'zh-TW',
    HK: 'zh-TW',
    MO: 'zh-TW',
    ES: 'es',
    MX: 'es',
    AR: 'es',
    CL: 'es',
    CO: 'es',
    PE: 'es',
    FR: 'fr',
    BE: 'fr',
    DE: 'de',
    AT: 'de',
    CH: 'de',
    PT: 'pt',
    BR: 'pt',
    JP: 'ja',
    KR: 'ko',
    RU: 'ru',
    IT: 'it',
    TR: 'tr',
    ID: 'id',
    NL: 'nl',
    IN: 'hi',
  };

  var LANGUAGE_LABELS = {
    en: 'English',
    de: 'Deutsch',
    es: 'Español',
    fr: 'Français',
    hi: 'हिन्दी',
    id: 'Bahasa Indonesia',
    it: 'Italiano',
    ja: '日本語',
    ko: '한국어',
    nl: 'Nederlands',
    pt: 'Português',
    ru: 'Русский',
    tr: 'Türkçe',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
  };

  var SUPPORTED_LOCALES = Object.keys(LANGUAGE_LABELS);
  var MANUAL_LOCALE_KEY = 'traceFundManualLocale';
  var PUBLIC_FOOTER_ID = 'ttinc-site-footer';

  function isDashboardRoute() {
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    var finalRoute = '/' + pathname.split('/').filter(Boolean).pop();
    return (
      MOBILE_DASHBOARD_ROUTES.indexOf(pathname) !== -1 ||
      MOBILE_DASHBOARD_ROUTES.indexOf(finalRoute) !== -1
    );
  }

  function updateDashboardMode() {
    var active = isDashboardRoute();
    document.body.classList.toggle('trace-dashboard-mobile', active);
    document.documentElement.dataset.traceFundDashboard = active
      ? 'true'
      : 'false';
    var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    document.documentElement.classList.toggle('ttinc-home-route', pathname === '/');
  }

  function patchHistory() {
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = window.history[method];
      window.history[method] = function () {
        var result = original.apply(this, arguments);
        updateDashboardMode();
        return result;
      };
    });
    window.addEventListener('popstate', updateDashboardMode);
  }

  function addOnsiteReviewPrompt() {
    var reviewSection = document.getElementById('ttinc-reviews-section');
    if (!reviewSection || reviewSection.querySelector('.trace-onsite-review-cta')) return;

    var cta = document.createElement('div');
    cta.className = 'trace-onsite-review-cta';
    cta.innerHTML =
      '<div class="trace-onsite-review-brand"><span class="trace-trustpilot-mark" aria-hidden="true">★</span> <span>Trustpilot</span></div>' +
      '<div class="trace-onsite-review-copy">' +
        '<strong>12,000+ reviews</strong>' +
        '<span class="trace-onsite-review-stars" aria-label="5 out of 5 stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></span>' +
        '<span class="trace-onsite-review-rating">Customer reviews</span>' +
      '</div>';
    reviewSection.querySelector('.ttinc-home-section-inner').appendChild(cta);
  }

  function setCookie(name, value, maxAge) {
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      '; path=/; max-age=' +
      String(maxAge) +
      '; samesite=lax';
  }

  function startGoogleTranslate(locale) {
    if (!locale) return;

    document.documentElement.lang = locale;
    if (locale === 'en') return;
    setCookie('googtrans', '/en/' + locale, 86400 * 30);

    var host = document.getElementById('trace-fund-translate-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'trace-fund-translate-host';
      document.body.appendChild(host);
    }

    window.traceFundGoogleTranslateInit = function () {
      if (!window.google || !window.google.translate) return;
      if (host.dataset.traceFundInitialized === 'true') return;
      host.dataset.traceFundInitialized = 'true';
      try {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: 'de,en,es,fr,hi,id,it,ja,ko,nl,pt,ru,tr,zh-CN,zh-TW',
            autoDisplay: false,
          },
          'trace-fund-translate-host',
        );
      } catch (error) {
        // A blocked or incompatible widget must not break the rest of the
        // public page. The host remains marked only after construction
        // succeeds, so a later script callback can retry safely.
        delete host.dataset.traceFundInitialized;
      }
    };

    // The API can already be present from a cached script, a browser
    // extension, or a test double. Invoke the callback immediately in that
    // case; relying only on the script's cb query parameter leaves the
    // selector inert when the script was loaded before this page code ran.
    if (window.google && window.google.translate) {
      window.traceFundGoogleTranslateInit();
    } else if (!document.querySelector('script[data-trace-fund-google-translate]')) {
      var script = document.createElement('script');
      script.src =
        'https://translate.google.com/translate_a/element.js?cb=traceFundGoogleTranslateInit';
      script.async = true;
      script.setAttribute('data-trace-fund-google-translate', 'true');
      document.head.appendChild(script);
    }
  }

  function browserLocale() {
    var language = String(
      (navigator.languages && navigator.languages[0]) || navigator.language || 'en',
    ).replace('_', '-').toLowerCase();
    var supported = ['de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr'];
    var base = language.split('-')[0];
    if (language === 'zh-tw' || language === 'zh-hk' || language === 'zh-mo') return 'zh-TW';
    if (language === 'zh-cn' || language === 'zh-sg') return 'zh-CN';
    return supported.indexOf(base) !== -1 ? base : 'en';
  }

  function countryToLocale(payload) {
    var data = payload || {};
    var candidates = [
      data.country_code,
      data.countryCode,
      data.country_code2,
      data.country,
      data.country_name,
      data.location && (data.location.country_code || data.location.country),
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || '').trim();
      var code = value.toUpperCase();
      if (LANGUAGE_BY_COUNTRY[code]) return LANGUAGE_BY_COUNTRY[code];

      var normalized = value.replace('_', '-').toLowerCase();
      if (normalized === 'zh-tw' || normalized === 'zh-hk') return 'zh-TW';
      if (normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-CN';
      var base = normalized.split('-')[0];
      if (['de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr'].indexOf(base) !== -1) {
        return base;
      }
    }

    return null;
  }

  function currentGoogleLocale() {
    var cookies = String(document.cookie || '').split(';');
    for (var i = cookies.length - 1; i >= 0; i -= 1) {
      var entry = cookies[i].trim();
      if (entry.indexOf('googtrans=') !== 0) continue;
      var value = entry.slice('googtrans='.length);
      try { value = decodeURIComponent(value); } catch (error) {}
      var parts = String(value).split('/');
      var locale = parts[parts.length - 1] || 'en';
      return locale === 'en' ? 'en' : locale;
    }
    return 'en';
  }

  function addLanguagePicker() {
    var disclosure = document.querySelector('.trace-disclosure');
    if (!disclosure || disclosure.querySelector('.trace-language-control')) return;

    var control = document.createElement('label');
    control.className = 'trace-language-control';
    // The selector remains available, but the redundant visible label is
    // intentionally omitted from the footer.
    control.innerHTML = '<select aria-label="Choose language"></select>';
    var select = control.querySelector('select');
    var selected = currentGoogleLocale();
    SUPPORTED_LOCALES.forEach(function (locale) {
      var option = document.createElement('option');
      option.value = locale;
      option.textContent = LANGUAGE_LABELS[locale];
      option.selected = locale === selected;
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      reloadForLocale(select.value, true);
    });
    disclosure.appendChild(control);
  }

  function clearGoogleTranslateState() {
    // Google Translate has used both host-only and domain cookies over time.
    // Clearing only path=/ leaves the older cookie alive on some cPanel
    // hosts, so a return to English can reload the previous translation.
    var paths = ['/', window.location.pathname || '/'];
    var domains = ['', window.location.hostname, '.' + window.location.hostname];
    paths.forEach(function (path) {
      domains.forEach(function (domain) {
        var domainPart = domain ? '; domain=' + domain : '';
        document.cookie =
          'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' +
          path + '; max-age=0; samesite=lax' + domainPart;
      });
    });
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('data-visitor-locale');
    if (document.body) {
      document.body.classList.remove('translated-ltr', 'translated-rtl');
      document.body.style.top = '0';
    }
  }

  function setLocaleCookie(locale) {
    if (locale === 'en') {
      clearGoogleTranslateState();
      return;
    }
    clearGoogleTranslateState();
    setCookie('googtrans', '/en/' + locale, 86400 * 30);
  }

  function reloadForLocale(locale, isManualSelection) {
    var current = currentGoogleLocale();
    if (current === locale) return false;

    // The cookie is the source of truth.  Do not use a sessionStorage marker
    // here: it made a sequence such as English → French → German → French
    // silently ignore the final French selection because French was the
    // first language chosen.
    if (isManualSelection) {
      try { sessionStorage.setItem(MANUAL_LOCALE_KEY, 'true'); } catch (error) {}
    }
    setLocaleCookie(locale);
    window.location.reload();
    return true;
  }

  function requestVisitorLocale() {
    addOnsiteReviewPrompt();

    var savedLocale = currentGoogleLocale();
    if (savedLocale !== 'en') {
      document.documentElement.dataset.visitorLocale = savedLocale;
      document.documentElement.lang = savedLocale;
      startGoogleTranslate(savedLocale);
      return;
    }

    // Language selection is an explicit user action. Browser-language and
    // geo-detection used to run after the page loaded and could race with a
    // manual switch back to English, causing a one-frame return to the old
    // translation. Keep English stable until the picker is used.
    try {
      if (sessionStorage.getItem(MANUAL_LOCALE_KEY) === 'true') return;
    } catch (error) {}
  }

  function relocateDisclosure() {
    var disclosure = document.querySelector('.trace-disclosure');
    if (!disclosure || disclosure.classList.contains('trace-disclosure-footer')) return;

    var footer = document.getElementById(PUBLIC_FOOTER_ID) || document.querySelector('footer');
    disclosure.classList.add('trace-disclosure-footer');
    if (footer && footer.parentNode) {
      footer.appendChild(disclosure);
    } else {
      document.body.appendChild(disclosure);
    }
  }

  function init() {
    updateDashboardMode();
    patchHistory();
    requestVisitorLocale();
    addOnsiteReviewPrompt();
    relocateDisclosure();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();