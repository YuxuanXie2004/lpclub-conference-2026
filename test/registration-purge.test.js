'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRegistrationService}=require('../server/registration-service');
function fixture(row){
 const queries=[];const tx={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT * FROM registrations'))return row?[row]:[];if(sql.startsWith('SELECT id FROM material_items'))return [{id:'item'}];if(sql.startsWith('SELECT * FROM material_items'))return [{id:'item',kind:'portrait'}];return [];}};
 return {queries,service:createRegistrationService({db:{transaction:work=>work(tx)}})};
}
const deleted={id:'registration',ref:'REF',event_key:'conference-2026',deleted_at:'2026-10-22',row_version:2};
test('permanent deletion removes a recycled registration and its dependent records in one transaction',async()=>{
 const {service,queries}=fixture(deleted);
 assert.deepEqual(await service.lifecycle('purge',{ref:'REF',rowVersion:2}),{ref:'REF',permanentlyDeleted:true});
 for(const table of ['registrations','material_versions','material_items','showcase_entries','publication_consents','supplement_tokens','material_upload_requests','mail_jobs','integration_jobs','integration_events','feishu_sync_state','vip_redemptions'])assert.ok(queries.some(q=>q.sql.startsWith('DELETE FROM '+table+' ')),table);
 assert.ok(queries.some(q=>q.sql.startsWith('UPDATE submission_requests SET registration_id=NULL')&&q.sql.includes('result_json')));
 assert.ok(queries.some(q=>q.sql.startsWith('UPDATE audit_events SET registration_id=NULL')));
 assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO audit_events')&&q.args[0]===null&&q.args[1]==='purge'));
 assert.equal(queries.some(q=>/UPDATE vip_codes/.test(q.sql)),false,'used VIP codes must stay consumed');
 assert.equal(queries.at(-1).sql,'DELETE FROM registrations WHERE id=?');
});
for(const [name,row,body,code] of [
 ['active record',{...deleted,deleted_at:null},{rowVersion:2},'REGISTRATION_NOT_FOUND'],
 ['missing record',null,{rowVersion:2},'REGISTRATION_NOT_FOUND'],
 ['stale version',deleted,{rowVersion:1},'VERSION_CONFLICT'],
 ['missing version',deleted,{},'VERSION_REQUIRED']
])test('permanent deletion rejects '+name+' without changing data',async()=>{
 const {service,queries}=fixture(row);await assert.rejects(service.lifecycle('purge',{ref:'REF',...body}),e=>e.code===code);assert.equal(queries.some(q=>/^(DELETE|UPDATE|INSERT)/.test(q.sql)),false);
});
