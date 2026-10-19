'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderTablePage } = require('../server/sheet');
const { renderVipPage } = require('../server/vip-admin');

function browser(html, pageUrl) {
  const elements = new Map(), requests = [];
  const document = { activeElement: null, documentElement: {}, addEventListener() {}, body: { appendChild() {} } };
  const get = (id, panel = '') => {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(), element = {
      id, panel, value: '', textContent: '', disabled: false, checked: false, hidden: false, dataset: {}, style: {},
      classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle(name, force) { const enabled = force === undefined ? !classes.has(name) : force; enabled ? classes.add(name) : classes.delete(name); return enabled; } },
      addEventListener() {}, setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name] ?? null; },
      focus() { document.activeElement = this; }, getClientRects() { return [1]; },
      querySelector(selector) { const match = selector.match(/^\[id="([^\"]+)"\]$/); if (!match) return null; const child = elements.get(match[1]); return child && (child.panel === id || child.id.startsWith(id === 'vipPanel' ? 'vip-' : 'materials-')) ? child : null; },
      querySelectorAll() { return []; }
    };
    let markup = '';
    Object.defineProperty(element, 'innerHTML', { get: () => markup, set(value) { markup = value; for (const [, child] of value.matchAll(/\bid="([^"\s]+)"/g)) get(child, panel || id); } });
    elements.set(id, element);
    return element;
  };
  for (const [, id] of html.replace(/<script>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"\s]+)"/g)) get(id, id.startsWith('vip-') ? 'vipPanel' : id.startsWith('materials-') ? 'materialsPanel' : '');
  document.getElementById = get;
  document.querySelector = selector => selector === '.tabs' ? get('tabs') : null;
  document.querySelectorAll = () => [];
  document.createElement = () => ({ click() {}, remove() {} });
  const context = vm.createContext({
    document, window: { addEventListener() {} }, location: new URL(pageUrl), history: { replaceState() {} },
    URL, URLSearchParams, Blob, console, MutationObserver: class { observe() {} },
    navigator: { clipboard: { async writeText() {} } },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    async fetch(url, options = {}) {
      requests.push({ url: new URL(url, pageUrl), options });
      return { ok: true, async json() { return { ok: true, rows: [], items: [], total: 0, page: 1, pageSize: 50, stats: {} }; } };
    }
  });
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
  return { context, get, requests };
}

for (const prefix of ['', '/2026-pe-conference']) {
  test(`报名管理保留部署前缀 ${prefix || '/'}`, async () => {
    const pageUrl = `https://lp-club.cn${prefix}/table?token=test-secret`;
    const html = renderTablePage('test-secret');
    const { context, get, requests } = browser(html, pageUrl);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests[0].url.pathname, `${prefix}/api/registrations`);
    assert.equal(requests[0].options.headers?.['X-Admin-Token'] || requests[0].url.searchParams.get('token'), 'test-secret');
    vm.runInContext("setMode('deleted')", context);
    assert.equal(new URL(get('export').href, pageUrl).pathname, `${prefix}/export.csv`);
    assert.equal(new URL(get('export').href, pageUrl).searchParams.get('mode'), 'deleted');
    const vipHref = html.match(/id="vipTab"[^>]*href="([^"]+)"/);
    if (vipHref) assert.equal(new URL(vipHref[1], pageUrl).pathname, `${prefix}/vip-codes`);
    else {
      vm.runInContext("setTab('vip')", context);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(requests.at(-1).url.pathname, `${prefix}/api/admin/vip-codes`);
    }
  });

  test(`VIP 管理保留部署前缀和认证头 ${prefix || '/'}`, async () => {
    const pageUrl = `https://lp-club.cn${prefix}/vip-codes?token=test-secret`;
    const html = renderVipPage('test-secret');
    const { requests } = browser(html, pageUrl);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests[0].url.pathname, `${prefix}/api/admin/vip-codes`);
    assert.equal(requests[0].options.headers['X-Admin-Token'], 'test-secret');
    assert.equal(requests[0].url.searchParams.has('token'), false);
    for (const id of ['activeTab', 'deletedTab']) {
      const href = html.match(new RegExp(`id="${id}"[^>]*href="([^"]+)"`))[1];
      assert.equal(new URL(href, pageUrl).pathname, `${prefix}/table`);
    }
  });
}
