'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { createAdminAuth, hashPassword } = require('../server/admin-auth');
const password = 'test-password-for-admin';
const env = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: hashPassword(password), ADMIN_JWT_SECRET: 's'.repeat(48), PUBLIC_BASE_URL: 'http://localhost:8787/event/' };
function request(cookie = '', extra = {}) { return { headers: { cookie, origin: 'http://localhost:8787', ...extra }, socket: { remoteAddress: '127.0.0.1' } }; }

test('password hashing rejects invalid input and credentials never become JWT claims', async () => {
  assert.throws(() => hashPassword('short'));
  const auth = createAdminAuth(env), login = await auth.login('admin', password, 'ip');
  assert.equal(login.user.username, 'admin');
  assert.equal(login.cookie.includes('HttpOnly'), true);
  assert.match(login.cookie, /Path=\/event\//);
  assert.match(login.cookie, /SameSite=Lax/);
  assert.doesNotMatch(login.cookie, /Secure/);
  const token = login.cookie.split(';')[0].split('=')[1], claims = jwt.decode(token);
  assert.equal(claims.sub, 'admin'); assert.ok(claims.jti); assert.equal(claims.exp - claims.iat, 28800);
  assert.doesNotMatch(JSON.stringify(claims), /password|scrypt/);
  assert.equal(auth.session(request(login.cookie)).user.username, 'admin');
  await assert.rejects(auth.login('wrong', password, 'ip'), e => e.statusCode === 401);
  await assert.rejects(auth.login('admin', 'wrong', 'ip'), e => e.statusCode === 401);
});

test('invalid configuration fails closed without breaking public server creation', async () => {
  for (const config of [{}, { ...env, ADMIN_PASSWORD_HASH: 'invalid' }, { ...env, ADMIN_JWT_SECRET: 'short' }]) {
    const auth = createAdminAuth(config); assert.equal(auth.configured(), false);
    assert.equal(auth.session(request()), null);
    await assert.rejects(auth.login('admin', password, 'ip'), e => e.statusCode === 503);
  }
});

test('tampering, expiry, restart and logout invalidate sessions', async () => {
  let now = Date.now(); const auth = createAdminAuth(env, { now: () => now });
  const login = await auth.login('admin', password, 'ip'), cookie = login.cookie.split(';')[0];
  const token = cookie.split('=')[1], claims = jwt.decode(token);
  const tampered = jwt.sign({ ...claims, sub: 'attacker' }, env.ADMIN_JWT_SECRET, { algorithm: 'HS256' });
  assert.equal(auth.session(request('lpclub_admin=' + tampered)), null);
  assert.equal(createAdminAuth(env).session(request(cookie)), null);
  const ctx = auth.session(request(cookie)); auth.logout(ctx);
  assert.equal(auth.session(request(cookie)), null);
  const second = await auth.login('admin', password, 'ip'); now += 28801 * 1000;
  assert.equal(auth.session(request(second.cookie)), null);
});

test('write authorization requires same origin and matching session CSRF token', async () => {
  const auth = createAdminAuth(env), login = await auth.login('admin', password, 'ip');
  const req = request(login.cookie, { 'x-csrf-token': login.csrfToken }), session = auth.session(req);
  assert.doesNotThrow(() => auth.checkWrite(req, session));
  assert.throws(() => auth.checkWrite(request(login.cookie), session), e => e.statusCode === 403);
  assert.throws(() => auth.checkWrite(request(login.cookie, { origin: 'https://evil.test', 'x-csrf-token': login.csrfToken }), session), e => e.statusCode === 403);
  assert.throws(() => auth.checkOrigin(request('', { origin: undefined })), e => e.statusCode === 403);
  assert.throws(() => auth.checkOrigin(request('', { origin: 'null' })), e => e.statusCode === 403);
});

test('HTTPS cookie is secure and invalid return targets cannot redirect off-site', () => {
  const auth = createAdminAuth({ ...env, PUBLIC_BASE_URL: 'https://example.com/event/' });
  assert.match(auth.clearCookie(), /Secure/);
  for (const raw of ['https://evil.test', '//evil.test', '/other/table', '/event/../table', '/event/table\\evil', '/event/table%0d%0aX:test']) assert.equal(auth.returnTo(raw), '/event/table');
  assert.equal(auth.returnTo('/event/table?mode=deleted&token=old&tab=materials&ref=REF'), '/event/table?mode=deleted&tab=materials&ref=REF');
});

test('failed login rate limiting is separate from registration submission and resets', async () => {
  let now = Date.now(); const auth = createAdminAuth(env, { now: () => now });
  for (let i = 0; i < 10; i++) await assert.rejects(auth.login('admin', 'bad', 'ip'), e => e.statusCode === 401);
  await assert.rejects(auth.login('admin', password, 'ip'), e => e.statusCode === 429);
  assert.equal((await auth.login('admin', password, 'other-ip')).user.username, 'admin');
  now += 900001; assert.equal((await auth.login('admin', password, 'ip')).user.username, 'admin');
});

test('stripped reverse-proxy paths retain the configured production prefix', () => {
  const auth = createAdminAuth({ ...env, PUBLIC_BASE_URL: 'https://example.com/event/' });
  const req = { url: '/table', headers: { host: 'example.com', origin: 'https://example.com' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(auth.pathPrefix(req), '/event');
  assert.equal(auth.returnTo('/event/table?tab=materials', req), '/event/table?tab=materials');
});
