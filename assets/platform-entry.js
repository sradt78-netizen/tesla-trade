(function () {
  'use strict';

  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  var dashboardRoutes = [
    '/overview',
    '/dashboard',
    '/deposit',
    '/withdraw',
    '/buy-crypto',
    '/invest',
    '/my-plans',
    '/orders',
    '/kyc',
    '/transactions',
    '/settings',
    '/connect'
  ];

  /*
   * The public root is the landing page. Do not redirect it based on browser
   * storage: an unauthenticated visitor must be able to see the homepage and
   * choose Sign In or Register from there. This script only adds the shop link
   * to authenticated dashboard navigation.
   */
  if (path === '/' || path === '/index.html') return;

  if (dashboardRoutes.indexOf(path) === -1) return;

  function addShopLink() {
    document.querySelectorAll('aside nav').forEach(function (nav) {
      if (nav.querySelector('a[href="/store/"]')) return;

      var link = document.createElement('a');
      link.href = '/store/';
      link.className =
        'flex items-center gap-3 px-5 py-3 text-sm transition-colors ' +
        'text-slate-400 hover:text-white hover:bg-white/5';
      link.setAttribute('aria-label', 'Open vehicle shop');
      link.innerHTML =
        '<span aria-hidden="true" style="width:16px;text-align:center;font-size:14px">▦</span>' +
        '<span>Shop</span>';

      var dashboardLink = nav.querySelector('a[href="/overview"]');
      if (dashboardLink && dashboardLink.nextSibling) {
        nav.insertBefore(link, dashboardLink.nextSibling);
      } else {
        nav.appendChild(link);
      }
    });
  }

  addShopLink();
  window.setTimeout(addShopLink, 100);
  window.setTimeout(addShopLink, 500);
  window.setTimeout(addShopLink, 1500);

  if (window.MutationObserver) {
    new MutationObserver(addShopLink).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}());