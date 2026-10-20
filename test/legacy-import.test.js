'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mapRecord,prepareImport}=require('../server/import-legacy');
const record=(overrides={})=>({record_id:'rec-example',fields:{'Registration Reference / 报名编号':'LPC26-TEST','Status / 状态':'Received','Submitted At / 提交时间':'2026/10/15 16:12','Business Email / 企业邮箱':'Example@Company.com','Full Name / 姓名':'名字','Package ID / 套餐ID':'gp_ticket','Amount / 金额':2000,'Investment Focus / 投资方向':'Private Equity; AI','Privacy Consent / 隐私授权':'I have read and agree / 我已阅读并同意',...overrides}});
test('legacy record preserves identity, money, arrays, timezone and raw fields',()=>{
 const row=mapRecord(record({'Custom field':'preserved'}));
 assert.equal(row.ref,'LPC26-TEST');assert.equal(row.email,'example@company.com');assert.equal(row.submitted_at,'2026-10-15 08:12:00.000');assert.equal(row.amount,2000);assert.equal(row.option_id,'ticket');assert.equal(row.privacy_consent,1);
 assert.deepEqual(JSON.parse(row.investment_focus),['Private Equity','AI']);assert.equal(JSON.parse(row.attendee_snapshot)._legacyFeishu.fields['Custom field'],'preserved');
 assert.equal(mapRecord(record()).id,row.id);
});
test('soft deleted records and missing optional package remain deleted without fabricated values',()=>{
 const row=mapRecord(record({'Is Deleted / 已删除':true,'Deleted At / 删除时间':'2026-10-15T08:17:14.453Z','Package ID / 套餐ID':null,'Amount / 金额':null}));
 assert.equal(row.is_deleted,1);assert.equal(row.deleted_at,'2026-10-15 08:17:14.453');assert.equal(row.package_id,'');assert.equal(row.amount,0);
});
test('migration rejects malformed dates, missing references, unsafe status and invalid money',()=>{
 for(const override of [{'Submitted At / 提交时间':'bad'},{'Expected Arrival Date / 预计抵达日期':'2026-02-30'},{'Registration Reference / 报名编号':''},{'Status / 状态':'Unknown'},{'Amount / 金额':'bad'}])assert.throws(()=>mapRecord(record(override)));
});
test('duplicate active email and reference abort rather than silently discarding records',()=>{
 assert.throws(()=>prepareImport([record(),record({'Registration Reference / 报名编号':'LPC26-SECOND'})]),/duplicate.*email/i);
 assert.throws(()=>prepareImport([record(),record({'Business Email / 企业邮箱':'second@company.com'})]),/duplicate.*ref/i);
 const rows=prepareImport([record(),{...record({'Is Deleted / 已删除':true,'Deleted At / 删除时间':'2026-10-15T08:17:14.453Z','Registration Reference / 报名编号':'LPC26-DELETED'}),record_id:'rec-deleted'}]);assert.equal(rows.length,2);
});
test('unmigrated attachments, tokens or material state fail safely',()=>{
 for(const override of [{'Namecard Original / 名片原件':[{file_token:'test'}]},{'Materials Token Hash / 资料令牌摘要':'existing-token'},{'Materials State / 资料状态数据':'{}'}])assert.throws(()=>mapRecord(record(override)),/material/i);
});

test('legacy VIP audit text stays visible through the current VIP detail API',async()=>{
 const crypto=require('node:crypto'),{importLegacy}=require('../server/import-legacy'),{createMysqlVipStore}=require('../server/mysql-vip-store');
 const env={VIP_CODE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},key=Buffer.from(env.VIP_CODE_ENCRYPTION_KEY,'base64'),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),code='VIP-TEST-1234',bytes=Buffer.concat([cipher.update(code),cipher.final()]);
 const c={id:'vip-id',code_hash:crypto.createHash('sha256').update(code).digest('hex'),cipher:Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64'),last4:'1234',batch_name:'old',status:'used',registration_ref:'LPC26-TEST',created_at:'2026-10-15T08:00:00Z'},audit=[];
 const query=async(sql,args=[])=>{if(sql.startsWith('SELECT meta_value'))return[{meta_value:crypto.createHash('sha256').update(key).digest('hex')}];if(sql.startsWith('SELECT detail'))return[];if(sql.includes('COUNT(*)'))return[{n:0}];if(sql.startsWith('INSERT INTO audit_events')){const cols=sql.match(/\(([^)]+)\)/)[1].split(',');audit.push(Object.fromEntries(cols.map((k,i)=>[k,args[i]])));return{};}if(sql.startsWith('INSERT'))return{};if(sql.includes('FROM vip_codes'))return[c];if(sql.includes('FROM audit_events'))return audit.filter(e=>e.vip_code_id===c.id);throw Error(sql);};
 const db={query,transaction:work=>work({query})};await importLegacy({db,env,source:{records:[record()]},vip:{codes:[c],meta:[{key:'key_verifier',value:crypto.createHash('sha256').update(key).digest('hex')}],attempts:[],events:[{id:1,code_id:c.id,action:'used',at:'2026-10-15T09:00:00Z',detail:'original event text'}]}});
 const detail=await createMysqlVipStore(db,env).detail(c.id);assert.ok(detail.events.some(e=>e.detail==='original event text'));
});

test('isolated existing audit or original-file data prevents legacy import',async()=>{
 const {importLegacy}=require('../server/import-legacy'),crypto=require('node:crypto');
 for(const existing of ['audit_events','material_files','vip_meta']){
  const query=async sql=>{if(sql.startsWith('SELECT detail'))return[];if(sql.includes('COUNT(*)'))return[{n:sql.endsWith('FROM '+existing)?1:0}];throw Error('unexpected write '+sql);};
  await assert.rejects(importLegacy({db:{transaction:work=>work({query})},env:{VIP_CODE_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},source:{records:[record()]},vip:{codes:[],events:[],attempts:[],meta:[]}}),/nonempty/);
 }
});
