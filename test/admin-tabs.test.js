'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderTablePage } = require('../server/sheet');

test('all five admin tabs are buttons in one document with isolated content panels', () => {
  const html = renderTablePage('admin-test');
  const tabs = html.match(/<div class="tabs"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.equal((tabs.match(/<button\b/g) || []).length, 5);
  assert.equal((tabs.match(/<a\b/g) || []).length, 0);
  for (const id of ['registrationPanel', 'vipPanel', 'materialsPanel', 'pricingPanel']) assert.ok(html.includes('id="' + id + '"'));
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
      querySelector(selector) { const match = selector.match(/^\[id="([^"]+)"\]$/); if (match) { const node = elements.get(match[1]); return node && (node.panel === id || node.id.startsWith(id === 'vipPanel' ? 'vip-' : id === 'pricingPanel' ? 'pricing-' : 'materials-')) ? node : null; } const data=selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);if(data)return [...elements.values()].find(node=>node.dataset[data[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]===data[2])||null;if(selector==='textarea')return [...elements.values()].find(node=>node.dataset.reason===el.dataset.rejection)||null;return null; },
      querySelectorAll(selector) { if (id !== 'materialsPanel') return []; if(selector==='[data-text]')return [...elements.values()].filter(node=>node.dataset.text);if(selector==='[data-review-status]')return [...elements.values()].filter(node=>node.dataset.reviewStatus);if(['.approve','.confirm-reject','.reject','.cancel-reject'].includes(selector))return [...elements.values()].filter(node=>node.classes?.split(' ').includes(selector.slice(1)));return []; },
      getClientRects() { return [1]; }
    };
    let markup = '';
    Object.defineProperty(el, 'innerHTML', { get: () => markup, set(value) { markup = value; for (const [, child] of value.matchAll(/\bid="([^"\s]+)"/g)) element(child, panel || id);if(id==='materials-editor'){for(const node of [...elements.values()])if(node.dynamicMaterial)elements.delete(node.id);let index=0;for(const match of value.matchAll(/<(input|textarea|button|select|div)\b([^>]*)>/g)){const content=value.slice(match.index+match[0].length).split('</'+match[1]+'>')[0];const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));if(!attrs.id&&!Object.keys(attrs).some(key=>key.startsWith('data-'))&&!attrs.class)continue;const key=attrs.id||(attrs['data-text']?'material-text-'+attrs['data-text']:'material-control-'+index++),node=element(key,'materialsPanel');node.dynamicMaterial=true;node.value=attrs.value??(match[1]==='textarea'?content||'':match[1]==='select'?(content.match(/<option value="([^"]+)"[^>]*selected/)?.[1]||''):'');node.hidden=/\bhidden\b/.test(match[2]);node.classes=attrs.class||'';node.dataset={};for(const [key,val]of Object.entries(attrs))if(key.startsWith('data-'))node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;}} } });
    elements.set(id, el); return el;
  }
  for (const [, id] of html.replace(/<script>[\s\S]*?<\/script>/g, '').matchAll(/\bid="([^"\s]+)"/g)) element(id, id.startsWith('vip-') ? 'vipPanel' : id.startsWith('materials-') ? 'materialsPanel' : id.startsWith('pricing-') ? 'pricingPanel' : '');
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
  for (const tab of ['vip', 'materials', 'pricing', 'deleted', 'active']) {
    vm.runInContext(`setTab('${tab}')`, app.context); await flush();
    assert.equal(app.elements.get('vipPanel').hidden, tab !== 'vip');
    assert.equal(app.elements.get('materialsPanel').hidden, tab !== 'materials');
    assert.equal(app.elements.get('pricingPanel').hidden, tab !== 'pricing');
    assert.equal(app.elements.get('registrationPanel').hidden, !['active', 'deleted'].includes(tab));
    for (const name of ['vip', 'materials', 'pricing', 'active', 'deleted']) assert.equal(app.elements.get(name + 'Tab')['aria-selected'], String(name === tab));
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
  assert.equal(app.elements.get('registrationStatus').value, 'Approved');
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
test('registration list shows read-only statuses and review dialog edits admission below identity',async()=>{
 const row=reviewRecord(),app=operations(url=>({ok:true,rows:[url.startsWith('/api/admin/materials')?row:{ref:row.ref,status:row.status,fullName:'Original'}]}));await flush();
 const list=app.elements.get('body').innerHTML;assert.doesNotMatch(list,/<select/);assert.match(list,/data-admin-i18n="Approved"/);
 vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();const html=app.elements.get('materials-editor').innerHTML;
 assert.ok(html.indexOf('id="registrationStatus"')>html.indexOf('id="saveConfig"'));assert.ok(html.indexOf('id="registrationStatus"')<html.indexOf('id="owner"'));assert.equal(app.elements.get('registrationStatus').value,'Approved');
 for(const status of ['Received','Under Review','Approved','Waitlisted','Rejected','Cancelled'])assert.ok(html.includes('value="'+status+'"'));
});
test('admission status saves from review with authentication and revision while preserving drafts',async()=>{
 let row=reviewRecord();const app=operations((url,options)=>{if(url==='/api/admin/status'){const body=JSON.parse(options.body);row={...row,status:body.status,rowVersion:2};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 app.elements.get('material-text-name').value='Unsaved name';app.elements.get('owner').value='Unsaved owner';const select=app.elements.get('registrationStatus');select.value='Rejected';await select.onchange();
 const sent=app.requests.find(r=>r.url==='/api/admin/status');assert.equal(sent.options.headers['X-Admin-Token'],'test-admin');assert.deepEqual(JSON.parse(sent.options.body),{ref:'DRAFT',rowVersion:1,status:'Rejected'});assert.equal(app.elements.get('registrationStatus').value,'Rejected');assert.equal(app.elements.get('material-text-name').value,'Unsaved name');assert.equal(app.elements.get('owner').value,'Unsaved owner');
 app.elements.get('registrationStatus').value='Approved';await app.elements.get('registrationStatus').onchange();assert.equal(JSON.parse(app.requests.filter(r=>r.url==='/api/admin/status').at(-1).options.body).rowVersion,2);
});
test('failed admission change restores saved status and does not send material review',async()=>{
 const row=reviewRecord(),app=operations(url=>{if(url==='/api/admin/status')throw Error('Registration changed; refresh before saving.');return {ok:true,rows:url.startsWith('/api/admin/materials')?[row]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();const select=app.elements.get('registrationStatus');select.value='Rejected';await select.onchange();assert.equal(select.value,'Approved');assert.equal(select.disabled,false);assert.equal(app.requests.some(r=>r.url.endsWith('/review')),false);assert.match(app.elements.get('materials-message').textContent,/Registration changed/);
});
test('material review shows a single dropdown below each uploaded image with canonical status',async()=>{
 const row=reviewRecord();row.assets.card.status='received';row.assets.portrait={...row.assets.portrait,preview:true,status:'approved'};row.assets.logo={...row.assets.logo,preview:true,status:'rejected',reason:'Blurry'};
 const app=operations(url=>({ok:true,rows:url.startsWith('/api/admin/materials')?[row]:[]}));await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 const html=app.elements.get('materials-editor').innerHTML,articles=[...html.matchAll(/<article class="review-asset">([\s\S]*?)<\/article>/g)].map(match=>match[1]);assert.equal(articles.length,3);
 for(const article of articles){assert.match(article,/<select[^>]*data-review-status=/);assert.ok(article.indexOf('<select')>article.indexOf('<img'));assert.doesNotMatch(article.split('<img')[0],/<p>/);assert.doesNotMatch(article,/class="primary approve"|class="danger reject"/);}
 for(const [kind,value]of [['card','pending'],['portrait','approve'],['logo','reject']])assert.equal([...app.elements.values()].find(node=>node.dataset.reviewStatus===kind).value,value);
 app.window.LPClubAdminI18n.setLanguage('zh');for(const [value,label]of [['pending','待审核'],['approve','已通过'],['reject','未通过']])assert.match(html,new RegExp('<option value="'+value+'" data-admin-i18n="'+label+'"'));
});
for(const decision of ['approve','pending'])test('material dropdown saves '+decision+' with version checks and refreshes its value',async()=>{
 let row=reviewRecord();row.assets.card.status='rejected';const app=operations((url,options)=>{if(options?.method==='POST'){const data=JSON.parse(options.body);row.assets.card={...row.assets.card,status:data.decision==='approve'?'approved':'received',rowVersion:2};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 const select=[...app.elements.values()].find(node=>node.dataset.reviewStatus==='card');select.value=decision;await select.onchange();const sent=app.requests.find(request=>request.url.endsWith('/review'));assert.deepEqual(JSON.parse(sent.options.body),{kind:'card',version:1,rowVersion:1,decision,reason:''});assert.equal([...app.elements.values()].find(node=>node.dataset.reviewStatus==='card').value,decision);
});
test('reject dropdown requires a reason, cancellation restores status, and confirmation saves rejection',async()=>{
 const row=reviewRecord(),app=operations(url=>({ok:true,rows:url.startsWith('/api/admin/materials')?[row]:[]}));await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 const select=[...app.elements.values()].find(node=>node.dataset.reviewStatus==='card'),box=[...app.elements.values()].find(node=>node.dataset.rejection==='card'),reason=[...app.elements.values()].find(node=>node.dataset.reason==='card');select.value='reject';await select.onchange();assert.equal(box.hidden,false);assert.equal(app.requests.some(r=>r.url.endsWith('/review')),false);
 const cancel=[...app.elements.values()].find(node=>node.classes?.includes('cancel-reject'));cancel.onclick();assert.equal(select.value,'pending');assert.equal(box.hidden,true);
 select.value='reject';await select.onchange();const confirm=[...app.elements.values()].find(node=>node.classes?.includes('confirm-reject'));await confirm.onclick();assert.equal(app.requests.some(r=>r.url.endsWith('/review')),false);assert.equal(app.elements.get('materials-message').textContent,app.window.LPClubAdminI18n.text('请填写驳回原因'));
 select.value='reject';await select.onchange();reason.value=' Please replace the blurry image ';await confirm.onclick();assert.equal(JSON.parse(app.requests.find(r=>r.url.endsWith('/review')).options.body).reason,'Please replace the blurry image');
});
test('failed material review restores the saved selection and re-enables the dropdown',async()=>{
 const row=reviewRecord(),app=operations((url)=>{if(url.endsWith('/review'))throw Error('Review unavailable');return {ok:true,rows:url.startsWith('/api/admin/materials')?[row]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();const select=[...app.elements.values()].find(node=>node.dataset.reviewStatus==='card');select.value='approve';await select.onchange();assert.equal(select.value,'pending');assert.equal(select.disabled,false);assert.match(app.elements.get('materials-message').textContent,/Review unavailable/);
});
test('saving one review block preserves other dirty fields and refreshes canonical values and row versions',async()=>{
 let row=reviewRecord();const app=operations((url,options)=>{if(options?.method==='PUT'){const data=JSON.parse(options.body);if(url.endsWith('/owner')){row={...row,owner:data.owner,followUpNote:data.note,config:{...row.config,title:'External title'}};}else row={...row,config:{name:data.name,title:data.title,company:data.company}};row={...row,rowVersion:row.rowVersion+1};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 app.elements.get('material-text-name').value='Unsaved display name';app.elements.get('owner').value='Saved owner';await app.elements.get('saveOwner').onclick();await flush();
 assert.equal(app.elements.get('material-text-name').value,'Unsaved display name');assert.equal(app.elements.get('material-text-title').value,'External title','unchanged fields take newer server values');assert.equal(app.elements.get('owner').value,'Saved owner');
 app.elements.get('followUpNote').value='Unsaved follow-up';await app.elements.get('saveConfig').onclick();await flush();
 const sent=app.requests.filter(r=>r.url.endsWith('/config')).at(-1);assert.equal(JSON.parse(sent.options.body).rowVersion,2);assert.equal(JSON.parse(sent.options.body).name,'Unsaved display name');assert.equal(app.elements.get('followUpNote').value,'Unsaved follow-up');
});
test('material approval reload preserves both field blocks and language changes preserve those drafts',async()=>{
 let row=reviewRecord();const app=operations((url,options)=>{if(options?.method==='POST'){row={...row,rowVersion:2};return {ok:true};}return {ok:true,rows:url.startsWith('/api/admin/materials')?[JSON.parse(JSON.stringify(row))]:[]};});await flush();vm.runInContext("setTab('materials','DRAFT')",app.context);await flush();
 app.elements.get('material-text-name').value='Keep this text';app.elements.get('owner').value='Keep this owner';const select=[...app.elements.values()].find(node=>node.dataset.reviewStatus==='card');select.value='approve';await select.onchange();await flush();
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
