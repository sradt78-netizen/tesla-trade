(function () {
  'use strict';
  var ALLOWED = ['usdt', 'eth', 'btc', 'bank'];
  function isAllowed(value) { return ALLOWED.indexOf(String(value || '').trim().toLowerCase()) !== -1; }
  function filterPaymentSettings(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    var output = Object.assign({}, data);
    if (output.settings && typeof output.settings === 'object') {
      var nested = {};
      ALLOWED.forEach(function (key) { if (output.settings[key]) nested[key] = output.settings[key]; });
      output.settings = nested;
      return output;
    }
    var filtered = {};
    ALLOWED.forEach(function (key) { if (output[key]) filtered[key] = output[key]; });
    return filtered;
  }
  function pruneControls(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('select').forEach(function (select) {
      if (!/payment|method/i.test((select.id || '') + ' ' + (select.name || ''))) return;
      Array.prototype.slice.call(select.options).forEach(function (option) { if (option.value && !isAllowed(option.value)) option.remove(); });
    });
    scope.querySelectorAll('input[type="radio"][name*="payment"], input[type="radio"][name*="method"]').forEach(function (input) {
      if (isAllowed(input.value)) return;
      var option = input.closest('label, [data-payment-option], [data-payment-method], .payment-option');
      if (option) option.remove();
    });
    scope.querySelectorAll('[data-payment-method], [data-payment-option]').forEach(function (node) {
      var value = node.getAttribute('data-payment-method') || node.getAttribute('data-payment-option') || '';
      if (value && !isAllowed(value)) node.remove();
    });
  }
  function removeGiftCardNodes(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-payment-option], option, button, label') : [];
    Array.prototype.slice.call(nodes).forEach(function (node) {
      var value = node.getAttribute('value') || node.getAttribute('data-payment-option') || node.getAttribute('data-payment-method') || '';
      var label = (node.textContent || '').trim().toLowerCase();
      if (/gift.?card/.test(value.toLowerCase()) || (/gift.?card/.test(label) && !node.querySelector('button, input'))) node.remove();
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
          return new Response(JSON.stringify(filterPaymentSettings(data)), {
            status: response.status, statusText: response.statusText,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
          });
        }).catch(function () { return response; });
      });
    };
  }
  function cleanup() { pruneControls(document); removeGiftCardNodes(document); }
  cleanup();
  var observer = new MutationObserver(cleanup);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}());
