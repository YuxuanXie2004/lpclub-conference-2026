'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function client(respond) {
  const nodes = new Map(), requests = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', hidden: true, innerHTML: '', textContent: '', disabled: false, dataset: {}, events: {}, setAttribute(key, value) { this[key] = value; }, addEventListener(key, fn) { this.events[key] = fn; }, focus() { document.activeElement = this; }, querySelectorAll() { return []; } });
    return nodes.get(id);
  };
  const document = { activeElement: null, getElementById: element, addEventListener() {} }, window = { LPClubAdminI18n: { text: key => key, label: key => key, language: 'en' }, LPClubFeishuStatus: { refresh() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/notification-admin.js'), 'utf8'), { document, window, URLSearchParams, console, setTimeout, clearTimeout, fetch: async (url, options) => { requests.push({ url, options }); const result = await respond(url, options); return { ok: result?.ok !== false, json: async () => result }; } });
  return { nodes, element, window, requests };
}
const empty = { rows: [], stats: {}, kinds: [], total: 0, page: 1, pageSize: 25 };
test('notification controllers load on selection and retain independent filters and paging', async () => {
  const app = client(async () => ({ ...empty, total: 60 }));
  assert.equal(app.requests.length, 0);
  app.window.LPClubNotifications.activate('mail'); await flush();
  app.element('mailSearch').value = 'someone@example.com';
  await app.element('mailRefresh').onclick();
  assert.match(app.requests.at(-1).url, /q=someone%40example.com/);
  await app.element('mailNext').onclick();
  assert.match(app.requests.at(-1).url, /page=2/);
  app.window.LPClubNotifications.activate('feishu'); await flush();
  assert.match(app.requests.at(-1).url, /notifications\/feishu/);
  assert.equal(app.element('mailSearch').value, 'someone@example.com');
  app.window.LPClubNotifications.activate('mail'); await flush();
  assert.match(app.requests.at(-1).url, /page=2/);
});
test('older notification responses cannot overwrite newer filter results', async () => {
  let release;
  const app = client(url => url.includes('q=old') ? new Promise(resolve => release = resolve) : Promise.resolve({ ...empty, rows: [{ id: 'new', ref: 'NEW', status: 'sent' }] }));
  app.window.LPClubNotifications.activate('mail'); await flush();
  app.element('mailSearch').value = 'old'; const pending = app.element('mailRefresh').onclick();
  app.element('mailSearch').value = 'new'; await app.element('mailRefresh').onclick();
  release({ ...empty, rows: [{ id: 'old', ref: 'OLD', status: 'sent' }] }); await pending;
  assert.match(app.element('mailRows').innerHTML, /NEW/);
  assert.doesNotMatch(app.element('mailRows').innerHTML, /OLD/);
});
test('notification details escape external text and close when switching tabs', async () => {
  const app = client(async url => url.includes('/job') ? { id: 'job', ref: 'REF', contentAvailable: true, content: { to: 'a@example.com', subject: '<script>alert(1)</script>', text: '<img src=x onerror=alert(1)>' }, history: [] } : { ...empty, rows: [{ id: 'job', ref: 'REF', status: 'sent' }] });
  app.window.LPClubNotifications.activate('mail'); await flush();
  const button = { dataset: { detail: 'job' }, closest() { return this; }, focus() {} };
  await app.element('mailRows').events.click({ target: button });
  assert.equal(app.element('mailDrawer').hidden, false);
  assert.doesNotMatch(app.element('mailDetail').innerHTML, /<script>|<img src=x/);
  assert.match(app.element('mailDetail').innerHTML, /&lt;script&gt;/);
  app.window.LPClubNotifications.activate('feishu');
  assert.equal(app.element('mailDrawer').hidden, true);
});

test('language changes redraw notification statuses and options without requests or losing filters', async () => {
  const app = client(async () => ({ ...empty, kinds: ['registration'], rows: [{ id: 'job', ref: 'REF', status: 'sent', kind: 'registration' }] }));
  app.window.LPClubNotifications.activate('mail'); await flush();
  app.element('mailSearch').value = 'keep@example.com'; app.element('mailKind').value = 'registration';
  const { translations } = require('../server/admin-i18n');
  app.window.LPClubAdminI18n = { language: 'zh', text: key => translations[key]?.[1] || key, label: key => translations[key]?.[1] || key };
  const count = app.requests.length;
  app.window.LPClubNotifications.translate();
  assert.equal(app.requests.length, count);
  assert.equal(app.element('mailSearch').value, 'keep@example.com');
  assert.equal(app.element('mailKind').value, 'registration');
  assert.match(app.element('mailRows').innerHTML, /发送成功（渠道已接受）/);
  assert.match(app.element('mailKind').innerHTML, /报名确认邮件/);
});

test('Feishu status summaries change language without reloading or translating event data', async () => {
  const { translations } = require('../server/admin-i18n');
  const nodes = new Map(), document = { getElementById: id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', disabled: false }); return nodes.get(id); } };
  let language = 'en', requests = 0;
  const window = { LPClubAdminI18n: { get language() { return language; }, text: (key, params = {}) => (translations[key]?.[language === 'zh' ? 1 : 0] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '') } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/feishu-admin.js'), 'utf8'), { window, document, fetch: async () => { requests++; return { ok: true, json: async () => ({ notifyEnabled: true, notifyConfigured: true, syncEnabled: false, syncConfigured: false, jobs: [{ status: 'failed', count: 2 }], sync: [], reconciliation: { requested: true }, failures: [{ channel: '通知', ref: 'ORIGINAL-REF', error: 'FEISHU_TIMEOUT' }] }) }; } });
  await window.LPClubFeishuStatus.refresh();
  assert.match(nodes.get('feishuStatusText').textContent, /Notifications: Enabled/);
  language = 'zh'; window.LPClubFeishuStatus.translate();
  assert.match(nodes.get('feishuStatusText').textContent, /通知：已启用/);
  assert.match(nodes.get('feishuErrors').textContent, /尚未执行（已排队）/);
  assert.match(nodes.get('feishuErrors').textContent, /ORIGINAL-REF/);
  language = 'en'; window.LPClubFeishuStatus.translate();
  assert.match(nodes.get('feishuStatusText').textContent, /Notifications: Enabled/);
  assert.doesNotMatch(nodes.get('feishuErrors').textContent, /通知|排队|尚未/);
  assert.equal(requests, 1);
});
