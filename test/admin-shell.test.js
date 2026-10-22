'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { renderTablePage } = require('../server/sheet');

test('management shell keeps all eight sections and loads authentication before controllers', () => {
  const html = renderTablePage('');
  for (const id of ['adminSidebar', 'adminSidebarToggle', 'adminSidebarBackdrop', 'adminPageTitle', 'adminBreadcrumb', 'adminUsername', 'adminLogout']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /images\/lpclub-logo\.png/);
  assert.match(html, /assets\/admin-shell\.css/);
  assert.ok(html.indexOf('assets/admin-auth.js') < html.indexOf('const STATUSES='));
  assert.ok(html.indexOf('assets/admin-shell.js') > html.indexOf('setTab('));
  assert.equal((html.match(/role="tab"/g) || []).length, 8);
});

function shell(mobile = false) {
  const nodes = new Map();
  for (const id of ['adminSidebar', 'adminSidebarToggle', 'adminSidebarBackdrop', 'adminPageTitle', 'adminBreadcrumb', 'adminLogout', 'activeTab', 'deletedTab', 'vipTab', 'materialsTab', 'showcaseTab', 'pricingTab']) {
    const classes = new Set();
    nodes.set(id, { textContent: '', hidden: true, attrs: {}, events: {}, classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) }, setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return this.attrs[name]; }, addEventListener(name, fn) { this.events[name] = fn; }, focus() { this.focused = true; } });
  }
  nodes.get('activeTab').attrs['aria-selected'] = 'true';
  const bodyClasses = new Set(), events = {}, mediaEvents = {};
  const document = { title: '', body: { classList: { toggle(name, enabled) { enabled ? bodyClasses.add(name) : bodyClasses.delete(name); } } }, getElementById: id => nodes.get(id), addEventListener(name, fn) { events[name] = fn; } };
  let logout = 0;
  const media = { matches: mobile, addEventListener(name, fn) { mediaEvents[name] = fn; } };
  const window = { matchMedia: () => media, LPClubAdmin: { logout() { logout++; } }, LPClubAdminI18n: { text: key => 'translated:' + key, setText(node, key) { node.textContent = 'translated:' + key; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/admin-shell.js'), 'utf8'), { window, document, localStorage: { getItem() { return null; }, setItem() {} } });
  return { nodes, bodyClasses, events, media, mediaEvents, window, document, get logout() { return logout; } };
}

test('desktop collapse keeps its accessible toggle state and logout delegates to the session controller', () => {
  const app = shell();
  app.nodes.get('adminSidebarToggle').events.click();
  assert.ok(app.bodyClasses.has('sidebar-collapsed'));
  assert.equal(app.nodes.get('adminSidebarToggle').attrs['aria-expanded'], 'false');
  app.nodes.get('adminLogout').events.click();
  assert.equal(app.logout, 1);
});

test('mobile navigation opens a drawer, closes with Escape or selection and updates page headings', () => {
  const app = shell(true);
  const toggle = app.nodes.get('adminSidebarToggle');
  toggle.events.click();
  assert.ok(app.bodyClasses.has('sidebar-open'));
  assert.equal(app.nodes.get('adminSidebarBackdrop').hidden, false);
  app.events.keydown({ key: 'Escape' });
  assert.equal(app.bodyClasses.has('sidebar-open'), false);
  toggle.events.click();
  app.window.LPClubAdminShell.activate('materials');
  assert.equal(app.bodyClasses.has('sidebar-open'), false);
  assert.equal(app.nodes.get('adminPageTitle').textContent, 'translated:Materials / 资料审核');
  assert.equal(app.document.title, 'LP CLUB · translated:Materials / 资料审核');
  app.window.LPClubAdminShell.activate('unknown');
  assert.equal(app.document.title, 'LP CLUB · translated:Materials / 资料审核');
});

test('pricing controls share the page header without a duplicate heading', () => {
  const html = renderTablePage('');
  const pricing = html.slice(html.indexOf('id="pricingPanel"'), html.indexOf('<script src="assets/admin-auth.js"'));
  assert.doesNotMatch(pricing, /<h1/);
  assert.match(pricing, /class="toolbar"/);
});

test('showcase navigation updates its heading and breadcrumb', () => {
 const app=shell();app.window.LPClubAdminShell.activate('showcase');
 assert.equal(app.nodes.get('adminPageTitle').textContent,'translated:官网展示柜');
 assert.equal(app.nodes.get('adminBreadcrumb').textContent,'translated:官网展示柜');
});
