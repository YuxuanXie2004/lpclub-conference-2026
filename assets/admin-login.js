(function () {
  'use strict';
  const form = document.getElementById('loginForm'), submit = document.getElementById('loginSubmit'), error = document.getElementById('loginError');
  const words = { zh: { title: '管理员登录', subtitle: '报名管理', username: '账号', password: '密码', submit: '登录', busy: '登录中…', show: '显示密码', hide: '隐藏密码', failed: '登录失败，请稍后重试。', ADMIN_LOGIN_FAILED: '账号或密码不正确', ADMIN_RATE_LIMITED: '尝试次数过多，请在 15 分钟后重试。', ADMIN_NOT_CONFIGURED: '管理员登录尚未配置，请联系维护人员。', ADMIN_CSRF_INVALID: '访问来源不匹配，请从本站登录页面重试。' }, en: { title: 'Administrator sign in', subtitle: 'Registration Operations', username: 'Username', password: 'Password', submit: 'Sign in', busy: 'Signing in…', show: 'Show password', hide: 'Hide password', failed: 'Unable to sign in. Please try again.', ADMIN_LOGIN_FAILED: 'Incorrect username or password', ADMIN_RATE_LIMITED: 'Too many attempts. Please try again in 15 minutes.', ADMIN_NOT_CONFIGURED: 'Administrator login is not configured. Please contact support.', ADMIN_CSRF_INVALID: 'Request origin does not match. Please use this site’s sign in page.' } };
  let lang = 'zh', busy = false, errorCode = error.hidden ? '' : 'ADMIN_NOT_CONFIGURED';
  const toggle = document.getElementById('togglePassword'), password = document.getElementById('password');
  function language(next) {
    lang = next; document.documentElement.lang = lang;
    document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = words[lang][node.dataset.copy]; });
    document.querySelectorAll('[data-language]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.language === lang)));
    toggle.setAttribute('aria-label', words[lang][password.type === 'password' ? 'show' : 'hide']);
    if (busy) submit.textContent = words[lang].busy;
    if (errorCode) error.textContent = words[lang][errorCode] || words[lang].failed;
  }
  document.querySelectorAll('[data-language]').forEach(node => node.addEventListener('click', () => language(node.dataset.language)));
  toggle.addEventListener('click', () => { password.type = password.type === 'password' ? 'text' : 'password'; toggle.setAttribute('aria-pressed', String(password.type === 'text')); language(lang); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || submit.disabled) return;
    busy = true; submit.disabled = true; error.hidden = true; errorCode = ''; language(lang);
    try {
      const response = await fetch(form.dataset.endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.elements.username.value, password: password.value, returnTo: form.elements.returnTo.value }) });
      const result = await response.json();
      if (!response.ok) { errorCode = result.code; throw Error('Sign in failed'); }
      location.replace(result.returnTo);
    } catch (_) { error.hidden = false; error.textContent = words[lang][errorCode] || words[lang].failed; }
    finally { busy = false; submit.disabled = errorCode === 'ADMIN_NOT_CONFIGURED'; language(lang); }
  });
})();
