'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {mysqlFixture}=require('./helpers/mysql');
const {createRegistrationService}=require('../server/registration-service');
const {normaliseOrder}=require('../server/order');
function input(email='a@example.com'){return {packageId:'gp_ticket',idempotencyKey:crypto.randomUUID(),attendee:{fullName:'Test',company:'Capital',companyType:'General Partner (GP)',country:'China',jobTitle:'Partner',email,phone:'13800138000',visaLetter:'No',consent:true}};}
const integration=(name,fn)=>test(name,{skip:process.env.RUN_MYSQL_TESTS!=='1'},fn);
integration('MySQL atomically registers and replays concurrent retries without extra email jobs',async t=>{
 const {db}=await mysqlFixture(t);const service=createRegistrationService({db,normaliseOrder});const a=input();
 const [first,second]=await Promise.all([service.submit(a),service.submit(a)]);assert.equal(first.ref,second.ref);
 assert.equal((await db.query('SELECT * FROM registrations')).length,1);
 await assert.rejects(service.submit({...a,attendee:{...a.attendee,fullName:'Changed'}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 const duplicate=await Promise.allSettled([service.submit(input('parallel@example.com')),service.submit(input('parallel@example.com'))]);
 assert.equal(duplicate.filter(r=>r.status==='fulfilled').length,1);assert.equal(duplicate.find(r=>r.status==='rejected').reason.code,'DUPLICATE_REGISTRATION');
});
integration('soft delete frees email, restore conflicts safely, SQL paging and full export remain accurate',async t=>{
 const {db}=await mysqlFixture(t);const service=createRegistrationService({db,normaliseOrder});const a=await service.submit(input());
 await service.lifecycle('delete',{ref:a.ref,reason:'test',rowVersion:(await service.detail(a.ref)).rowVersion});await service.submit(input());
 await assert.rejects(service.lifecycle('restore',{ref:a.ref,rowVersion:(await service.detail(a.ref)).rowVersion}),e=>e.code==='DUPLICATE_REGISTRATION');
 assert.equal((await service.list({mode:'deleted'})).total,1);
 await service.submit(input('other@example.com'));const page=await service.list({pageSize:1});assert.equal(page.rows.length,1);assert.equal(page.total,2);assert.equal(page.stats.Total,2);
 assert.equal((await service.exportRows({})).length,2);
});
integration('VIP redemption and registration roll back together when material initialization fails',async t=>{
 const {db,env}=await mysqlFixture(t);env.VIP_CODE_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 const {createMysqlVipStore}=require('../server/mysql-vip-store');const vip=createMysqlVipStore(db,env);
 const code=(await vip.generate({count:1}))[0],raw=(await vip.detail(code.id)).item.code;
 const a={...input(),vipCode:raw};const broken=createRegistrationService({db,normaliseOrder,vip,materials:{ready:()=>true,initialize:async()=>{throw Error('Initialization failed');}}});
 await assert.rejects(broken.submit(a));assert.equal((await vip.detail(code.id)).item.status,'available');assert.equal((await db.query('SELECT * FROM registrations')).length,0);
 const good=createRegistrationService({db,normaliseOrder,vip});const results=await Promise.allSettled([good.submit(a),good.submit({...input('b@example.com'),vipCode:raw})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='fulfilled').value.package.price,0);
 assert.equal((await db.query('SELECT * FROM vip_redemptions')).length,1);
});

integration('stale administrator status saves fail instead of overwriting another review',async t=>{
 const {db}=await mysqlFixture(t);const service=createRegistrationService({db,normaliseOrder});const reg=await service.submit(input());const seen=await service.detail(reg.ref);
 await service.lifecycle('status',{ref:reg.ref,status:'Approved',rowVersion:seen.rowVersion});
 await assert.rejects(service.lifecycle('status',{ref:reg.ref,status:'Rejected',rowVersion:seen.rowVersion}),e=>e.code==='VERSION_CONFLICT');
 await assert.rejects(service.lifecycle('status',{ref:reg.ref,status:'Rejected'}),e=>e.code==='VERSION_REQUIRED');
 assert.equal((await service.detail(reg.ref)).status,'Approved');
});

integration('purpose validation rejects invalid submissions and preserves other explanations through MySQL, retries and exports',async t=>{
 const {db}=await mysqlFixture(t);const service=createRegistrationService({db,normaliseOrder});
 for(const [purpose,purposeOther,code] of [[['Fundraising'],'','INVALID_PURPOSE'],[['Other'],'','PURPOSE_OTHER_REQUIRED'],[['Other','Networking'],'   ','PURPOSE_OTHER_REQUIRED'],[['Other'],42,'INVALID_PURPOSE_OTHER'],[['Other'],'目'.repeat(81),'INVALID_PURPOSE_OTHER']]){
  const request=input();Object.assign(request.attendee,{purpose,purposeOther});
  await assert.rejects(service.submit(request),e=>e.statusCode===400&&e.code===code);
 }
 assert.equal((await db.query('SELECT * FROM registrations')).length,0);
 assert.equal((await db.query('SELECT * FROM submission_requests')).length,0);
 const request=input();Object.assign(request.attendee,{focus:['半导体、新能源'],purpose:['Networking','Other'],purposeOther:'  寻找产业合作伙伴  '});
 const saved=await service.submit(request),expected='Networking; Other; 寻找产业合作伙伴';
 assert.equal((await service.detail(saved.ref)).purpose,expected);
 assert.equal((await service.detail(saved.ref)).focus,'半导体、新能源');
 assert.equal((await service.list()).rows[0].purpose,expected);
 assert.equal((await service.exportRows()).at(0).purpose,expected);
 assert.equal((await service.submit(request)).ref,saved.ref);
 await assert.rejects(service.submit({...request,attendee:{...request.attendee,purposeOther:'新的参会目的'}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 assert.equal((await db.query('SELECT * FROM registrations')).length,1);
});

integration('permanent deletion clears foreign keys atomically, keeps VIP consumed and rejects submission replay',async t=>{
 const {db,env}=await mysqlFixture(t);env.VIP_CODE_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 const vip=require('../server/mysql-vip-store').createMysqlVipStore(db,env),code=(await vip.generate({count:1}))[0],raw=(await vip.detail(code.id)).item.code;
 const integrations=require('../server/feishu-integration').createFeishuIntegration({db,env:{FEISHU_SYNC_APP_TOKEN:'test',FEISHU_SYNC_TABLE_ID:'test',FEISHU_NOTIFY_SINCE:'2020-01-01'}});
 const service=createRegistrationService({db,normaliseOrder,vip,integrations}),request={...input(),vipCode:raw},saved=await service.submit(request),id=saved.registrationId;
 await assert.rejects(service.lifecycle('purge',{ref:saved.ref,rowVersion:1}),e=>e.code==='REGISTRATION_NOT_FOUND');
 const item=crypto.randomUUID(),version=crypto.randomUUID(),file=crypto.randomUUID();
 await db.query('INSERT INTO material_files(id,storage_key,filename,mime_type,byte_size,sha256) VALUES (?,?,?,?,?,?)',[file,'a'.repeat(64),'portrait.png','image/png',10,'b'.repeat(64)]);
 await db.query("INSERT INTO material_items(id,registration_id,kind) VALUES (?,?,'portrait')",[item,id]);
 await db.query("INSERT INTO material_versions(id,item_id,version_no,file_id,status) VALUES (?,?,1,?,'approved')",[version,item,file]);
 await db.query('UPDATE material_items SET current_version_id=?,approved_version_id=? WHERE id=?',[version,version,item]);
 await db.query("INSERT INTO showcase_entries(id,item_id,event_key,kind,published_version_id,enabled) VALUES (?,?,'conference-2026','portrait',?,1)",[crypto.randomUUID(),item,version]);
 await db.query("INSERT INTO publication_consents(registration_id,kind,granted) VALUES (?,'portrait',1)",[id]);
 await db.query("INSERT INTO supplement_tokens(digest,registration_id,scope,expires_at) VALUES (?,?,'upload',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))",['c'.repeat(64),id]);
 await db.query("INSERT INTO material_upload_requests(registration_id,request_key,kind,file_hash,version_id) VALUES (?,'upload','portrait',?,?)",[id,'b'.repeat(64),version]);
 await db.query("INSERT INTO mail_jobs(id,registration_id,kind,dedupe_key) VALUES (?,?,'registration',?)",[crypto.randomUUID(),id,'mail:'+id]);
 await service.lifecycle('delete',{ref:saved.ref,rowVersion:1});
 // A failed delete must roll back dependency cleanup, including the idempotency marker.
 const failing=createRegistrationService({db:{transaction:work=>db.transaction(tx=>work({query:async(sql,args)=>{if(sql==='DELETE FROM registrations WHERE id=?')throw Error('delete interrupted');return tx.query(sql,args);}}))}});
 await assert.rejects(failing.lifecycle('purge',{ref:saved.ref,rowVersion:2}),/delete interrupted/);
 assert.equal((await db.query('SELECT * FROM material_versions WHERE id=?',[version])).length,1);
 assert.equal((await db.query('SELECT * FROM submission_requests WHERE registration_id=?',[id])).length,1);
 assert.deepEqual(await service.lifecycle('purge',{ref:saved.ref,rowVersion:2}),{ref:saved.ref,permanentlyDeleted:true});
 for(const table of ['registrations','material_items','publication_consents','supplement_tokens','mail_jobs','integration_events','integration_jobs','feishu_sync_state','material_upload_requests','vip_redemptions'])assert.equal((await db.query('SELECT * FROM '+table+' WHERE '+(table==='registrations'?'id':'registration_id')+'=?',[id])).length,0,table);
 assert.equal((await db.query('SELECT * FROM material_versions WHERE id=?',[version])).length,0);
 assert.equal((await db.query('SELECT * FROM showcase_entries WHERE item_id=?',[item])).length,0);
 assert.equal((await db.query("SELECT * FROM audit_events WHERE action='purge'"))[0].registration_id,null);
 assert.equal((await vip.detail(code.id)).item.status,'used');
 await assert.rejects(service.submit(request),e=>e.code==='REGISTRATION_UNAVAILABLE');
 await assert.rejects(service.detail(saved.ref),e=>e.code==='REGISTRATION_NOT_FOUND');
 await assert.rejects(service.lifecycle('restore',{ref:saved.ref,rowVersion:2}),e=>e.code==='REGISTRATION_NOT_FOUND');
 assert.equal((await service.list({mode:'deleted'})).total,0);
 await service.submit(input());
});
