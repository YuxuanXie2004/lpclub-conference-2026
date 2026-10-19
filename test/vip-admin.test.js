'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function render(token = 'admin-secret') {
  const file = path.resolve(__dirname, '../server/vip-admin.js');
  assert.ok(fs.existsSync(file), 'VIP 管理页面模块需要实现');
  return require(file).renderVipPage(token);
}

function script(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, '页面只应包含一个完整脚本块');
  return blocks[0][1];
}

function browser(items = [], responder) {
  const elements = new Map();
  const requests = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, checked: false,
      dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, handler) { this[type] = handler; },
      setAttribute() {}, focus() {}, close() {}, showModal() {},
      querySelectorAll() { return []; }
    });
    return elements.get(id);
  };
  get('generateCount').value = '1';
  const context = vm.createContext({
    document: { getElementById: get, addEventListener() {}, querySelectorAll() { return []; } },
    URL, URLSearchParams, Date, Set, Map, Blob, console,
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout() { return 1; }, clearTimeout() {},
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (responder) return responder(url, options);
      return { ok: true, json: async () => ({ ok: true, items, total: items.length, page: 1, pageSize: 50, stats: { available: items.length } }) };
    }
  });
  vm.runInContext(script(render()), context);
  return { context, get, requests };
}

test('VIP 页面安全嵌入 token，无法结束脚本或污染 HTML 属性', () => {
  const token = '\"><script>alert(1)</script>&\u2028\u2029';
  const html = render(token);
  assert.ok(!html.includes(token));
  const source = script(html);
  const context = vm.createContext({});
  vm.runInContext(source.split('const $=')[0] + '; globalThis.actualToken = TOKEN;', context);
  assert.equal(context.actualToken, token);
  assert.ok(html.includes('table?token=' + encodeURIComponent(token)));
});

test('VIP 页面浏览器脚本语法有效，提供移动端布局与原后台一致的英文操作', () => {
  const html = render();
  assert.doesNotThrow(() => new vm.Script(script(html)));
  assert.match(html, /lang="en"/);
  assert.match(html, /@media/);
  for (const label of ['Generate VIP Codes', 'Used By', 'Business Email', 'Export CSV']) assert.ok(html.includes(label), label);
});

test('加载列表通过管理头认证，URL 不携带管理员 token', async () => {
  const { requests } = browser();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.startsWith('api/admin/vip-codes?'));
  assert.ok(!requests[0].url.includes('admin-secret'));
  assert.equal(requests[0].options.headers['X-Admin-Token'], 'admin-secret');
});

test('列表中的批次、姓名和邮件渲染为文本，阻止 HTML 注入', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const { get } = browser([{ id: 'id\" onclick=evil()', usedName: payload, usedEmail: payload, maskedCode: 'VIP-****', status: 'available' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!get('body').innerHTML.includes(payload));
  assert.ok(get('body').innerHTML.includes('&lt;img'));
  assert.ok(!get('body').innerHTML.includes('data-id="id" onclick'));
});

test('生成数量超出 1–200 时拒绝请求并显示原因', async () => {
  const { context, get, requests } = browser();
  await new Promise(resolve => setImmediate(resolve));
  get('generateCount').value = '201';
  await vm.runInContext('generateCodes()', context);
  assert.equal(requests.length, 1);
  assert.match(get('toast').textContent, /1.*200/);
});

test('生成仅需数量，不要求手工登记收件人或分发信息', async () => {
  const { context, get, requests } = browser();
  await new Promise(resolve => setImmediate(resolve));
  await vm.runInContext('generateCodes()', context);
  const request = requests.find(r => r.options.method === 'POST');
  assert.ok(request);
  assert.deepEqual(JSON.parse(request.options.body), { count: 1 });
  assert.equal(request.options.headers['X-Admin-Token'], 'admin-secret');
  assert.ok(!JSON.parse(request.options.body).distributedAt);
});

test('列表刷新失败时不允许勾选上次缓存的隐藏行', async () => {
  let fail = false;
  const { context, get } = browser([], () => ({
    ok: !fail,
    json: async () => fail ? { ok: false, error: '外部服务失败', code: 'UNAVAILABLE' } : { ok: true, items: [{ id: 'old', status: 'available' }], total: 1, page: 1, pageSize: 50 }
  }));
  await new Promise(resolve => setImmediate(resolve));
  fail = true;
  await vm.runInContext('load()', context);
  assert.equal(get('selectPage').disabled, true);
  assert.equal(vm.runInContext('rows.length', context), 0);
  assert.match(get('body').innerHTML, /外部服务失败/);
});

test('异步复制期间选择更新不能重新启用同一按钮', async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const { context, get } = browser([], url => ({
    ok: true,
    json: async () => url.includes('/abc') ? deferred : { ok: true, items: [], total: 0 }
  }));
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext("selected.add('abc');updateSelection();copySelected();updateSelection();", context);
  assert.equal(get('copySelected').disabled, true);
  release({ ok: true, item: { status: 'available', code: 'VIP-ABC' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get('copySelected').disabled, false);
});

test('详情自动展示核销姓名邮箱，不能手工修改收件人', async () => {
  const {context,get,requests}=browser([],url=>({ok:true,json:async()=>url.includes('/abc')?{ok:true,item:{id:'abc',status:'used',usedName:'Jane Test',usedEmail:'jane@example-capital.com',code:'VIP-ABC'}}:{ok:true,items:[],total:0}}));
  await new Promise(resolve=>setImmediate(resolve));await vm.runInContext("openDetail('abc')",context);
  assert.match(get('detailMeta').innerHTML,/Jane Test/);assert.match(get('detailMeta').innerHTML,/jane@example-capital.com/);
  assert.equal(get('copyCode').disabled,true);assert.ok(!render().includes('id="recipientName"'));assert.ok(!render().includes('id="detailForm"'));
  assert.ok(!requests.some(request=>request.options.method==='PATCH'));
});

test('待核对码仅显示核对与人工作废，成功核对后保持登记只读', async () => {
  let checked = false;
  const { context, get, requests } = browser([], url => ({ ok: true, json: async () => {
    if (url.endsWith('/reconcile')) { checked = true; return { ok: true, matched: true }; }
    return url.includes('/abc') ? { ok: true, item: { id: 'abc', status: checked ? 'used' : 'review', code: 'VIP-ABC' }, events: [] } : { ok: true, items: [], total: 0 };
  } }));
  await new Promise(resolve => setImmediate(resolve));
  await vm.runInContext("openDetail('abc')", context);
  assert.equal(vm.runInContext('detail.status',context),'review');
  await vm.runInContext('reconcile()', context);
  assert.equal(requests.find(request => request.url.endsWith('/reconcile')).options.method, 'POST');
  assert.match(get('toast').textContent, /Registration matched/);
  assert.equal(vm.runInContext('detail.status',context),'used');
});
