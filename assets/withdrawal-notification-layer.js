(function () {
  'use strict';

  var ENHANCED_CLASS = 'ttinc-withdrawal-notification';

  function enhanceWithdrawalNotification() {
    // The notification is rendered by the compiled app, but it must remain
    // above page-level market data and other stacking contexts on every
    // route, not only while it happens to be a direct child of #root.
    var elements = document.querySelectorAll('[class]');
    for (var i = 0; i < elements.length; i += 1) {
      var element = elements[i];
      if (
        element.classList.contains('fixed') &&
        element.classList.contains('bottom-20') &&
        element.classList.contains('left-4')
      ) {
        element.classList.add(ENHANCED_CLASS);
        element.style.setProperty('position', 'fixed', 'important');
        element.style.setProperty('z-index', '2147483647', 'important');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceWithdrawalNotification, { once: true });
  } else {
    enhanceWithdrawalNotification();
  }

  new MutationObserver(enhanceWithdrawalNotification).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();