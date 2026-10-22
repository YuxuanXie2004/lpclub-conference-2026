'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {mysqlFixture}=require('./helpers/mysql');
const {createBackend}=require('../server/index');
test('HTTP MySQL workflow preserves subpath, authorization, idempotency and private media', {skip:process.env.RUN_MYSQL_TESTS!=='1'},async t=>{
 const {db,env}=await mysqlFixture(t),dir=await fs.mkdtemp(path.join(os.tmpdir(),'lpclub-mysql-http-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 Object.assign(env,{ADMIN_USERNAME:'admin',ADMIN_PASSWORD_HASH:require('../server/admin-auth').hashPassword('admin-test-password'),ADMIN_JWT_SECRET:'j'.repeat(48),PUBLIC_BASE_URL:'http://localhost:8787/2026-pe-conference/',MATERIALS_ENABLED:'true',MATERIALS_SIGNING_KEY:'x'.repeat(40),MAIL_PAYLOAD_KEY:crypto.randomBytes(32).toString('base64'),VIP_CODE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),MATERIALS_STORAGE_DIR:path.join(dir,'originals'),MATERIALS_CACHE_DIR:path.join(dir,'cache'),SMTP_PASS:'fake-test-only',RATE_LIMIT_MAX:'100'});
 const messages=[],backend=createBackend({env,db,sendMail:async payload=>{messages.push(payload);return{sent:true,id:'mock-id'}}});
 await new Promise(resolve=>backend.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{backend.outbox.stop();backend.server.close(resolve);backend.server.closeAllConnections()}));
 const base='http://127.0.0.1:'+backend.server.address().port+'/2026-pe-conference';const origin=new URL(base).origin;const login=await fetch(base+'/api/admin/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin-test-password'})});assert.equal(login.status,200,await login.clone().text());const authData=await login.json();const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],Origin:origin,'X-CSRF-Token':authData.csrfToken};
 const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 const payload={packageId:'gp_speaking',expectedPrice:4000,idempotencyKey:crypto.randomUUID(),materials:{portraitConsent:true,logoConsent:true,language:'zh'},attendee:{fullName:'Test',company:'Capital',jobTitle:'Partner',country:'China',companyType:'General Partner (GP)',email:'guest@example.com',phone:'13800138000',visaLetter:'No',consent:true}};
 for(const [purpose,purposeOther,code] of [[['Fundraising'],'','INVALID_PURPOSE'],[['Other'],'  ','PURPOSE_OTHER_REQUIRED'],[['Other'],{},'INVALID_PURPOSE_OTHER']]){
  const rejected=await post('/api/order',{...payload,attendee:{...payload.attendee,purpose,purposeOther}});
  assert.equal(rejected.status,400,await rejected.clone().text());assert.equal((await rejected.json()).code,code);
 }
 assert.equal((await db.query('SELECT * FROM registrations')).length,0);
 Object.assign(payload.attendee,{focus:['半导体、新能源'],purpose:['Networking','Other'],purposeOther:'寻找产业合作伙伴'});
 const r=await post('/api/order',payload);assert.equal(r.status,200,await r.clone().text());const data=await r.json();assert.ok(data.materials.uploadToken);assert.equal(data.email.queued,true);assert.equal(messages.length,0);
 const listed=await fetch(base+'/api/registrations',{headers}).then(r=>r.json());
 assert.equal(listed.rows[0].purpose,'Networking; Other; 寻找产业合作伙伴');assert.equal(listed.rows[0].focus,'半导体、新能源');
 const exported=await fetch(base+'/export.csv',{headers}).then(r=>r.text());assert.ok(exported.includes('寻找产业合作伙伴'));
 const stale=await post('/api/order',{...payload,expectedPrice:3000,idempotencyKey:crypto.randomUUID(),attendee:{...payload.attendee,email:'stale@example.com'}});assert.equal(stale.status,409,await stale.clone().text());const staleData=await stale.json();assert.equal(staleData.code,'PRICE_CHANGED');assert.equal(staleData.currentPrice,4000);assert.equal((await db.query('SELECT * FROM registrations')).length,1);
 const replay=await post('/api/order',payload).then(r=>r.json());assert.equal(replay.ref,data.ref);assert.equal((await db.query('SELECT * FROM mail_jobs')).length,1);
 await backend.outbox.runOnce();assert.equal(messages.length,1);assert.match(messages[0].text,/\/2026-pe-conference\/materials#/);
 const link=new URL(messages[0].text.match(/http:\/\/localhost:8787\/2026-pe-conference\/materials[^\s]+/)[0]),token=new URLSearchParams(link.hash.slice(1)).get('token');
 const auth={Authorization:'Bearer '+token,'X-Registration-Ref':data.ref};
 assert.equal((await fetch(base+'/api/materials/me',{headers:{...auth,Authorization:'Bearer invalid'}})).status,401);
 const png=await require('sharp')({create:{width:20,height:20,channels:3,background:'#205f40'}}).png().toBuffer();
 for(const kind of ['card','portrait','logo']){const f=new FormData();f.set('file',new Blob([png],{type:'image/png'}),kind+'.png');const uploaded=await fetch(base+'/api/materials/upload/'+kind,{method:'POST',headers:{Authorization:'Bearer '+data.materials.uploadToken,'X-Registration-Ref':data.ref},body:f});assert.equal(uploaded.status,200,await uploaded.text());}
 assert.equal((await post('/api/admin/status',{ref:data.ref,status:'Approved',rowVersion:(await backend.registrations.detail(data.ref)).rowVersion})).status,200);
 for(const kind of ['portrait','logo']){const reviewed=await post('/api/admin/materials/'+data.ref+'/review',{kind,version:1,rowVersion:(await backend.materials.me(data.ref)).assets[kind].rowVersion,decision:'approve'});assert.equal(reviewed.status,200,await reviewed.text());}
 const unpublished=await fetch(base+'/api/public/showcase').then(r=>r.json());assert.equal(unpublished.speakers.length,0);assert.equal(unpublished.organisations.length,0);
 assert.equal((await fetch(base+'/api/admin/showcase/portrait')).status,401);
 for(const kind of ['portrait','logo']){
   const candidates=await fetch(base+'/api/admin/showcase/'+kind+'/candidates',{headers}).then(r=>r.json());assert.equal(candidates.rows.length,1);assert.equal(candidates.rows[0].eligible,true);
   const board=await fetch(base+'/api/admin/showcase/'+kind,{headers}).then(r=>r.json());assert.equal(board.items.length,0);
   const candidate=candidates.rows[0],item={entryId:candidate.entryId,versionId:candidate.versionId,materialRevision:candidate.materialRevision,name:'展示姓名',title:'展示职位',company:'展示机构',crop:{x:.5,y:.5}};
   const saved=await fetch(base+'/api/admin/showcase/'+kind,{method:'PUT',headers,body:JSON.stringify({revision:board.revision,items:[item]})});assert.equal(saved.status,200,await saved.clone().text());
 }
 const publicData=await fetch(base+'/api/public/showcase').then(r=>r.json());assert.equal(publicData.speakers.length,1);assert.equal(publicData.organisations.length,1);assert.equal(publicData.speakers[0].name,'展示姓名');assert.equal(publicData.organisations[0].name,'展示机构');assert.equal(JSON.stringify(publicData).includes('guest@example.com'),false);
 const adminState=(await fetch(base+'/api/admin/materials?ref='+data.ref,{headers}).then(r=>r.json())).rows[0];
 const followUp=await fetch(base+'/api/admin/materials/'+data.ref+'/owner',{method:'PUT',headers,body:JSON.stringify({owner:'张经理',note:'周三跟进',rowVersion:adminState.rowVersion})});assert.equal(followUp.status,200,await followUp.clone().text());const updatedOwner=await followUp.json();assert.equal(updatedOwner.followUpNote,'周三跟进');
 const draftUpdate=await fetch(base+'/api/admin/materials/'+data.ref+'/config',{method:'PUT',headers,body:JSON.stringify({name:'草稿姓名',title:'草稿职位',company:'草稿机构',rowVersion:updatedOwner.rowVersion})});assert.equal(draftUpdate.status,200,await draftUpdate.clone().text());
 const unchanged=await fetch(base+'/api/public/showcase').then(r=>r.json());assert.equal(unchanged.speakers[0].name,'展示姓名');assert.equal(unchanged.organisations[0].name,'展示机构');
 const boardAfterEdit=await fetch(base+'/api/admin/showcase/portrait',{headers}).then(r=>r.json());assert.equal(boardAfterEdit.items[0].hasTextChanges,true);assert.equal(boardAfterEdit.items[0].draftText.name,'草稿姓名');
 const imageURL=publicData.speakers[0].imageUrl;assert.ok(imageURL.startsWith('/2026-pe-conference/api/public/media/'));
 assert.equal((await fetch(new URL(imageURL,base))).status,200);
 const beforeWithdrawal=await fetch(base+'/api/admin/showcase/portrait',{headers}).then(r=>r.json());
 const withdrawal=await fetch(base+'/api/materials/consents',{method:'PUT',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({portrait:false})});assert.equal(withdrawal.status,200,await withdrawal.text());
 assert.equal((await fetch(new URL(imageURL,base))).status,404);
 const stalePublish=await fetch(base+'/api/admin/showcase/portrait',{method:'PUT',headers,body:JSON.stringify({revision:beforeWithdrawal.revision,items:beforeWithdrawal.items})});assert.equal(stalePublish.status,409);
 assert.equal((await fetch(base+'/health').then(r=>r.json())).database,'mysql');
 for(const tab of ['/table','/vip-codes','/materials-admin'])assert.equal((await fetch(base+tab,{headers})).status,200);
});
