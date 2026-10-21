'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

test('materials HTTP and page renderers exist', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../server/materials-http.js')), 'HTTP handler must exist');
  assert.ok(fs.existsSync(path.join(__dirname, '../server/materials-pages.js')), 'page renderers must exist');
});

async function serve(t, overrides = {}, showcase) {
  const { createMaterialsHandler } = require('../server/materials-http');
  const calls = [], logs = [];
  const service = { ready: () => true, authenticate: async (ref, token, options) => { calls.push(['auth', ref, token, options]); if (token !== 'valid') throw Object.assign(Error('Invalid token'), { statusCode: 401 }); if (!options.uploadOnly && ref === 'upload-only') throw Object.assign(Error('Upload only'), { statusCode: 403 }); return {}; }, me: async ref => ({ ref, identity: { name: 'Test' } }), showcase: async () => ({ ok: true, speakers: [], organisations: [] }), upload: async (ref, kind, file) => { calls.push(['upload', ref, kind, file.buffer.length]); return { assets: { [kind]: { version: 1 } } }; }, adminList: async () => [], ...overrides };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const readBody = async req => { let data = ''; for await (const part of req) data += part; return JSON.parse(data || '{}'); };
  const handler = createMaterialsHandler({ service, showcase, json, readBody, setSecurityHeaders: () => {}, allowed: req => req.headers['x-admin-token'] === 'admin', adminToken: 'admin', logger: { error: (...args) => logs.push(args) } });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://local'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: 'http://127.0.0.1:' + server.address().port, calls, logs };
}

test('manual showcase uploads and previews require admin auth and one multipart file',async t=>{
 const calls=[],showcase={upload:async(kind,file)=>{calls.push([kind,file.buffer.toString()]);return{item:{entryId:'manual'}};},preview:async(kind,id)=>{calls.push([kind,id]);return{buffer:Buffer.from('private'),mimeType:'image/webp'};}};
 const {base}=await serve(t,{},showcase),route='/api/admin/showcase/logo/uploads',headers={'X-Admin-Token':'admin'};
 const form=()=>{const data=new FormData();data.append('file',new Blob(['image'],{type:'image/png'}),'logo.png');return data;};
 assert.equal((await fetch(base+route,{method:'POST',body:form()})).status,401);assert.equal(calls.length,0);
 const uploaded=await fetch(base+route,{method:'POST',headers,body:form()});assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).item.entryId,'manual');assert.deepEqual(calls[0],['logo','image']);
 const multiple=form();multiple.append('file',new Blob(['second']),'b.png');assert.equal((await fetch(base+route,{method:'POST',headers,body:multiple})).status,400);
 const preview=route+'/11111111-1111-4111-8111-111111111111/preview';assert.equal((await fetch(base+preview)).status,401);
 const image=await fetch(base+preview,{headers});assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(await image.text(),'private');
 assert.equal((await fetch(base+'/api/admin/showcase/card/uploads',{method:'POST',headers,body:form()})).status,404);
});

test('readiness remains available while disabled and private APIs fail closed', async t => {
  const { base } = await serve(t, { ready: () => false, showcase: async () => ({ ok: true, enabled: false, speakers: [], organisations: [] }) });
  assert.deepEqual(await (await fetch(base + '/api/materials/config')).json(), { ok: true, enabled: false });
  const page = await fetch(base + '/materials');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /assets\/materials-page\.js/);
  assert.equal((await fetch(base + '/api/materials/me')).status, 503);
  assert.equal((await fetch(base + '/api/public/showcase')).status, 200);
});

test('private credentials use headers, reject query tokens, and admin review needs admin auth', async t => {
  const { base } = await serve(t);
  assert.equal((await fetch(base + '/api/materials/me?token=valid&ref=test')).status, 401);
  assert.equal((await fetch(base + '/api/materials/me', { headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'test' } })).status, 200);
  assert.equal((await fetch(base + '/api/materials/me', { headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'upload-only' } })).status, 403);
  assert.equal((await fetch(base + '/api/admin/materials')).status, 401);
  assert.equal((await fetch(base + '/api/admin/materials', { headers: { 'X-Admin-Token': 'admin' } })).status, 200);
});

test('multipart accepts exactly one file and authenticates upload-only before parsing', async t => {
  const { base, calls } = await serve(t);
  const form = new FormData(); form.append('file', new Blob(['image'], { type: 'image/png' }), 'image.png');
  const response = await fetch(base + '/api/materials/upload/logo', { method: 'POST', headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'upload-only' }, body: form });
  assert.equal(response.status, 200);
  assert.equal(calls[0][3].uploadOnly, true);
  assert.deepEqual(calls[1], ['upload', 'upload-only', 'logo', 5]);
  const multiple = new FormData(); multiple.append('file', new Blob(['x']), 'a.png'); multiple.append('file', new Blob(['y']), 'b.png');
  assert.equal((await fetch(base + '/api/materials/upload/logo', { method: 'POST', headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'test' }, body: multiple })).status, 400);
});

test('pages erase fragments and use blob previews; public media is no-store and fails closed', async t => {
  const { renderMaterialsPage, renderMaterialsAdminPage } = require('../server/materials-pages');
  const page = renderMaterialsPage();
  const client = fs.readFileSync(path.join(__dirname, '../assets/materials-page.js'), 'utf8');
  assert.match(page, /history.replaceState/);
  assert.match(client, /X-Registration-Ref/);
  assert.match(client, /URL.createObjectURL/);
  assert.equal(page.includes('type="email"'), false);
  const admin = renderMaterialsAdminPage('</script><script>alert(1)</script>');
  assert.equal(admin.includes('</script><script>alert(1)</script>'), false);
  const { base } = await serve(t, { publicImage: async () => ({ buffer: Buffer.from('webp'), mimeType: 'image/webp' }) });
  const response = await fetch(base + '/api/public/materials/test/logo?version=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'image/webp');
});

test('upstream details are never leaked by API errors', async t => {
  const { base, logs } = await serve(t, { showcase: async () => { throw Error('https://upstream/token=SECRET'); } });
  const response = await fetch(base + '/api/public/showcase');
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('SECRET'), false);
  assert.equal(JSON.stringify(logs).includes('SECRET'), false);
});

test('rendered inline scripts are valid JavaScript', () => {
  const vm = require('node:vm');
  const { renderMaterialsPage, renderMaterialsAdminPage } = require('../server/materials-pages');
  for (const page of [renderMaterialsPage(), renderMaterialsAdminPage('admin-token', 'ref')]) {
    for (const [, source] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(source));
  }
});

test('multipart accepts exactly 5 MiB and rejects one byte above the limit', async t => {
  const { base } = await serve(t);
  for (const [size, status] of [[5 * 1024 * 1024, 200], [5 * 1024 * 1024 + 1, 413]]) {
    const form = new FormData(); form.append('file', new Blob([Buffer.alloc(size)], { type: 'image/png' }), 'image.png');
    const response = await fetch(base + '/api/materials/upload/logo', { method: 'POST', headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'test' }, body: form });
    assert.equal(response.status, status);
  }
});

test('upload permission failures return a safe actionable code and are logged without credentials', async t => {
  const problem = Object.assign(Error('Attachment upload/download needs file storage permissions. Please contact the organiser.'), { statusCode: 503, code: 'MATERIALS_STORAGE_PERMISSION_REQUIRED', feishuCode: 99991672, retryable: false });
  const { base, logs } = await serve(t, { upload: async () => { throw problem; } });
  const form = new FormData(); form.append('file', new Blob(['image'], { type: 'image/png' }), 'image.png');
  const response = await fetch(base + '/api/materials/upload/portrait', { method: 'POST', headers: { Authorization: 'Bearer valid', 'X-Registration-Ref': 'test' }, body: form });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.code, 'MATERIALS_STORAGE_PERMISSION_REQUIRED');
  assert.equal(data.retryable, false);
  assert.match(data.error, /permission/);
  assert.equal(logs.length, 1);
  assert.match(JSON.stringify(logs), /99991672/);
  assert.equal(JSON.stringify(logs).includes('Bearer valid'), false);
});

test('showcase editing endpoints require admin auth and preserve optimistic revision requests',async t=>{
 const calls=[];const showcase={board:async kind=>({kind,revision:3,items:[]}),candidates:async(kind,options)=>{calls.push({kind,options});return{kind,rows:[],total:0,page:2,pageSize:10}},save:async(kind,payload)=>{calls.push({kind,payload});if(payload.revision!==3)throw Object.assign(Error('Showcase changed; refresh before saving.'),{statusCode:409,code:'SHOWCASE_CONFLICT'});return{kind,revision:4,items:payload.items}}};
 const {base}=await serve(t,{},showcase),headers={'X-Admin-Token':'admin','Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/admin/showcase/portrait')).status,401);
 const board=await fetch(base+'/api/admin/showcase/portrait',{headers});assert.equal(board.status,200);assert.equal((await board.json()).revision,3);
 assert.equal((await fetch(base+'/api/admin/showcase/card',{headers})).status,404);
 const list=await fetch(base+'/api/admin/showcase/logo/candidates?q=Capital&page=2&pageSize=10',{headers});assert.equal(list.status,200);assert.equal(calls[0].options.q,'Capital');assert.equal(calls[0].options.page,'2');
 const saved=await fetch(base+'/api/admin/showcase/portrait',{method:'PUT',headers,body:JSON.stringify({revision:3,items:[]})});assert.equal(saved.status,200);assert.equal((await saved.json()).revision,4);
 const stale=await fetch(base+'/api/admin/showcase/portrait',{method:'PUT',headers,body:JSON.stringify({revision:2,items:[]})});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'SHOWCASE_CONFLICT');
});

test('follow-up and historic private preview forward complete data without exposing files',async t=>{
 const received=[];const {base}=await serve(t,{setOwner:async(ref,input)=>{received.push({ref,input});return{owner:input.owner,followUpNote:input.note}},preview:async(ref,kind,options)=>{received.push({ref,kind,options});return{buffer:Buffer.from('safe'),mimeType:'image/webp'}}});
 const headers={'X-Admin-Token':'admin','Content-Type':'application/json'};
 const update=await fetch(base+'/api/admin/materials/REF/owner',{method:'PUT',headers,body:JSON.stringify({owner:'负责人',note:'等待回复',rowVersion:4})});assert.equal(update.status,200);assert.deepEqual(received[0].input,{owner:'负责人',note:'等待回复',rowVersion:4});
 const image=await fetch(base+'/api/admin/materials/REF/preview/portrait?versionId=version-id&fit=contain',{headers});assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(received[1].options.versionId,'version-id');assert.equal(received[1].options.fit,'contain');
});

test('attendee previews preserve the full original image despite website crop settings',async t=>{
 const fsp=require('node:fs/promises'),os=require('node:os'),crypto=require('node:crypto'),sharp=require('sharp');
 const {createFileStore}=require('../server/materials-file-store'),{createMaterialService}=require('../server/materials');
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'lpclub-preview-'));
 t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const files=createFileStore(root),sources={},dimensions={card:[160,100],portrait:[80,120],logo:[160,160]};
 for(const [kind,[width,height]] of Object.entries(dimensions)) {
  const stripe=await sharp({create:{width,height:8,channels:3,background:'#ff0000'}}).png().toBuffer();
  const source=await sharp({create:{width,height,channels:3,background:'#0000ff'}}).composite([{input:stripe,left:0,top:0}]).png().toBuffer();
  sources[kind]=await files.write(source,kind+'.png','image/png');
 }
 const db={async transaction(work){return work(db);},async query(sql,params){
  if(sql.startsWith('SELECT * FROM registrations'))return[{id:'registration',ref:'REF',option_id:'speaking'}];
  if(sql.startsWith('SELECT digest FROM supplement_tokens'))return[{digest:crypto.createHash('sha256').update('valid').digest('hex')}];
  if(sql.startsWith('SELECT f.storage_key')){const kind=params.at(-1);return[{storage_key:sources[kind].key,config_json:{draft:{crop:{[kind]:{x:.5,y:.5,zoom:2}}}}}];}
  throw Error('Unexpected query');
 }};
 const service=createMaterialService({db,env:{MATERIALS_ENABLED:'true',PUBLIC_BASE_URL:'https://conference.example/',MATERIALS_SIGNING_KEY:'test-key-which-is-at-least-32-bytes-long',MATERIALS_STORAGE_DIR:root}});
 const {base}=await serve(t,service),headers={Authorization:'Bearer valid','X-Registration-Ref':'REF'};
 assert.equal((await fetch(base+'/api/materials/preview/logo')).status,401);
 for(const [kind,[width,height]] of Object.entries(dimensions)) {
  const response=await fetch(base+'/api/materials/preview/'+kind,{headers});assert.equal(response.status,200);
  const {data,info}=await sharp(Buffer.from(await response.arrayBuffer())).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,width);assert.equal(info.height,height,'The complete source keeps its original aspect');
  assert(data[0]>200&&data[2]<40,'The top edge of the original remains visible');
  const last=(height-1)*width*info.channels;assert(data[last+2]>200&&data[last]<40,'The bottom edge remains visible');
 }
});
