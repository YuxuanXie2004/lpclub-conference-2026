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

test('registration confirmation and privacy follow the optional materials', () => {
  const fs=require('node:fs');const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const material=html.indexOf('id="registrationMaterials"');
  const permissions=html.indexOf('class="material-item-permission"');
  const confirmation=html.indexOf('id="registrationConfirmation"');
  const formEnd=html.indexOf('</form>',material);
  assert.ok(material>0&&permissions>material&&confirmation>permissions&&confirmation<formEnd);
  assert.match(html.slice(confirmation,formEnd),/name="consent" type="checkbox" required/);
});

test('cancelling a registration image chooser keeps the selected image and hidden portrait consent follows eligibility', () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const file=new Blob(['image'],{type:'image/png'});file.name='example.png';
  const input={dataset:{materialInput:'card'},files:[file],addEventListener(name,fn){this[name]=fn;}};
  const preview={items:[],replaceChildren(){this.items=[];},append(...items){this.items.push(...items);}};
  const filename={dataset:{materialFilename:'card'},textContent:''};
  const portrait={hidden:true},portraitConsent={hidden:true};const module={exports:{}};
  const document={documentElement:{lang:'zh-CN'},getElementById:id=>id==='portraitMaterial'?portrait:id==='portraitConsentField'?portraitConsent:null,
    querySelectorAll:selector=>selector==='[data-material-input]'?[input]:selector==='[data-material-filename]'?[filename]:[],
    querySelector:selector=>selector.startsWith('[data-material-preview=')?preview:selector.startsWith('[data-material-filename=')?filename:null,createElement:()=>({dataset:{}})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/materials-client'),'utf8'),{module,document,Blob,FormData,URL,location:{pathname:'/'},fetch:async()=>({ok:true,json:async()=>({enabled:true})})});
  module.exports.init();module.exports.update({optionId:'speaking'});input.change();
  input.files=[];input.change();
  assert.equal(filename.textContent,'example.png');assert.equal(preview.items.length,1);
  assert.equal(portrait.hidden,false);assert.equal(portraitConsent.hidden,false);
  module.exports.update({optionId:'ticket'});assert.equal(portraitConsent.hidden,true);
});


test('initial registration keeps each permission inside its own image item',()=>{
  const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const photo=html.slice(html.indexOf('<article class="material-field" id="portraitMaterial"'),html.indexOf('<input id="materialLogo"'));
  const logo=html.slice(html.indexOf('<input id="materialLogo"'),html.indexOf('id="registrationConfirmation"'));
  assert.match(photo,/id="portraitConsent"/);assert.doesNotMatch(photo,/id="logoConsent"/);assert.match(logo,/id="logoConsent"/);
  assert.doesNotMatch(html,/class="material-permissions"/);
});

async function numberedShowcase({ speakers = [], organisations = [], fail = false } = {}) {
  const fs = require('node:fs'), vm = require('node:vm');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const sections = [], labels = [];
  for (const [, attributes, content] of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const heading = content.match(/<span class="num"[^>]*data-zh="([^"]*)"[^>]*>([^<]*)<\/span>/);
    if (!heading) continue;
    const grid = { innerHTML: '', querySelectorAll: () => [] }, image = { closest: () => ({ remove() { grid.innerHTML = ''; } }) };
    const section = { id: attributes.match(/id="([^"]*)"/)?.[1], hidden: /\bhidden\b/.test(attributes),
      querySelector: selector => selector === '[data-showcase-grid]' ? grid : grid.innerHTML ? {} : null,
      querySelectorAll: selector => selector === 'img' && grid.innerHTML ? [image] : [] };
    sections.push(section);
    labels.push({ textContent: heading[2], en: heading[2], zh: heading[1], closest: () => section });
  }
  const document = { documentElement: { lang: 'en' }, getElementById: id => sections.find(section => section.id === id),
    querySelectorAll: selector => selector === 'section .num' ? labels : [] };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/materials-client'), 'utf8'), {
    module, document, location: { pathname: '/' }, fetch: async url => {
      if (fail && url.endsWith('/showcase')) throw Error('Unavailable');
      return { ok: true, json: async () => url.endsWith('/config') ? { enabled: true } : { speakers, organisations } };
    }
  });
  module.exports.init();
  await new Promise(resolve => setImmediate(resolve));
  return { api: module.exports, sections, labels, visible: () => labels.filter(label => !label.closest().hidden).map(label => label.textContent) };
}

test('homepage numbers only visible sections for every showcase combination and language', async () => {
  const item = { name: 'Test', imageUrl: '/api/public/media/test/1' };
  for (const [speakers, organisations] of [[[], []], [[item], []], [[], [item]], [[item], [item]]]) {
    const page = await numberedShowcase({ speakers, organisations });
    assert.equal(page.labels.length, 11, 'Both showcase sections use the existing numbered heading style');
    for (const language of ['en', 'zh-CN', 'en']) {
      page.labels.forEach(label => { label.textContent = language === 'en' ? label.en : label.zh; });
      page.api.update({ language });
      const headings = page.visible();
      assert.equal(headings.length, 9 + Number(!!speakers.length) + Number(!!organisations.length));
      headings.forEach((heading, index) => assert.equal(heading.slice(0, 5), String(index + 1).padStart(2, '0') + ' — '));
      assert.match(headings.at(-1), language === 'en' ? /WHY ATTEND$/ : /参会价值$/);
      if (speakers.length) assert.match(headings[7], language === 'en' ? /CONFERENCE VOICES$/ : /大会嘉宾$/);
      if (organisations.length) assert.match(headings.at(-2), language === 'en' ? /PARTICIPATING ORGANISATIONS$/ : /参会机构$/);
    }
  }
});

test('section numbers close the gap when the last speaker image fails', async () => {
  const page = await numberedShowcase({ speakers: [{ name: 'Test', imageUrl: '/api/public/media/test/1' }] });
  const section = page.sections.find(section => section.id === 'speakers');
  section.querySelectorAll('img')[0].onerror();
  assert.equal(section.hidden, true);
  assert.match(page.visible().at(-2), /^08 — AGENDA$/);
  assert.match(page.visible().at(-1), /^09 — WHY ATTEND$/);
});

test('unavailable showcase keeps the original nine section numbers', async () => {
  const page = await numberedShowcase({ fail: true });
  assert.equal(page.visible().length, 9);
  assert.match(page.visible().at(-2), /^08 — AGENDA$/);
  assert.match(page.visible().at(-1), /^09 — WHY ATTEND$/);
});

test('registration keeps examples visible while selecting, replacing, removing and resetting images', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  for(const kind of ['card','portrait','logo']) {
    const example={dataset:{materialExample:kind},hidden:false};
    const preview={items:[],replaceChildren(){this.items=[];},append(image){this.items.push(image);}};
    const input={dataset:{materialInput:kind},files:[],value:'',addEventListener(name,fn){this[name]=fn;}};
    const clear={dataset:{materialClear:kind},hidden:true},choose={dataset:{materialChoose:kind}};
    const error={hidden:true,textContent:''},module={exports:{}};
    const nodes={'[data-material-input]':[input],'[data-material-clear]':[clear],'[data-material-choose]':[choose],'[data-material-example]':[example],'[data-material-preview]':[preview],'[data-material-error]':[error]};
    const document={documentElement:{lang:'en'},getElementById:()=>null,querySelectorAll:selector=>nodes[selector]||[],
      querySelector:selector=>selector.startsWith('[data-material-preview=')?preview:selector.startsWith('[data-material-input=')?input:error,createElement:()=>({})};
    vm.runInNewContext(fs.readFileSync(require.resolve('../assets/materials-client'),'utf8'),{module,document,Blob,FormData,URL,location:{pathname:'/'},fetch:async()=>({ok:true,json:async()=>({enabled:true})})});
    const api=module.exports;api.init();await new Promise(resolve=>setImmediate(resolve));
    for(const language of ['en','zh-CN']) {
      api.update({language});
      for(const name of ['first.png','replacement.png']) {
        const file=new Blob(['image'],{type:'image/png'});file.name=name;input.files=[file];input.change();
        assert.equal(example.hidden,false,'The reference example stays visible');
        assert.equal(preview.items.length,1);assert.equal(preview.items[0].alt,name);
        assert.equal(choose.textContent,language==='en'?'Replace':'更换');
      }
      input.files=[new Blob(['invalid'],{type:'image/svg+xml'})];input.change();
      assert.equal(preview.items[0].alt,'replacement.png');assert.equal(example.hidden,false);
      clear.onclick();assert.equal(preview.items.length,0);assert.equal(example.hidden,false);
      assert.equal(choose.textContent,language==='en'?'Upload':'上传');
    }
    const file=new Blob(['image'],{type:'image/png'});file.name='last.png';input.files=[file];input.change();
    api.reset();assert.equal(preview.items.length,0);assert.equal(example.hidden,false);
  }
});

test('registration renders user previews in the upload controls, separate from reference examples', () => {
  const html=require('node:fs').readFileSync(require.resolve('../index.html'),'utf8');
  for(const kind of ['card','portrait','logo']) {
    const control=html.match(new RegExp('<label class="material-file-picker">[^\\n]*data-material-input="'+kind+'"[^\\n]*?</label>'))?.[0]||'';
    assert.ok(control.includes('data-material-preview="'+kind+'"'),'The selected image belongs to its upload control');
    const example=html.match(new RegExp('<div class="material-art"[^\\n]*images/material-examples/'+kind+'\\.png[^\\n]*'))?.[0]||'';
    assert.ok(example);assert.doesNotMatch(example,/data-material-preview=/);
  }
});
