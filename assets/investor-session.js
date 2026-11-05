(function () {
  'use strict';
  if (window.__ttInvestorSessionHooked) return;
  window.__ttInvestorSessionHooked = true;

  function endSession() {
    try {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  try {
    var originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      var shouldEnd = this === window.localStorage && key === 'ttinc_auth';
      var result = originalRemove.apply(this, arguments);
      if (shouldEnd) endSession();
      return result;
    };

    var originalClear = Storage.prototype.clear;
    Storage.prototype.clear = function () {
      var shouldEnd = this === window.localStorage;
      var result = originalClear.apply(this, arguments);
      if (shouldEnd) endSession();
      return result;
    };
  } catch (error) {
    console.warn('[investor session] sign-out hook could not be installed:', error.message);
  }
}());
