/*
 * Registration handoff compatibility layer.
 *
 * The compiled /register screen sends the OTP, but its older success handler
 * only writes ttinc_auth to localStorage and routes to /overview. That skips
 * the server account record, invitation validation, and the investment flow.
 *
 * Let the compiled screen render its own form and OTP step, then take over
 * only the final OTP submit. This keeps the existing visual UI while making
 * the handoff use the same protected API as every other registration path.
 */
(function () {
  'use strict';

  function value(selector, root) {
    var field = (root || document).querySelector(selector);
    return field ? String(field.value || '').trim() : '';
  }

  function firstField(selectors, root) {
    var scope = root || document;
    for (var i = 0; i < selectors.length; i += 1) {
      var field = scope.querySelector(selectors[i]);
      if (field) return field;
    }
    return null;
  }

  function firstValue(selectors, root) {
    var field = firstField(selectors, root);
    return field ? String(field.value || '').trim() : '';
  }

  function showError(form, message) {
    var error = form.querySelector('[data-ttinc-registration-error]');
    if (!error) {
      error = document.createElement('div');
      error.setAttribute('data-ttinc-registration-error', '1');
      error.style.cssText =
        'color:#fca5a5;background:rgba(227,25,55,.1);' +
        'border:1px solid rgba(227,25,55,.25);border-radius:9px;' +
        'padding:9px 11px;font-size:12px;text-align:center;margin-bottom:12px;';
      form.insertBefore(error, form.firstChild);
    }
    error.textContent = message;
    error.style.display = 'block';
  }

  function ageFromDate(valueText) {
    var dob = new Date(valueText + 'T00:00:00');
    if (!valueText || isNaN(dob.getTime())) return 0;
    var now = new Date();
    var age = now.getFullYear() - dob.getFullYear();
    var month = now.getMonth() - dob.getMonth();
    if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age;
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.success && !data.status && !data.onboardingState) {
          throw new Error(data.error || data.message || 'Registration could not be completed.');
        }
        return data;
      });
    });
  }

  function saveBrowserAuth(payload) {
    var account = {
      email: payload.email,
      name: payload.name,
      createdAt: new Date().toISOString()
    };
    try {
      var users = JSON.parse(localStorage.getItem('ttinc_users') || '[]');
      users = users.filter(function (item) {
        return item && String(item.email || '').toLowerCase() !== payload.email.toLowerCase();
      });
      users.push(account);
      localStorage.setItem('ttinc_users', JSON.stringify(users));
      localStorage.setItem('ttinc_auth', JSON.stringify(account));
    } catch (error) {}
  }

  var completing = false;

  function handoffToInvestment(payload) {
    var account = payload || {};
    var email = String(account.email || '').trim().toLowerCase();
    var name = String(account.name || email.split('@')[0] || '').trim();
    try {
      localStorage.setItem('ttinc_auth', JSON.stringify({
        email: email,
        name: name,
        onboardingState: 'plan_selection'
      }));
      sessionStorage.removeItem('ttinc_social_onboarding');
      sessionStorage.setItem('ttinc_email_onboarding', '1');
      sessionStorage.removeItem('ttinc_investment_flow_state');
    } catch (error) {}
    /*
     * replace() prevents the compiled bundle's older success callback from
     * putting the just-created account back on /overview. /invest is the
     * single route that owns first-time plan selection.
     */
    window.__ttincRegistrationHandoff = true;
    window.location.replace('/invest?onboarding=email');
  }

  function completeRegistration(form) {
    if (completing) return;
    completing = true;
    /*
     * The current inline registration panel is deliberately outside the
     * email/password login form. Older builds placed the OTP controls inside
     * a form, so use the panel first and retain the form fallback.
     */
    var root = document.getElementById('ttinc-register-panel') || form || document;
    var pending = {};
    try {
      pending = JSON.parse(sessionStorage.getItem('ttinc_registration_pending') || '{}');
    } catch (error) {}
    var email = (firstValue(['#ttinc-register-email', 'input[type="email"]'], root) ||
      pending.email || '').toLowerCase();
    var name = firstValue(['#ttinc-register-name', 'input[placeholder="John Smith"]'], root) ||
      pending.name || '';
    var phone = firstValue(['#ttinc-register-phone', 'input[type="tel"]'], root) ||
      pending.phone || '';
    var dob = firstValue(['input[type="date"]'], root) || pending.dob || '';
    var ageField = firstField(['#ttinc-register-age', 'input[type="number"]'], root);
    var age = ageField ? Number(ageField.value) : 0;
    if (!age && dob) age = ageFromDate(dob);
    var password = firstValue(['#ttinc-register-password'], root) || pending.password || '';
    var invitationField = root.querySelector('#ttinc-register-invitation');
    var invitationCode = invitationField
      ? invitationField.value.trim()
      : (pending.invitationCode ||
        (window.ttincInvitation && window.ttincInvitation.get
          ? window.ttincInvitation.get()
          : ''));
    var otp = firstValue(['#ttinc-register-otp', 'input[maxlength="6"]'], root);
    var submit = root.querySelector('#ttinc-register-submit') ||
      root.querySelector('button[type="submit"]');

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Creating account…';
    }

    postJson('/api/otp/verify', { email: email, code: otp })
      .then(function (verification) {
        return postJson('/api/accounts', {
          email: email,
          name: name || email.split('@')[0],
          phone: phone,
          age: age || ageFromDate(dob),
          invitationCode: invitationCode,
          verificationToken: verification.verificationToken || ''
        }).then(function (account) {
          return { account: account, verification: verification };
        });
      })
      .then(function (result) {
        /*
         * The live registration panel collects a password as well. Complete
         * that server-side step before navigating so the subsequent login
         * and dashboard requests use the same authenticated session.
         */
        if (!password) return result;
        return postJson('/api/auth/set-password', {
          email: email,
          password: password,
          verificationToken: result.verification.verificationToken || ''
        }).then(function () {
          return result;
        });
      })
      .then(function () {
        saveBrowserAuth({
          email: email,
          name: name || email.split('@')[0]
        });
        try { sessionStorage.removeItem('ttinc_registration_pending'); } catch (error) {}
        handoffToInvestment({
          email: email,
          name: name || email.split('@')[0]
        });
      })
      .catch(function (error) {
        completing = false;
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'VERIFY & CREATE ACCOUNT';
        }
        showError(form, error.message || 'Registration could not be completed. Please try again.');
      });
  }

  /*
   * Capture only the OTP form. The first registration submit is intentionally
   * left to React so it can transition to its existing verification screen.
   */
  document.addEventListener('submit', function (event) {
    if (window.location.pathname !== '/register') return;
    var form = event.target;
    if (!form) return;
    if (!form.querySelector('input[maxlength="6"]')) {
      var registrationInvitation = form.querySelector('#ttinc-register-invitation');
      try {
        sessionStorage.setItem('ttinc_registration_pending', JSON.stringify({
          email: value('input[type="email"]', form).toLowerCase(),
          name: value('input[placeholder="John Smith"]', form),
          phone: value('input[type="tel"]', form),
          dob: value('input[type="date"]', form),
          invitationCode: registrationInvitation
            ? registrationInvitation.value.trim()
            : (window.ttincInvitation && window.ttincInvitation.get
              ? window.ttincInvitation.get()
              : '')
        }));
      } catch (error) {}
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    completeRegistration(form);
  }, true);

  /*
   * The compiled screen has shipped both a real submit button and a button
   * that calls React's handler directly. Cover the latter without touching
   * the first registration step.
   */
  document.addEventListener('click', function (event) {
    if (window.location.pathname !== '/register' || completing) return;
    var button = event.target && event.target.closest
      ? event.target.closest('button')
      : null;
    if (!button) return;
    var label = (button.textContent || '').trim().toLowerCase();
    if (label.indexOf('verify') === -1 || label.indexOf('create') === -1) return;
    var form = button.closest('form') ||
      document.getElementById('ttinc-register-panel') ||
      document;
    if (!form || !form.querySelector('input[maxlength="6"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    completeRegistration(form);
  }, true);
}());