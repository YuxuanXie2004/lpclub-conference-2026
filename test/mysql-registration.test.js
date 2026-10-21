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
