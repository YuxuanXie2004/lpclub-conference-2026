'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {mysqlFixture,insertRegistration}=require('./helpers/mysql');
const {importLegacy,mapRecord}=require('../server/import-legacy');
const integration=(name,fn)=>test(name,{skip:process.env.RUN_MYSQL_TESTS!=='1'},fn);
const record=(n=1)=>({record_id:'rec-import-'+n,fields:{'Registration Reference / 报名编号':'LPC26-IMPORT-'+n,'Status / 状态':'Received','Submitted At / 提交时间':'2026-10-15T08:00:00Z','Business Email / 企业邮箱':'import'+n+'@company.example','Package ID / 套餐ID':'gp_ticket','Amount / 金额':0}});
const vipFixture=(env)=>{
 const key=Buffer.from(env.VIP_CODE_ENCRYPTION_KEY,'base64'),code='VIP-LEGACY-TEST-SECRET',iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);
 return {meta:[{key:'key_verifier',value:crypto.createHash('sha256').update(key).digest('hex')}],codes:[{id:crypto.randomUUID(),code_hash:crypto.createHash('sha256').update(code).digest('hex'),cipher:Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'),last4:code.slice(-4),batch_name:'legacy',status:'used',created_at:'2026-10-15T08:00:00Z',used_at:'2026-10-15T09:00:00Z',used_email:'import1@company.example',registration_ref:'LPC26-IMPORT-1'}],attempts:[],events:[]};
};
integration('legacy import atomically retains rows and consumed VIPs, creates empty material state and sends no email',async t=>{
 const {db,env}=await mysqlFixture(t);env.VIP_CODE_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');const vip=vipFixture(env);vip.attempts=[{id:'legacy-request-key-123',code_id:vip.codes[0].id,status:'used',registration_ref:'LPC26-IMPORT-1',created_at:'2026-10-15T09:00:00Z'}];vip.events=[{id:1,code_id:vip.codes[0].id,action:'used',at:'2026-10-15T09:00:00Z',detail:'LPC26-IMPORT-1'}];
 const source={records:[record()],revision:1};const result=await importLegacy({db,env,source,vip});assert.equal(result.registrations,1);assert.equal(result.vipCodes,1);
 assert.equal((await db.query('SELECT * FROM registrations'))[0].id,mapRecord(record()).id);assert.equal((await db.query('SELECT * FROM vip_codes'))[0].status,'used');assert.equal((await db.query('SELECT * FROM vip_redemptions')).length,1);assert.equal((await db.query('SELECT * FROM material_items')).length,3);assert.equal((await db.query('SELECT * FROM mail_jobs')).length,0);assert.equal((await db.query('SELECT * FROM supplement_tokens')).length,0);
 assert.equal((await importLegacy({db,env,source,vip})).alreadyImported,true);
});
integration('legacy import refuses nonempty target and invalid VIP references without partial writes',async t=>{
 const {db,env}=await mysqlFixture(t);env.VIP_CODE_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');const vip=vipFixture(env);vip.codes[0].registration_ref='LPC26-NOT-FOUND';await assert.rejects(importLegacy({db,env,source:{records:[record()]},vip}),/reference/i);assert.equal((await db.query('SELECT * FROM registrations')).length,0);
 await insertRegistration(db);await assert.rejects(importLegacy({db,env,source:{records:[record()]},vip:{codes:[],attempts:[],events:[],meta:[]}}),/nonempty/i);assert.equal((await db.query('SELECT * FROM registrations')).length,1);
});
