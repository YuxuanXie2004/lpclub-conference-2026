'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
function client(responseStatus = 200) {
  const calls = [], redirects = [], username = { textContent: '' };
  const location = new URL('https://example.com/event/table?mode=deleted'); location.replace = target => redirects.push(target);
  const document = { getElementById: id => id === 'adminUsername' ? username : null, dispatchEvent() {}, querySelector: () => null };
  const window = { location, document, fetch: async (url, options) => { calls.push({ url, options }); return { status: String(url).includes('/auth/session') ? 200 : responseStatus, ok: true, json: async () => ({ user: { username: 'admin' }, csrfToken: 'csrf-secret' }) }; } };
  const context = vm.createContext({ window, document, location, URL, Headers, CustomEvent: class {}, console });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/admin-auth.js'), 'utf8'), context);
  return { window, calls, redirects, username };
}
test('admin client sends same-origin cookies and CSRF for writes after session bootstrap', async () => {
  const app = client();
  await app.window.fetch('api/admin/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(app.calls.length, 2); assert.equal(app.username.textContent, 'admin');
  assert.equal(app.calls[1].options.credentials, 'same-origin');
  assert.equal(new Headers(app.calls[1].options.headers).get('X-CSRF-Token'), 'csrf-secret');
  await app.window.fetch('https://other.test/api/admin/test', { method: 'POST' });
  assert.equal(app.calls[2].options.headers, undefined);
});
test('unauthorized admin request returns to login and logout uses CSRF', async () => {
  const expired = client(401); await expired.window.fetch('api/registrations');
  assert.match(expired.redirects[0], /^\/event\/login\?returnTo=/);
  assert.match(decodeURIComponent(expired.redirects[0]), /mode=deleted/);
  const app = client(); await app.window.LPClubAdmin.logout();
  assert.equal(new Headers(app.calls.at(-1).options.headers).get('X-CSRF-Token'), 'csrf-secret');
  assert.equal(app.redirects.at(-1), '/event/login');
});

test('expired aliases return to the selected menu through the canonical table route', async () => {
  const calls = [], redirects = [], location = new URL('https://example.com/event/vip-codes'); location.replace = value => redirects.push(value);
  const document = { getElementById: () => null, dispatchEvent() {}, querySelector: () => ({ id: 'materialsTab' }) };
  const window = { location, document, fetch: async (url, options) => { calls.push({ url, options }); return { status: 401, ok: false }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/admin-auth.js'), 'utf8'), { window, document, URL, Headers });
  await window.LPClubAdmin.ready;
  assert.match(decodeURIComponent(redirects[0]), /returnTo=\/event\/table\?tab=materials/);
});

test('CSV link uses authenticated fetch so expired sessions return to login', async () => {
  let click;
  const location = new URL('https://example.com/event/table?mode=deleted'), redirects = []; location.replace = url => redirects.push(url);
  const link = { href: 'https://example.com/event/export.csv?mode=deleted', addEventListener: (_, handler) => { click = handler; } };
  const document = { getElementById: id => id === 'export' ? link : null, querySelector: () => null, dispatchEvent() {} };
  const window = { document, location, fetch: async url => ({ status: String(url).includes('/auth/session') ? 200 : 401, ok: String(url).includes('/auth/session'), json: async () => ({ user: { username: 'admin' }, csrfToken: 'csrf' }) }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/admin-auth.js'), 'utf8'), { window, document, URL, Headers, CustomEvent: class {} });
  assert.equal(typeof click, 'function');
  await click({ preventDefault() {} });
  assert.match(redirects[0], /^\/event\/login/);
});
