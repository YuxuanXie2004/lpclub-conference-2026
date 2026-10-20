'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderTablePage } = require('../server/sheet');

test('all four admin tabs are buttons in one document with isolated content panels', () => {
  const html = renderTablePage('admin-test');
  const tabs = html.match(/<div class="tabs"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.equal((tabs.match(/<button\b/g) || []).length, 4);
  assert.equal((tabs.match(/<a\b/g) || []).length, 0);
  for (const id of ['registrationPanel', 'vipPanel', 'materialsPanel']) assert.ok(html.includes('id="' + id + '"'));
  assert.equal((html.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal(html.includes('<iframe'), false);
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  const ids = [...markup.matchAll(/\bid="([^"\s]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'embedded panels must not duplicate static DOM ids');
});

test('material review is a dialog, matches the registration theme, and has no page navigation', () => {
  const html = renderTablePage('admin-test', 'active', { tab: 'materials', ref: 'LPC26-TEST' });
  assert.match(html, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="materials-review-title"/);
  assert.match(html, /id="materials-review-modal"/);
  assert.match(html, /id="materials-editor"/);
  assert.match(html, /--brand:#205f40/);
  assert.equal(html.includes('href="/materials-admin'), false);
  assert.equal(html.includes('href="/vip-codes'), false);
  for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(source));
});

function operations(responder) {
  const html = renderTablePage('test-admin'), elements = new Map(), requests = [];
  const document = { activeElement: null, documentElement: {}, addEventListener() {}, body: { appendChild() {} } };
  function element(id, panel = '') {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(), events = {}, el = {
      id, panel, value: '', textContent: '', hidden: false, disabled: false, checked: false, style: {}, dataset: {}, events,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n), toggle(n, force) { const on = force === undefined ? !classes.has(n) : force; on ? classes.add(n) : classes.delete(n); return on; } },
      setAttribute(name, value) { this[name] = value; },
      getAttribute(name) { return this[name] ?? null; },
      addEventListener(name, handler) { events[name] = handler; },
      focus() { document.activeElement = this; },
      querySelector(selector) { const match = selector.match(/^\[id="([^"]+)"\]$/); if (match) { const node = elements.get(match[1]); return node && (node.panel === id || node.id.startsWith(id === 'vipPanel' ? 'vip-' : 'materials-')) ? node : null; } return null; },
      querySelectorAll(selector) { if (id !== 'materialsPanel') return []; if(selector==='[data-text]')return [...elements.values()].filter(node=>node.dataset.text);if(['.approve','.confirm-reject','.reject','.cancel-reject'].includes(selector))return [...elements.values()].filter(node=>node.classes?.split(' ').includes(selector.slice(1)));return []; },
      getClientRects() { return [1]; }
    };
    let markup = '';
    Object.defineProperty(el, 'innerHTML', { get: () => markup, set(value) { markup = value; for (const [, child] of value.matchAll(/\bid="([^"\s]+)"/g)) element(child, panel || id);if(id==='materials-editor'){for(const node of [...elements.values()])if(node.dynamicMaterial)elements.delete(node.id);let index=0;for(const match of value.matchAll(/<(input|textarea|button)\b([^>]*?)(?:>([^<]*)<\/textarea>|>)/g)){const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));if(!attrs.id&&!attrs['data-text']&&!attrs.class)continue;const key=attrs.id||(attrs['data-text']?'material-text-'+attrs['data-text']:'material-control-'+index++),node=element(key,'materialsPanel');node.dynamicMaterial=true;node.value=attrs.value??(match[1]==='textarea'?match[3]||'':'');node.classes=attrs.class||'';node.dataset={};for(const [key,val]of Object.entries(attrs))if(key.startsWith('data-'))node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;}} } });
    elements.set(id, el); return el;
  }
  for (const [, id] of html.replace(/<script>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"\s]+)"/g)) element(id, id.startsWith('vip-') ? 'vipPanel' : id.startsWith('materials-') ? 'materialsPanel' : '');
  const tabs = element('tabs');
  document.getElementById = id => elements.get(id);
  document.querySelector = selector => selector === '.tabs' ? tabs : null;
  document.querySelectorAll = () => [];
  document.createElement = () => ({ click() {}, remove() {} });
  const window = { addEventListener() {} };
  const context = vm.createContext({ document, window, location: { pathname: '/table', href: '/table?token=test-admin' }, history: { replaceState() { throw Error('Tab controllers must not navigate'); } }, URL, URLSearchParams, Blob, console, navigator: {}, MutationObserver: class { observe() {} }, setInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, confirm: () => false,
    fetch: async (url, options) => { const target = new URL(url, 'http://localhost/table'); url = target.pathname + target.search; requests.push({ url, options }); return { ok: true, json: async () => responder ? responder(url, options) : url.startsWith('/api/admin/vip-codes') ? { ok: true, items: [], total: 0, stats: {} } : { ok: true, rows: [] } }; }
  });
  for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(source, context);
  return { context, elements, window, requests, tabs };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('tab controllers preserve page location and only activate the selected panel', async () => {
  const app = operations(); await flush();
  for (const tab of ['vip', 'materials', 'deleted', 'active']) {
    vm.runInContext(`setTab('${tab}')`, app.context); await flush();
    assert.equal(app.elements.get('vipPanel').hidden, tab !== 'vip');
    assert.equal(app.elements.get('materialsPanel').hidden, tab !== 'materials');
    assert.equal(app.elements.get('registrationPanel').hidden, !['active', 'deleted'].includes(tab));
    for (const name of ['vip', 'materials', 'active', 'deleted']) assert.equal(app.elements.get(name + 'Tab')['aria-selected'], String(name === tab));
  }
  assert.equal(vm.runInContext('location.href', app.context), '/table?token=test-admin');
  assert.ok(app.requests.some(r => r.url.startsWith('/api/admin/vip-codes')));
  assert.ok(app.requests.some(r => r.url.startsWith('/api/admin/materials')));
});

test('a delayed active-registration response cannot replace the deleted list', async () => {
  let release;
  const old = new Promise(resolve => { release = resolve; });
  const app = operations(url => url.includes('mode=active') ? old : { ok: true, rows: [{ ref: 'DELETED-ROW', status: 'Received', fullName: 'Deleted Person' }] });
  vm.runInContext("setTab('deleted')", app.context); await flush();
  release({ ok: true, rows: [{ ref: 'ACTIVE-ROW', status: 'Received', fullName: 'Active Person' }] }); await flush();
  assert.ok(app.elements.get('body').innerHTML.includes('DELETED-ROW'));
  assert.ok(!app.elements.get('body').innerHTML.includes('ACTIVE-ROW'));
});

test('opening material review displays a modal and Escape closes it without leaving the tab', async () => {
  const row = { ref: 'LPC26-TEST', identity: { name: 'Review Person', company: 'Capital', title: 'Partner' }, status: 'Approved', consents: { portrait: true, logo: true }, assets: { card: { status: 'missing', version: 0 }, portrait: { status: 'missing', version: 0 }, logo: { status: 'missing', version: 0 } }, config: {}, publications: {}, audit: [], owner: '', email: 'review@example.com' };
  const app = operations(url => ({ ok: true, rows: url.startsWith('/api/admin/materials') ? [row] : [] })); await flush();
  vm.runInContext("setTab('materials','LPC26-TEST')", app.context); await flush();
  const modal = app.elements.get('materials-review-modal');
  assert.equal(modal.classList.contains('on'), true);
  assert.ok(app.elements.get('materials-editor').innerHTML.includes('Review Person'));
  app.elements.get('materialsPanel').events.keydown({ key: 'Escape', stopPropagation() {} });
  assert.equal(modal.classList.contains('on'), false);
  assert.equal(app.elements.get('materialsPanel').hidden, false);
});

test('active and deleted registration filters are restored independently across tab switches', async () => {
  const app = operations(url => ({ ok: true, rows: url.includes('/api/registrations') ? [{ ref: 'REF', status: 'Approved', fullName: 'Person', items: 'GP Pass' }] : [] })); await flush();
  app.elements.get('search').value = 'active search';
  app.elements.get('statusFilter').value = 'Approved';
  app.elements.get('packageFilter').value = 'GP Pass';
  vm.runInContext("setTab('deleted')", app.context); await flush();
  app.elements.get('search').value = 'deleted search';
  app.elements.get('statusFilter').value = 'Rejected';
  vm.runInContext("setTab('vip');setTab('active')", app.context); await flush();
  assert.equal(app.elements.get('search').value, 'active search');
  assert.equal(app.elements.get('statusFilter').value, 'Approved');
  assert.equal(app.elements.get('packageFilter').value, 'GP Pass');
  vm.runInContext("setTab('deleted')", app.context); await flush();
  assert.equal(app.elements.get('search').value, 'deleted search');
  assert.equal(app.elements.get('statusFilter').value, 'Rejected');
});


test('switching management language preserves tab, filters, review edits, and makes no requests', async () => {
  const row = { ref: 'REF', status: 'Approved', identity: { name: 'Approved', company: 'Received', title: 'Partner' }, consents: {}, assets: Object.fromEntries(['card','portrait','logo'].map(kind => [kind,{status:'missing',version:0}])), config: {}, publications: {}, audit: [] };
  const app = operations(url => ({ ok: true, rows: url.startsWith('/api/admin/materials') ? [row] : [] })); await flush();
  vm.runInContext("setTab('materials','REF')", app.context); await flush();
  app.elements.get('owner').value = 'Unsaved owner';
  app.elements.get('followUpNote').value = 'Unsaved note';
  app.elements.get('materials-filter').value = 'REF';
  const count = app.requests.length, owner = app.elements.get('owner');
  app.window.LPClubAdminI18n.setLanguage('zh');
  assert.equal(app.elements.get('materialsPanel').hidden, false);
  assert.equal(app.elements.get('materials-review-modal').classList.contains('on'), true);
  assert.equal(app.elements.get('owner'), owner);
  assert.equal(owner.value, 'Unsaved owner');
  assert.equal(app.elements.get('followUpNote').value, 'Unsaved note');
  assert.equal(app.elements.get('materials-filter').value, 'REF');
  assert.equal(app.requests.length, count);
  assert.equal(vm.runInContext("selectStatus({ref:'REF',status:'Approved'})", app.context).includes('value="Approved"'), true);
});

test('registration filters and pagination query the server instead of filtering only the loaded page',async()=>{
 const app=operations(url=>({ok:true,rows:[],total:120,page:1,pageSize:50,stats:{Total:120,Approved:80},packages:['Delegate Pass']}));await flush();
 app.elements.get('search').value='capital';app.elements.get('statusFilter').value='Approved';
 vm.runInContext('registrationPage=2;load()',app.context);await flush();
 const request=app.requests.at(-1);assert.ok(request.url.includes('q=capital'));assert.ok(request.url.includes('status=Approved'));assert.ok(request.url.includes('page=2'));
 assert.ok(app.elements.get('stats').innerHTML.includes('120'));
});

test('delayed materials list cannot overwrite a newer filter response',async()=>{
 let release;const old=new Promise(resolve=>release=resolve);
 const make=ref=>({ref,status:'Received',identity:{name:ref},assets:Object.fromEntries(['card','portrait','logo'].map(k=>[k,{status:'missing',version:0}])),owner:''});
 const app=operations(url=>url.startsWith('/api/admin/materials')?(url.includes('ref=NEW')?{ok:true,rows:[make('NEW')],total:1}:old):{ok:true,rows:[]});await flush();
 vm.runInContext("setTab('materials')",app.context);app.elements.get('materials-filter').value='NEW';app.window.LPClubOpsMaterials.refresh();await flush();
 release({ok:true,rows:[make('OLD')],total:1});await flush();
 assert.ok(app.elements.get('materials-rows').innerHTML.includes('NEW'));assert.ok(!app.elements.get('materials-rows').innerHTML.includes('OLD'));
});

test('materials offers review and cabinet workareas without technical publishing fields',()=>{
 const html=renderTablePage('test-admin');
 assert.match(html,/官网展示柜/);assert.match(html,/审核工作台/);assert.match(html,/showcase-admin\.js/);
 assert.ok(!html.includes('id="orgKey"'));assert.ok(!html.includes('data-lang="'));const controller=require('../server/materials-pages').renderMaterialsAdminParts('token').script;assert.ok(!controller.includes('审核并发布当前版本'));
});

function reviewRecord(ref='DRAFT') { return {ref,rowVersion:1,status:'Approved',identity:{name:'Original',company:'Capital',title:'Partner'},owner:'Original owner',followUpNote:'Original note',consents:{},config:{name:'Public name',title:'Public title',company:'Public company'},assets:Object.fromEntries(['card','portrait','logo'].map(kind=>[kind,{status:'pending',version:1,rowVersion:1,preview:kind==='card'}])),audit:[]}; }
test('saving one review block preserves other dirty fields and refreshes canonical values and row versions',async()=>{
 let row=reviewRecord();const app=operations((url,options)=>{if(options?.method==='PUT'){const data=JSON.parse(options.body);if(url.endsWith('/owner')){row={...row,owner:data.owner,followUpNote:data.note,config:{...row.config,title:'External title'}};}else row={...row,config:{name:data.name,title:data.title,company:data.company}};row={...row,rowVersion:row.rowVersion+1};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 app.elements.get('material-text-name').value='Unsaved display name';app.elements.get('owner').value='Saved owner';await app.elements.get('saveOwner').onclick();await flush();
 assert.equal(app.elements.get('material-text-name').value,'Unsaved display name');assert.equal(app.elements.get('material-text-title').value,'External title','unchanged fields take newer server values');assert.equal(app.elements.get('owner').value,'Saved owner');
 app.elements.get('followUpNote').value='Unsaved follow-up';await app.elements.get('saveConfig').onclick();await flush();
 const sent=app.requests.filter(r=>r.url.endsWith('/config')).at(-1);assert.equal(JSON.parse(sent.options.body).rowVersion,2);assert.equal(JSON.parse(sent.options.body).name,'Unsaved display name');assert.equal(app.elements.get('followUpNote').value,'Unsaved follow-up');
});
test('material approval reload preserves both field blocks and language changes preserve those drafts',async()=>{
 let row=reviewRecord();const app=operations((url,options)=>{if(options?.method==='POST'){row={...row,rowVersion:2};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 app.elements.get('material-text-name').value='Keep this text';app.elements.get('owner').value='Keep this owner';const approve=[...app.elements.values()].find(node=>node.classes?.split(' ').includes('approve'));await approve.onclick();await flush();
 assert.equal(app.elements.get('material-text-name').value,'Keep this text');assert.equal(app.elements.get('owner').value,'Keep this owner');app.window.LPClubAdminI18n.setLanguage('zh');assert.equal(app.elements.get('owner').value,'Keep this owner');
});

test('applying the material filter with Refresh resets server pagination',async()=>{
 const app=operations(url=>({ok:true,rows:[],total:url.startsWith('/api/admin/materials')?120:0}));await flush();vm.runInContext("setTab('materials')",app.context);await flush();app.elements.get('materials-next').onclick();await flush();app.elements.get('materials-filter').value='NEW-REF';await app.elements.get('materials-refresh').onclick();await flush();const request=app.requests.filter(r=>r.url.startsWith('/api/admin/materials?')).at(-1);assert.ok(request.url.includes('ref=NEW-REF'));assert.ok(request.url.includes('page=1'));
});
test('a finished mutation cannot reopen or replace another active review',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);const a=reviewRecord('A'),b=reviewRecord('B');const app=operations((url,options)=>options?.method==='PUT'?pending:{ok:true,rows:url.startsWith('/api/admin/materials')?[a,b]:[]});await flush();vm.runInContext("setTab('materials','A')",app.context);await flush();const saving=app.elements.get('saveOwner').onclick();vm.runInContext("setTab('materials','B')",app.context);await flush();app.elements.get('owner').value='B draft';release({ok:true});await saving;await flush();assert.ok(app.elements.get('materials-editor').innerHTML.includes('B'));assert.equal(app.elements.get('owner').value,'B draft');
});

test('edits made while saving survive even when reverted to the previous server value',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);let row=reviewRecord();const app=operations(async(url,options)=>{if(options?.method==='PUT'){const data=JSON.parse(options.body);await pending;row={...row,owner:data.owner,followUpNote:data.note,rowVersion:2};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();app.elements.get('owner').value='Submitted owner';const saving=app.elements.get('saveOwner').onclick();app.elements.get('owner').value='Original owner';finish();await saving;await flush();assert.equal(app.elements.get('owner').value,'Original owner');await app.window.LPClubOpsMaterials.refresh();await flush();assert.equal(app.elements.get('owner').value,'Original owner');
});
