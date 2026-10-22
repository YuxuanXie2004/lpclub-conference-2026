(function (win) {
  'use strict';
  const rawFetch = win.fetch.bind(win), base = new URL('.', win.location.href), prefix = base.pathname.replace(/\/$/, '');
  let csrfToken = '', redirecting = false;
  function returnTo() {
    const target = new URL(win.location.href); target.searchParams.delete('token');
    const selected = document.querySelector('.tabs .tab.on');
    const tab = selected?.id?.replace(/Tab$/, '');
    if (tab) { target.pathname = prefix + '/table'; target.searchParams.set('tab', tab); if (['active', 'deleted'].includes(tab)) target.searchParams.set('mode', tab); }
    for (const [id, param] of [['search', 'q'], ['statusFilter', 'status'], ['packageFilter', 'package']]) {
      const node = document.getElementById(id); if (node?.value) target.searchParams.set(param, node.value); else target.searchParams.delete(param);
    }
    const page = document.getElementById('registrationPageInfo')?.dataset?.page;
    if (page && ['active', 'deleted'].includes(tab)) target.searchParams.set('page', page);
    const ref = document.getElementById('materials-filter')?.value;
    if (tab === 'materials' && ref) target.searchParams.set('ref', ref);
    return target.pathname + target.search;
  }
  function signIn() {
    if (redirecting) return;
    redirecting = true; win.location.replace(prefix + '/login?returnTo=' + encodeURIComponent(returnTo()));
  }
  const ready = rawFetch(new URL('api/admin/auth/session', base).href, { credentials: 'same-origin' }).then(async response => {
    if (response.status === 401) { signIn(); return null; }
    if (!response.ok) throw Error('Unable to load administrator session');
    const result = await response.json(); csrfToken = result.csrfToken;
    const node = document.getElementById('adminUsername'); if (node) node.textContent = result.user.username;
    document.dispatchEvent(new CustomEvent('lpclub-admin-session', { detail: result }));
    return result;
  }).catch(() => null);
  win.fetch = async function (input, options = {}) {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, win.location.href);
    const path = target.pathname.slice(prefix.length);
    const admin = target.origin === base.origin && target.pathname.startsWith(prefix + '/') && (path.startsWith('/api/admin/') || ['/api/registrations', '/api/pricing', '/export.csv'].includes(path));
    if (!admin) return rawFetch(input, options);
    await ready;
    const headers = new Headers(options.headers || (typeof input === 'object' ? input.headers : undefined));
    const method = (options.method || input.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken);
    const response = await rawFetch(input, { ...options, credentials: 'same-origin', headers });
    if (response.status === 401) signIn();
    return response;
  };
  const exportLink = document.getElementById('export');
  let exporting = false;
  exportLink?.addEventListener('click', async event => {
    event.preventDefault(); if (exporting) return;
    exporting = true; exportLink.setAttribute?.('aria-busy', 'true');
    try {
      const response = await win.fetch(exportLink.href);
      if (response.status === 401) return;
      if (!response.ok) { const data = await response.json(); throw Error(data.error || 'Export failed'); }
      const url = win.URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = 'lpclub-registrations.csv'; document.body.appendChild(link); link.click(); link.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    } catch (error) { if (win.toast) win.toast(error.message); }
    finally { exporting = false; exportLink.removeAttribute?.('aria-busy'); }
  });
  win.LPClubAdmin = {
    ready,
    async logout() {
      const response = await win.fetch(new URL('api/admin/auth/logout', base).href, { method: 'POST' });
      if (response.ok) win.location.replace(prefix + '/login');
      else if (response.status !== 401) throw Error('Unable to sign out. Please refresh and try again.');
    }
  };
})(window);
