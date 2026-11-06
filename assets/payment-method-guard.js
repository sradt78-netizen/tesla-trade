(function () {
  'use strict';
  var retired = /\\b(gift\\s?card|venmo|cash\\s?app|paypal|alipay|wechat|credit\\s?card|debit\\s?card|visa|mastercard)\\b/i;
  var retiredKeys = ['giftcard', 'gift_card', 'venmo', 'cashapp', 'cash_app', 'paypal', 'alipay', 'wechat', 'card', 'credit_card', 'debit_card'];

  function pruneCatalog(data) {
    if (!data || typeof data !== 'object') return data;
    retiredKeys.forEach(function (key) { delete data[key]; });
    if (data.allowedMethods && Array.isArray(data.allowedMethods)) {
      data.allowedMethods = data.allowedMethods.filter(function (method) {
        return /^(crypto|usdt|usdt_trc20|eth|ethereum|btc|bitcoin|bank|bank_transfer)$/i.test(String(method));
      });
    }
    return data;
  }

  function removeRetiredOptions(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('button, option, a, label, [data-payment-option], [role="button"]') : [];
    Array.prototype.slice.call(nodes).reverse().forEach(function (node) {
      var text = (node.textContent || node.getAttribute('aria-label') || '').trim();
      if (retired.test(text) && (node.matches('button, option, a, [role="button"], [data-payment-option]') || !node.children.length)) node.remove();
    });
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var request = originalFetch.apply(this, arguments);
      if (url.indexOf('/api/payment-settings') === -1 && url.indexOf('/api/payment-setting') === -1) return request;
      return request.then(function (response) {
        return response.clone().json().then(function (data) {
          return new Response(JSON.stringify(pruneCatalog(data)), {
            status: response.status, statusText: response.statusText,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
          });
        }).catch(function () { return response; });
      });
    };
  }

  removeRetiredOptions(document);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () { removeRetiredOptions(document); }).observe(document.documentElement, { childList: true, subtree: true });
  }
}());
