'use strict';
function baseURL(base) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('PUBLIC_BASE_URL must be an HTTPS site URL (HTTP is allowed for localhost)');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url;
}
function deploymentPrefix(base) { return base ? baseURL(base).pathname.replace(/\/$/, '') : ''; }
function publicUrl(base, route) {
  const url = baseURL(base);
  const path = String(route).replace(/^\/+/, '');
  if (/^(?:[a-z]+:|\.\.)/i.test(path) || path.includes('\\')) throw new Error('Invalid public route');
  return new URL(path, url).href;
}
function stripPrefix(pathname, base) {
  const prefix = deploymentPrefix(base);
  return prefix && (pathname === prefix || pathname.startsWith(prefix + '/')) ? pathname.slice(prefix.length) || '/' : pathname;
}
module.exports = { publicUrl, deploymentPrefix, stripPrefix };
