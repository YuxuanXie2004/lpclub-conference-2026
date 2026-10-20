'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderTablePage } = require('../server/sheet');

function languageApp(saved = 'en', blockedStorage = false) {
  const { script } = require('../server/admin-i18n');
  const nodes = [], storage = new Map(saved ? [['lpclub-admin-language', saved]] : []);
  function node(key, attributes = {}) {
    const attrs = { ...(key ? { 'data-admin-i18n': key } : {}), ...attributes };
    const item = { textContent: '', value: '', checked: false, hidden: false, attributes: attrs,
      getAttribute: key => attrs[key] ?? null,
      setAttribute(key, value) { attrs[key] = String(value); },
      querySelectorAll() { return []; } };
    nodes.push(item); return item;
  }
  const title = node('Registration Operations · 报名管理'), portrait = node('嘉宾肖像'), status = node('Approved');
  const input = node(null), consent = node(null), placeholder = node(null, { 'data-admin-placeholder': 'Search name, company, email or reference' });
  input.value = 'Approved'; consent.checked = true;
  const buttons = { adminLangZh: node(null), adminLangEn: node(null) };
  const document = { documentElement: {}, title: '', body: {},
    getElementById: id => buttons[id],
    querySelectorAll(selector) { const attr = selector.slice(1, -1); return nodes.filter(item => item.getAttribute(attr) !== null); }
  };
  const context = vm.createContext({ document, window: {}, navigator: { language: 'zh-CN' },
    localStorage: { getItem(key) { if (blockedStorage) throw Error('blocked'); return storage.get(key) || null; }, setItem(key, value) { if (blockedStorage) throw Error('blocked'); storage.set(key, value); } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} }
  });
  vm.runInContext(script, context);
  return { api: context.window.LPClubAdminI18n, document, title, portrait, status, input, consent, placeholder, storage, buttons, node };
}

test('management header has an in-page language control and status values remain canonical', () => {
  const html = renderTablePage('test-admin');
  const header = html.match(/<header>([\s\S]*?)<\/header>/)[1];
  assert.match(header, /id="adminLangZh"/);
  assert.match(header, /id="adminLangEn"/);
  for (const status of ['Received', 'Under Review', 'Approved', 'Waitlisted', 'Rejected', 'Cancelled']) assert.ok(html.includes('value="' + status + '"'));
});

test('language changes translate all panels and preserve unsaved inputs and consent', () => {
  const app = languageApp();
  assert.equal(app.portrait.textContent, 'Speaker portrait');
  app.api.setLanguage('zh');
  assert.equal(app.title.textContent, '报名管理');
  assert.equal(app.portrait.textContent, '嘉宾肖像');
  assert.equal(app.status.textContent, '已通过');
  assert.equal(app.placeholder.getAttribute('placeholder'), '搜索姓名、机构、邮箱或报名编号');
  assert.equal(app.input.value, 'Approved', 'user text must never be translated');
  assert.equal(app.consent.checked, true);
  assert.equal(app.storage.get('lpclub-admin-language'), 'zh');
  assert.equal(app.document.documentElement.lang, 'zh');
  assert.equal(app.buttons.adminLangZh.getAttribute('aria-pressed'), 'true');
  app.api.setLanguage('en');
  assert.equal(app.status.textContent, 'Approved');
  assert.equal(app.input.value, 'Approved');
});

test('preferences survive reload, blocked storage is tolerated, and invalid languages are ignored', () => {
  assert.equal(languageApp('zh').api.language, 'zh');
  const app = languageApp(null, true);
  assert.equal(app.api.language, 'zh');
  app.api.setLanguage('en');
  assert.equal(app.api.language, 'en');
  app.api.setLanguage('fr');
  assert.equal(app.api.language, 'en');
});

test('dynamic labels and messages are translated and escaped without interpreting attendee text', () => {
  const app = languageApp('en');
  assert.equal(app.api.label('<img src=x>'), '&lt;img src=x&gt;');
  assert.equal(app.api.label('A Company'), 'A Company');
  const message = app.node(null);
  app.api.setText(message, 'Selected {count} (across pages)', { count: 3 });
  assert.equal(message.textContent, 'Selected 3 (across pages)');
  app.api.setLanguage('zh');
  assert.equal(message.textContent, '已选择 3 项（跨页保留）');
  assert.equal(app.api.text('审核并发布当前版本'), '审核并发布当前版本');
  app.api.setLanguage('en');
  assert.equal(app.api.text('审核并发布当前版本'), 'Approve and publish current version');
});

test('manual cabinet and independent review controls translate without publishing claims',()=>{
 const app=languageApp('en');
 assert.equal(app.api.text('资料审核通过'),'Approve material');
 assert.equal(app.api.text('官网展示柜'),'Website showcase');
 assert.equal(app.api.text('保存并更新官网'),'Save and update website');
 app.api.setLanguage('zh');assert.equal(app.api.text('保存跟进'),'保存跟进');
});

test('candidate pagination keeps parameter bindings across language switches',()=>{
 const app=languageApp('en'),node=app.node(null),client=require('../assets/showcase-admin');assert.equal(typeof client.setPageInfo,'function');client.setPageInfo(node,app.api,2,35,12);assert.equal(node.textContent,'Page 2 / 3 · Total 35');assert.equal(node.getAttribute('data-admin-i18n'),'Page {page} / {pages} · Total {total}');app.api.setLanguage('zh');assert.equal(node.textContent,'第 2 / 3 页 · 共 35 项');app.api.setLanguage('en');assert.equal(node.textContent,'Page 2 / 3 · Total 35');
});
