'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const { deploymentPrefix } = require('./public-paths');
const scrypt = promisify(crypto.scrypt);
const COOKIE = 'lpclub_admin';
const TTL = 8 * 60 * 60;
const problem = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256) throw Error('Password must contain 12–256 bytes and at least 12 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function equal(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
function createAdminAuth(env, { now = Date.now } = {}) {
  const username = env.ADMIN_USERNAME || 'admin', hash = env.ADMIN_PASSWORD_HASH || '', secret = env.ADMIN_JWT_SECRET || '';
  const prefix = deploymentPrefix(env.PUBLIC_BASE_URL), sessions = new Map(), buckets = new Map();
  const validHash = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash);
  const configured = () => validHash && Buffer.byteLength(secret) >= 32 && !secret.startsWith('replace-');
  const denied = () => problem('Please sign in again', 401, 'ADMIN_UNAUTHENTICATED');
  function prune() {
    const stamp = now();
    for (const [key, value] of sessions) if (value.expiresAt <= stamp) sessions.delete(key);
    for (const [key, value] of buckets) if (value.reset <= stamp) buckets.delete(key);
  }
  function pathPrefix(req) {
    return localRequest(req) && prefix && !String(req.url).split('?')[0].startsWith(prefix + '/') ? '' : prefix;
  }
  function localRequest(req) {
    return req && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
  }
  function cookie(value, req, clear = false) {
    const secure = env.PUBLIC_BASE_URL?.startsWith('https:') && !localRequest(req);
    return `${COOKIE}=${value}; Path=${pathPrefix(req)}/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : TTL}${secure ? '; Secure' : ''}`;
  }
  function session(req) {
    if (!configured()) return null;
    const token = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!token || token.length > 4096) return null;
    try {
      const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'lpclub-admin', audience: 'lpclub-management', clockTimestamp: Math.floor(now() / 1000) });
      const stored = sessions.get(claims.jti);
      if (!stored || stored.expiresAt <= now() || claims.sub !== username) { if (stored) sessions.delete(claims.jti); return null; }
      return { ...stored, id: claims.jti };
    } catch (_) { return null; }
  }
  function checkOrigin(req) {
    const origin = req.headers.origin;
    let expected;
    if (localRequest(req)) expected = 'http://' + req.headers.host;
    else if (env.PUBLIC_BASE_URL) expected = new URL(env.PUBLIC_BASE_URL).origin;
    if (!origin || !expected || origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') throw problem('Request origin is not allowed', 403, 'ADMIN_CSRF_INVALID');
  }
  function checkWrite(req, current) {
    if (!current) throw denied();
    checkOrigin(req);
    if (!equal(req.headers['x-csrf-token'], current.csrfToken)) throw problem('Please refresh and retry', 403, 'ADMIN_CSRF_INVALID');
  }
  async function login(user, password, ip, req) {
    if (!configured()) throw problem('Administrator login is not configured', 503, 'ADMIN_NOT_CONFIGURED');
    prune();
    let bucket = buckets.get(ip);
    if (!bucket) { bucket = { attempts: 0, reset: now() + 900000 }; buckets.set(ip, bucket); }
    if (bucket.attempts >= 10) throw problem('Too many attempts. Please try again in 15 minutes.', 429, 'ADMIN_RATE_LIMITED');
    bucket.attempts++;
    if (typeof user !== 'string' || typeof password !== 'string' || Buffer.byteLength(password) > 256 || user.length > 128) throw problem('Incorrect username or password', 401, 'ADMIN_LOGIN_FAILED');
    const [, salt, expected] = hash.split('$'), actual = await scrypt(password, salt, 64);
    if (!equal(user, username) || !crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw problem('Incorrect username or password', 401, 'ADMIN_LOGIN_FAILED');
    buckets.delete(ip);
    const id = crypto.randomUUID(), stamp = Math.floor(now() / 1000), csrfToken = crypto.randomBytes(32).toString('hex');
    const entry = { user: { username }, csrfToken, expiresAt: (stamp + TTL) * 1000 };
    sessions.set(id, entry);
    const token = jwt.sign({ sub: username, jti: id, iat: stamp, exp: stamp + TTL }, secret, { algorithm: 'HS256', issuer: 'lpclub-admin', audience: 'lpclub-management' });
    return { ...entry, cookie: cookie(token, req) };
  }
  function returnTo(raw, req) {
    const base = pathPrefix(req), fallback = base + '/table';
    if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\x00-\x20]|%0[ad]|%5c|%2e|%2f/i.test(raw) || raw.split('?')[0].includes('..')) return fallback;
    try {
      const target = new URL(raw, 'https://admin.invalid');
      if (target.origin !== 'https://admin.invalid' || !['/table', '/vip-codes', '/materials-admin', '/pricing-admin', '/pricing'].some(route => target.pathname === base + route)) return fallback;
      target.searchParams.delete('token'); target.hash = '';
      return target.pathname + target.search;
    } catch (_) { return fallback; }
  }
  return { configured, session, login, checkOrigin, checkWrite, returnTo, pathPrefix, clearCookie: req => cookie('', req, true), logout: current => { if (current) sessions.delete(current.id); } };
}
module.exports = { createAdminAuth, hashPassword };
