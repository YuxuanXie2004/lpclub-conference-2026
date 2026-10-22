'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../server/index');
const { hashPassword } = require('../server/admin-auth');
const hash = hashPassword('admin-test-password');
async function fixture(t, prefix = '', extraEnv = {}) {
  const backend = createBackend({ env: { ADMIN_TOKEN: 'old-secret', ADMIN_PASSWORD_HASH: hash, ADMIN_JWT_SECRET: 'k'.repeat(48), PUBLIC_BASE_URL: 'http://localhost:8787' + prefix + '/', ...extraEnv }, pricingStore: { get: async () => ({ prices: {}, revision: 1 }) }, db: { query: async () => [], health: async () => ({ ok: true }) } });
  await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { backend.server.close(resolve); backend.server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + backend.server.address().port, origin = base;
  const send = (route, options = {}) => fetch(base + prefix + route, { redirect: 'manual', ...options });
  const signin = async () => {
    const response = await send('/api/admin/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin-test-password' }) });
    assert.equal(response.status, 200, await response.clone().text());
    return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()) };
  };
  return { send, signin, origin };
}
for (const prefix of ['', '/event']) test('admin login protects pages, exports, media and legacy aliases at ' + (prefix || '/'), async t => {
  const { send, signin, origin } = await fixture(t, prefix);
  for (const route of ['/table?token=old-secret&mode=deleted', '/vip-codes', '/materials-admin', '/pricing-admin', '/pricing']) {
    const response = await send(route); assert.equal(response.status, 302);
    assert.equal(response.headers.get('location').startsWith(prefix + '/login?returnTo='), true);
    assert.equal(response.headers.get('location').includes('old-secret'), false);
  }
  for (const route of ['/api/registrations', '/api/admin/pricing', '/export.csv', '/api/admin/notifications/mail', '/api/admin/notifications/feishu', '/api/admin/notifications/sync', '/api/admin/materials/REF/preview/logo', '/api/admin/showcase/logo/uploads/11111111-1111-4111-8111-111111111111/preview']) {
    const response = await send(route + '?token=old-secret', { headers: { 'X-Admin-Token': 'old-secret' } }); assert.equal(response.status, 401, route);
  }
  const loginPage = await send('/login?returnTo=' + encodeURIComponent(prefix + '/table?mode=deleted'));
  assert.equal(loginPage.status, 200); assert.match(await loginPage.text(), /autocomplete="current-password"/);
  const auth = await signin(), headers = { Cookie: auth.cookie };
  const session = await send('/api/admin/auth/session', { headers }); assert.equal(session.status, 200);
  assert.equal((await session.json()).user.username, 'admin');
  const page = await send('/table?mode=deleted', { headers }); assert.equal(page.status, 200); assert.doesNotMatch(await page.text(), /old-secret/);
  assert.equal((await send('/api/admin/pricing', { headers })).status, 200);
  const mutation = () => send('/api/admin/status', { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await mutation()).status, 403);
  const logout = await send('/api/admin/auth/logout', { method: 'POST', headers: { ...headers, Origin: origin, 'X-CSRF-Token': auth.csrfToken } });
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await send('/api/admin/auth/session', { headers })).status, 401);
});

for (const prefix of ['', '/event']) test('notification APIs require sessions and CSRF at ' + (prefix || '/'), async t => {
  const { send, signin, origin } = await fixture(t, prefix);
  const auth = await signin(), headers = { Cookie: auth.cookie };
  for (const channel of ['mail', 'feishu', 'sync']) {
    const response = await send('/api/admin/notifications/' + channel, { headers });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).rows, []);
    assert.equal((await send('/api/admin/notifications/' + channel + '?status=invalid', { headers })).status, 400);
    assert.equal((await send('/api/admin/notifications/' + channel + '/bad-id', { headers })).status, 400);
    assert.equal((await send('/api/admin/notifications/' + channel + '/11111111-1111-4111-8111-111111111111/retry', { method: 'POST', headers: { ...headers, Origin: origin } })).status, 403);
    assert.equal((await send('/api/admin/notifications/' + channel, { method: 'DELETE', headers: { ...headers, Origin: origin, 'X-CSRF-Token': auth.csrfToken } })).status, 405);
  }
});

test('login rejects cross origin, invalid JSON and malformed credentials without leaking secrets', async t => {
  const { send, origin } = await fixture(t);
  const cross = await send('/api/admin/auth/login', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }); assert.equal(cross.status, 403);
  const invalid = await send('/api/admin/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' }); assert.equal(invalid.status, 400);
});


test('proxy login rate limit ignores forged forwarding prefixes', async t => {
  const { send, origin } = await fixture(t, '', { TRUST_PROXY: 'true' });
  for (let i = 0; i < 10; i++) {
    const response = await send('/api/admin/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.' + i + ', 198.51.100.10' }, body: JSON.stringify({ username: 'admin', password: 'incorrect' }) });
    assert.equal(response.status, 401);
  }
  const limited = await send('/api/admin/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.20, 198.51.100.10' }, body: JSON.stringify({ username: 'admin', password: 'admin-test-password' }) });
  assert.equal(limited.status, 429);
});
