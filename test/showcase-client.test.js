'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = require('node:path').join(__dirname, '../assets/showcase-admin.js');
function client() { assert.ok(fs.existsSync(file), 'showcase client exists'); return require(file); }
const card = id => ({ entryId: id, versionId: 'version-'+id, ref:id, materialRevision: 3, name:id, title:'Partner', company:'Fund', crop:{x:.5,y:.5}, eligible:true });
test('manual uploads without registration references can coexist in the same draft',()=>{
 const m=client(),state=m.createDrafts();m.acceptBoard(state,'portrait',{revision:1,items:[]});
 for(const id of ['manual-a','manual-b'])assert.equal(m.addCard(state,'portrait',{...card(id),ref:'',source:'manual'}),true);
 assert.equal(m.addCard(state,'portrait',{...card('manual-a'),ref:'',source:'manual'}),false);
 assert.equal(m.payload(state,'portrait').items.length,2);assert.equal(state.portrait.dirty,true);assert.equal(state.logo.dirty,false);
 m.discard(state,'portrait');assert.equal(state.portrait.items.length,0);
});
test('manual preview URLs are scoped to authenticated showcase image endpoints',()=>{
 const m=client(),id='11111111-1111-4111-8111-111111111111';
 const url='/event/api/admin/showcase/portrait/uploads/'+id+'/preview';assert.equal(m.safePreviewUrl(url,'/event/'),url);
 for(const raw of [url+'?token=secret',url+'#hidden',url.replace('/portrait/','/card/'),url.replace(id,'../secret'),url.replace('/event/','/other/')])assert.throws(()=>m.safePreviewUrl(raw,'/event/'));
});
test('upload control adds a manual file to the draft without saving the website and failures preserve edits',async()=>{
 const m=client(),nodes=new Map(),messages=[],requests=[],file=new Blob(['image'],{type:'image/png'});let failUpload=false;
 const element={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{},innerHTML:'',files:[file]});return nodes.get(selector);},querySelectorAll(){return[];}};
 const app=m.init({element,document:{},window:{location:{pathname:'/table'},URL:{},FormData,addEventListener(){}},message:(...args)=>messages.push(args),request:async(path,options)=>{requests.push({path,options});if(path.endsWith('/uploads')){if(failUpload)throw Error('Upload failed');return{json:async()=>({item:{...card('manual'),ref:'',source:'manual'}})};}return{json:async()=>({rows:[],items:[],total:0})};}});
 m.acceptBoard(app.state,'portrait',{revision:1,items:[card('original')]});m.editCard(app.state,'portrait','original',{name:'Keep my edit'});
 assert.match(element.innerHTML,/data-upload/);assert.match(element.innerHTML,/accept="image\/jpeg,image\/png,image\/webp"/);
 assert.equal(typeof nodes.get('[data-upload-file]').onchange,'function');await nodes.get('[data-upload-file]').onchange();
 assert.deepEqual(app.state.portrait.items.map(x=>x.entryId),['original','manual']);assert.equal(app.state.portrait.items[0].name,'Keep my edit');assert.equal(app.state.portrait.dirty,true);
 assert.equal(requests[0].path,'/api/admin/showcase/portrait/uploads');assert.equal(requests[0].options.body.get('file').size,5);assert.equal(requests.some(x=>x.options?.method==='PUT'),false);
 failUpload=true;await nodes.get('[data-upload-file]').onchange();assert.equal(app.state.portrait.items.length,2);assert.deepEqual(messages.at(-1),['Upload failed',true]);
});
test('organisation cards render without the More disclosure and keep their editing and ordering controls',()=>{
 const m=client(),nodes=new Map(),kinds=['portrait','logo'].map(kind=>({dataset:{kind}}));
 const element={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',dataset:{},innerHTML:''});return nodes.get(selector);},querySelectorAll(selector){return selector==='[data-kind]'?kinds:[];}};
 const app=m.init({element,document:{},window:{location:{pathname:'/table'},URL:{},addEventListener(){}},message(){},request:async()=>({json:async()=>({rows:[],items:[],total:0})})});
 m.acceptBoard(app.state,'logo',{revision:1,items:[card('logo')]});kinds[1].onclick();
 assert.doesNotMatch(element.innerHTML,/<details|<summary|data-organisation|data-org-results/);
 for(const control of ['data-adjust-image','data-edit="company"','data-move','data-remove'])assert.ok(element.innerHTML.includes(control));
});
test('showcase drafts keep each category independent and ignore late loads after edits',()=>{
 const m=client(), state=m.createDrafts();m.acceptBoard(state,'portrait',{revision:1,items:[card('a')]});m.acceptBoard(state,'logo',{revision:2,items:[card('b')]});
 m.editCard(state,'portrait','a',{name:'Edited'});assert.equal(m.acceptBoard(state,'portrait',{revision:3,items:[]}),false);assert.equal(state.portrait.items[0].name,'Edited');assert.equal(state.logo.items[0].name,'b');assert.equal(m.isDirty(state),true);
});
test('board edits add, move and remove in row-major order, while discard restores saved state',()=>{
 const m=client(),s=m.createDrafts();m.acceptBoard(s,'portrait',{revision:4,items:[card('a'),card('b')]});
 m.addCard(s,'portrait',card('c'),1);m.moveCard(s,'portrait','b',0);assert.deepEqual(s.portrait.items.map(x=>x.entryId),['b','a','c']);m.removeCard(s,'portrait','a');assert.deepEqual(s.portrait.items.map(x=>x.entryId),['b','c']);m.discard(s,'portrait');assert.deepEqual(s.portrait.items.map(x=>x.entryId),['a','b']);assert.equal(m.isDirty(s),false);
});
test('saving uses only explicit card data and a conflict preserves the local draft',()=>{
 const m=client(),s=m.createDrafts();m.acceptBoard(s,'logo',{revision:8,items:[card('a')]});m.editCard(s,'logo','a',{company:'Changed',organisationRef:'REG'});const payload=m.payload(s,'logo');assert.deepEqual(Object.keys(payload).sort(),['items','revision']);assert.equal(payload.items[0].organisationRef,'REG');assert.equal(payload.items[0].ref,undefined);m.saveFailed(s,'logo',409);assert.equal(s.logo.conflict,true);assert.equal(s.logo.items[0].company,'Changed');assert.equal(s.logo.dirty,true);
});
test('ineligible additions are refused and crop position is clamped without changing source versions',()=>{
 const m=client(),s=m.createDrafts();m.acceptBoard(s,'portrait',{revision:0,items:[]});assert.equal(m.addCard(s,'portrait',{...card('a'),eligible:false}),false);m.addCard(s,'portrait',card('a'));m.editCard(s,'portrait','a',{crop:{x:-1,y:7}});assert.deepEqual(s.portrait.items[0].crop,{x:0,y:1});assert.equal(s.portrait.items[0].versionId,'version-a');
});
test('both image categories keep zoom adjustments in drafts until saved and discard restores the crop',()=>{
 const m=client(),state=m.createDrafts();
 for(const kind of ['portrait','logo']){
  m.acceptBoard(state,kind,{revision:1,items:[card('zoom')]});
  m.editCard(state,kind,'zoom',{crop:{x:.3,y:.7,zoom:2.5}});
  assert.deepEqual(m.payload(state,kind).items[0].crop,{x:.3,y:.7,zoom:2.5});
  assert.equal(state[kind].dirty,true);m.discard(state,kind);
  assert.deepEqual(state[kind].items[0].crop,{x:.5,y:.5});
 }
});
test('preview urls stay inside the deployment and cannot carry admin credentials',()=>{
 const m=client();assert.equal(m.safePreviewUrl('/event/api/admin/materials/REF/preview/portrait?versionId=abc&fit=contain','/event/'),'/event/api/admin/materials/REF/preview/portrait?versionId=abc&fit=contain');for(const u of ['https://evil.test/x','//evil.test/x','/api/admin/materials/R/preview/portrait?token=secret','/event/../api/admin/materials/R/preview/logo'])assert.throws(()=>m.safePreviewUrl(u,'/event/'));
});

test('adopting reviewed text and replacing the approved image are separate explicit draft changes',()=>{
 const m=client(),s=m.createDrafts();m.acceptBoard(s,'portrait',{revision:2,items:[{...card('a'),draftText:{name:'Reviewed',title:'Director',company:'New Fund'},hasTextChanges:true,hasNewVersion:true}]});
 assert.equal(typeof m.adoptText,'function');assert.equal(typeof m.replaceVersion,'function');
 m.adoptText(s,'portrait','a');assert.equal(s.portrait.items[0].name,'Reviewed');assert.equal(s.portrait.items[0].versionId,'version-a');assert.equal(s.portrait.items[0].hasNewVersion,true);
 m.replaceVersion(s,'portrait','a',{...card('a'),versionId:'new-approved',materialRevision:5,name:'Unwanted name'});assert.equal(s.portrait.items[0].versionId,'new-approved');assert.equal(s.portrait.items[0].name,'Reviewed');assert.equal(s.portrait.dirty,true);
});

test('private previews reject encoded traversal and fragment URLs',()=>{
 const m=client();for(const path of ['/event/api/admin/materials/%2e%2e/REF/preview/logo?fit=contain','/event/api/admin/materials/REF/preview/logo?fit=contain#hidden'])assert.throws(()=>m.safePreviewUrl(path,'/event/'));
});

const previewPath = id => '/event/api/admin/materials/'+id+'/preview/portrait?versionId='+id+'&fit=contain';
function previewCache(options={}) {
 const m=client();assert.equal(typeof m.createPreviewCache,'function');const requests=[],revoked=[],created=[];
 const cache=m.createPreviewCache({prefix:'/event/',token:'private-admin-token',maxEntries:2,fetch:async(path,init)=>{requests.push({path,init});return {ok:true,blob:async()=>({path})};},createObjectURL:blob=>{const url='blob:preview-'+created.length;created.push({blob,url});return url;},revokeObjectURL:url=>revoked.push(url),...options});
 return {cache,requests,revoked,created};
}
test('private preview cache reuses verified image URLs when cards reorder',async()=>{
 const {cache,requests,created}=previewCache();const a=previewPath('a'),b=previewPath('b');cache.setActive([a,b]);const urls=await Promise.all([cache.get(a),cache.get(b)]);cache.setActive([b,a]);assert.equal(cache.peek(a),urls[0]);assert.equal(await cache.get(b),urls[1]);assert.equal(requests.length,2);assert.equal(created.length,2);assert.equal(requests[0].init.headers['X-Admin-Token'],'private-admin-token');assert.ok(!requests[0].path.includes('private-admin-token'));
});
test('concurrent requests for the same private preview share one download and object URL',async()=>{
 let finish;const response=new Promise(resolve=>finish=resolve);let fetches=0;const {cache,created}=previewCache({fetch:()=>{fetches++;return response;}});const a=previewPath('a'),first=cache.get(a),second=cache.get(a);assert.equal(fetches,1);finish({ok:true,blob:async()=>({})});assert.equal(await first,await second);assert.equal(created.length,1);
});
test('cache evicts inactive least-recently-used previews and keeps visible images until release',async()=>{
 const {cache,revoked}=previewCache();const a=previewPath('a'),b=previewPath('b'),c=previewPath('c');cache.setActive([a]);const ua=await cache.get(a),ub=await cache.get(b);await cache.get(c);assert.deepEqual(revoked,[ub]);assert.equal(cache.peek(a),ua);assert.equal(cache.peek(b),null);cache.clear();assert.equal(revoked.length,3);assert.equal(new Set(revoked).size,3);assert.equal(cache.peek(a),null);cache.clear();assert.equal(revoked.length,3);
});
test('clearing an in-flight preview cannot create a leaked URL and later loads can retry',async()=>{
 let finish,fetches=0;const response=new Promise(resolve=>finish=resolve);const {cache,created}=previewCache({fetch:()=>{fetches++;return fetches===1?response:Promise.resolve({ok:true,blob:async()=>({})});}});const a=previewPath('a'),pending=cache.get(a);cache.clear();finish({ok:true,blob:async()=>({})});await assert.rejects(pending);assert.equal(created.length,0);await cache.get(a);assert.equal(created.length,1);
});
test('failed or invalid private previews are never cached and can be retried safely',async()=>{
 let calls=0;const {cache}=previewCache({fetch:async()=>({ok:++calls>1,blob:async()=>({})})});await assert.rejects(cache.get(previewPath('a')));assert.equal(cache.peek(previewPath('a')),null);await cache.get(previewPath('a'));assert.equal(calls,2);assert.throws(()=>cache.get('https://other.test/image'));assert.equal(calls,2);
});
