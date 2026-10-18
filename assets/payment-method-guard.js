(function () {
  'use strict';

  /*
   * The payment screen is a compiled asset and may remain cached on a host
   * after the server catalog changes. Hide the retired method from any old
   * bundle and remove it from payment-settings responses before React can
   * render it. The server also rejects the retired alias.
   */
  function removeGiftCardNodes(root) {
    var nodes = (root || document).querySelectorAll
      ? (root || document).querySelectorAll('button, option, a, label, [data-payment-option], [role="button"], div, span')
      : [];
    Array.prototype.slice.call(nodes).reverse().forEach(function (node) {
      var text = (node.textContent || node.getAttribute('aria-label') || '').trim().toLowerCase();
      if (text.indexOf('gift') !== -1 && (!node.children.length || node.hasAttribute('data-payment-option'))) {
        node.remove();
      }
    });
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
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

    safeSetFetch(function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var request = originalFetch.apply(this, arguments);
      if (url.indexOf('/api/payment-settings') === -1 && url.indexOf('/api/payment-setting') === -1) {
        return request;
      }
      return request.then(function (response) {
        return response.clone().json().then(function (data) {
          if (data && typeof data === 'object') delete data.giftcard;
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
          });
        }).catch(function () { return response; });
      });
    };
  }

  removeGiftCardNodes(document);
  var observer = new MutationObserver(function () { removeGiftCardNodes(document); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}());