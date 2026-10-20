'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('showcase safely renders names and only accepts same-origin publication images', () => {
  const { speakerCard, organisationCard } = require('../assets/materials-client');
  const speaker = { id: '1', imageUrl: '/api/public/media/one/1', name: { en: '<img src=x onerror=alert(1)>', zh: '张三' }, title: { en: 'Partner' }, company: { en: 'Capital' }, kind: 'panel' };
  const html = speakerCard(speaker, 'en');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(speakerCard(speaker, 'zh-CN').includes('张三'));
  assert.equal(speakerCard({ ...speaker, imageUrl: 'https://attacker.example/pixel' }, 'en'), '');
  assert.equal(organisationCard({ imageUrl: 'javascript:alert(1)', name: { en: 'Bad' } }, 'en'), '');
  assert.ok(organisationCard({ imageUrl: '/api/public/media/two/1', name: { en: 'English only' } }, 'zh-CN').includes('English only'));
});

test('client validates file sizes and allowed formats before attempting upload', () => {
  const { validateFile } = require('../assets/materials-client');
  assert.equal(validateFile({ size: 1024, type: 'image/png' }), '');
  assert.ok(validateFile({ size: 5 * 1024 * 1024 + 1, type: 'image/png' }));
  assert.ok(validateFile({ size: 1024, type: 'image/svg+xml' }));
  assert.ok(validateFile({ size: 0, type: 'image/png' }));
});

test('integrated registration and management inline scripts compile without a browser', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const { renderTablePage } = require('../server/sheet');
  const pages = [fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), renderTablePage('test-admin')];
  for (const page of pages) for (const [, source] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(source));
});

test('registration upload permission failure keeps registration saved and explains the storage issue', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const preview = { replaceChildren() {}, append() {} }, message = { hidden: true, textContent: '' };
  const file = new Blob(['test-image'], { type: 'image/png' });
  const input = { dataset: { materialInput: 'portrait' }, files: [file], addEventListener(name, fn) { this[name] = fn; } };
  const requests = [], module = { exports: {} };
  const document = { documentElement: { lang: 'en' }, getElementById: id => id === 'materialSubmissionStatus' ? message : null,
    querySelectorAll: selector => selector === '[data-material-input]' ? [input] : [], querySelector: () => preview, createElement: () => ({ dataset: {} }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/materials-client'), 'utf8'), { module, document, Blob, FormData, URL, location: { pathname: '/' },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: !options, json: async () => options ? { ok: false, code: 'MATERIALS_STORAGE_PERMISSION_REQUIRED' } : { enabled: true } }; }
  });
  module.exports.init(); await new Promise(resolve => setImmediate(resolve));
  module.exports.update({ optionId: 'speaking' }); input.change();
  await module.exports.uploadRegistered({ ref: 'SAVED-REF', materials: { uploadToken: 'short-lived' } });
  assert.equal(message.hidden, false);
  assert.match(message.textContent, /registration is saved/i);
  assert.match(message.textContent, /storage permissions/i);
  assert.equal(requests.filter(r => r.options).length, 1);
  assert.equal(requests.some(r => r.url.includes('/api/order')), false);
});

test('showcase image rendering accepts deployment prefixes and still rejects external paths',()=>{
 const {speakerCard}=require('../assets/materials-client');
 const row={imageUrl:'/2026-pe-conference/api/public/media/one/1',name:{en:'Test'}};
 assert.ok(speakerCard(row,'en').includes('/2026-pe-conference/api/public/media/'));
 assert.equal(speakerCard({...row,imageUrl:'//attacker.example/api/public/media/one/1'},'en'),'');
});

test('organisation wall switches rows at the agreed company count boundaries', () => {
  const { organisationWall } = require('../assets/materials-client');
  assert.equal(typeof organisationWall, 'function');
  for (const [count, rows] of [[0,0],[1,1],[3,1],[4,2],[8,2],[9,3],[20,3]]) {
    const companies = Array.from({length:count}, (_,i) => ({name:'Company '+i,imageUrl:'/api/public/media/org-'+i+'/1'}));
    const html = organisationWall(companies, 'en');
    assert.equal((html.match(/data-organisation-row/g) || []).length, rows, count+' companies');
    const originals = html.match(/<article class="organisation-card" role="listitem">/g) || [];
    assert.equal(originals.length, count, 'Each company is announced exactly once');
    for (const company of companies) assert.ok(html.includes(company.imageUrl));
  }
});

test('organisation wall ignores unsafe images before deciding rows and escapes display names', () => {
  const { organisationWall } = require('../assets/materials-client');
  assert.equal(typeof organisationWall, 'function');
  const valid = {name:{en:'<Fund & Partners>',zh:'测试机构'},imageUrl:'/event/api/public/media/one/1'};
  const invalid = {name:'Unsafe',imageUrl:'https://other.test/image.png'};
  const html = organisationWall([valid,valid,valid,invalid], 'en');
  assert.equal((html.match(/data-organisation-row/g) || []).length, 1);
  assert.ok(html.includes('&lt;Fund &amp; Partners&gt;'));
  assert.ok(!html.includes('https://other.test/'));
  assert.ok(organisationWall([valid], 'zh-CN').includes('测试机构'));
  assert.equal(organisationWall([invalid], 'en'), '');
});

test('all published speakers are shown immediately without a view-all step', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const grid = {innerHTML:''}, more = {hidden:true,setAttribute() {}};
  const section = {hidden:true,querySelector: selector => selector === '[data-showcase-grid]' ? grid : more,querySelectorAll: () => []};
  const document = {documentElement:{lang:'en'},getElementById: id => id === 'speakers' ? section : null,querySelectorAll: () => []};
  const speakers = Array.from({length:21}, (_,i) => ({name:'Speaker '+i,imageUrl:'/api/public/media/speaker-'+i+'/1'}));
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/materials-client'),'utf8'), {module,document,location:{pathname:'/'},fetch:async url=>({ok:true,json:async()=>url.endsWith('/config')?{enabled:false}:{speakers,organisations:[]}})});
  module.exports.init();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(section.hidden,false);
  assert.equal((grid.innerHTML.match(/class="speaker-card"/g)||[]).length,21);
  for (const speaker of speakers) assert.ok(grid.innerHTML.includes(speaker.name));
  assert.equal(more.hidden,true);
});
