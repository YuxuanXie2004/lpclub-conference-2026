'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildCard, mapFields, contentHash, SYNC_FIELDS} = require('../server/feishu-projection');
const {createFeishuClient} = require('../server/feishu-client');
const {createFeishuIntegration} = require('../server/feishu-integration');
const env = {FEISHU_NOTIFY_SINCE:'2020-01-01T00:00:00Z',FEISHU_NOTIFY_ENABLED:'true', FEISHU_SYNC_ENABLED:'true', FEISHU_BOT_WEBHOOK:'https://open.feishu.cn/open-apis/bot/v2/hook/test',FEISHU_APP_ID:'app',FEISHU_APP_SECRET:'secret',FEISHU_SYNC_APP_TOKEN:'base',FEISHU_SYNC_TABLE_ID:'tbl',PUBLIC_BASE_URL:'https://example.com/conference/'};
const row = {id:'id-1',ref:'REF',full_name:'<at id=all> *Joe*',company:'Capital',email:'private@example.com',mobile:'123456789',sync_version:3,amount:2000,currency:'USD',option_id:'ticket',submitted_at:'2026-10-21 00:00:00.000'};
test('managed views omit values for empty and nonempty filter conditions',async()=>{
 const patches=[];
 const client=createFeishuClient({env,fetch:async(url,options)=>{
  let data={};
  if(url.includes('/auth/'))return {ok:true,json:async()=>({code:0,tenant_access_token:'t'})};
  if(url.includes('/fields'))data={items:['已删除','同步重复','数据库ID'].map((field_name,i)=>({field_name,field_id:'fld'+i}))};
  else if(options.method==='PATCH'){
   const body=JSON.parse(options.body);patches.push(body);
   for(const condition of body.property.filter_info.conditions)if(['isEmpty','isNotEmpty'].includes(condition.operator))assert.ok(!condition.value,'empty operators require an empty value');
  }else data={items:[{view_name:'报名信息（同步）',view_id:'active'},{view_name:'回收站（同步）',view_id:'deleted'}]};
  return {ok:true,json:async()=>({code:0,data})};
 }});
 await client.ensureViews();assert.equal(patches.length,2);
});
test('cards use Feishu interactive syntax and never contain credentials or contact details',()=>{
 const payload=buildCard({id:'evt',kind:'material_uploaded',occurredAt:'2026-10-21T00:00:00Z',snapshot:{...row,kind:'logo',version:2}},env);
 assert.equal(payload.msg_type,'interactive');const json=JSON.stringify(payload);
 assert.match(json,/Logo/);assert.match(json,/evt/);assert.doesNotMatch(json,/private@example|123456789|<at|secret/);assert.match(json,/conference\/table/);assert.doesNotMatch(json,/token=/);
});
test('projection preserves zeros, clears missing dates and contains no private upload URLs',()=>{
 const fields=mapFields({...row,amount:0,deleted_at:null},[{kind:'logo',version_no:2,current_version_id:'v',status:'rejected',uploaded_at:'2026-10-21 00:00:00.000'}],[{kind:'logo',granted:0}],env);
 assert.equal(fields['金额'],0);assert.equal(fields['Logo版本'],2);assert.equal(fields['Logo状态'],'rejected');assert.equal(fields['删除时间'],null);assert.equal(fields['头像状态'],'not_applicable');assert.equal(fields['Logo展示授权'],false);
 assert.equal(new Set(SYNC_FIELDS.map(f=>f.name)).size,SYNC_FIELDS.length);assert.doesNotMatch(JSON.stringify(fields),/storage_key|token=/);
});
test('notification buttons carry the configured admin token while table links remain unchanged',()=>{
 const configuredEnv={...env,ADMIN_TOKEN:'test-token&plus+ 中文'};
 for(const kind of ['registration_created','material_uploaded']){
  const payload=buildCard({id:'evt',kind,occurredAt:'2026-10-21T00:00:00Z',snapshot:{...row,kind:'logo',version:2}},configuredEnv);
  const url=new URL(payload.card.elements[1].actions[0].url);
  assert.equal(url.searchParams.get('token'),configuredEnv.ADMIN_TOKEN);
  assert.equal(url.searchParams.get('ref'),row.ref);
  assert.equal(url.searchParams.get('tab'),'materials');
 }
 assert.equal(new URL(mapFields(row,[],[],configuredEnv)['后台入口'].link).searchParams.has('token'),false);
});
test('content comparison ignores metadata but detects real field tampering',()=>{
 assert.equal(contentHash({姓名:'A',同步版本:1,最近成功同步时间:1}),contentHash({最近成功同步时间:2,同步版本:2,姓名:'A'}));
 assert.notEqual(contentHash({姓名:'A'}),contentHash({姓名:'B'}));
});
test('webhook validates business errors even with HTTP 200 and adds Feishu signatures',async()=>{
 let body;const client=createFeishuClient({env:{...env,FEISHU_BOT_SECRET:'signing'},fetch:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({code:19021})}}});
 await assert.rejects(client.notify({msg_type:'interactive',card:{}}),e=>e.blocked&&e.code==='FEISHU_19021');assert.ok(body.sign);assert.match(body.timestamp,/^\d+$/);
});
test('API retries once after an expired tenant token without duplicating successful calls',async()=>{
 let tokens=0,calls=0;const client=createFeishuClient({env,fetch:async url=>({ok:true,json:async()=>url.includes('/auth/')?{code:0,tenant_access_token:'t'+(++tokens),expire:7200}:++calls===1?{code:99991663}:{code:0,data:{items:[]}}})});
 await client.api('/bitable/test');assert.equal(tokens,2);assert.equal(calls,2);
});
test('ambiguous record creation checks remote database ID before another create',async()=>{
 let creates=0;const records=[];const client=createFeishuClient({env,fetch:async(url,options)=>{
  if(url.includes('/auth/'))return {ok:true,json:async()=>({code:0,tenant_access_token:'t'})};
  if(url.includes('/search'))return {ok:true,json:async()=>({code:0,data:{items:records}})};
  if(options.method==='POST'){creates++;records.push({record_id:'rec1',fields:{'数据库ID':'id-1'}});throw Error('timeout');}
  return {ok:true,json:async()=>({code:0,data:{record:{record_id:'rec1'}}})};
 }});
 await assert.rejects(client.upsert(null,{'数据库ID':'id-1'},'event-id'));const result=await client.upsert(null,{'数据库ID':'id-1'},'event-id');assert.equal(result.record_id,'rec1');assert.equal(creates,1);
});
test('capture writes sync and notification tasks through the supplied transaction only',async()=>{
 const writes=[];const integration=createFeishuIntegration({db:{query(){throw Error('outside transaction')}},env});
 await integration.capture({query:async(sql,args)=>{writes.push({sql,args});return sql.startsWith('SELECT')?[{...row,sync_version:4}]:{};}},row.id,'registration_created');
 assert.ok(writes.some(w=>w.sql.includes('INSERT INTO integration_events')));assert.ok(writes.some(w=>w.sql.includes('INSERT INTO integration_jobs')));assert.ok(writes.some(w=>w.sql.includes('feishu_sync_state')));
});
test('historical backfill and changes without notification never enqueue a notification',async()=>{
 const writes=[];const integration=createFeishuIntegration({db:{},env});
 await integration.capture({query:async(sql,args)=>{writes.push(sql);return sql.startsWith('SELECT')?[row]:{};}},row.id,'changed');
 assert.equal(writes.some(sql=>sql.includes('INSERT INTO integration_jobs')),false);
});
test('registration enqueues integration in the same transaction exactly once on replay',async()=>{
 const {createRegistrationService}=require('../server/registration-service');const {normaliseOrder}=require('../server/order');
 let saved,requestHash,captures=0,active=false;const db={transaction:async work=>{active=true;try{return await work({query:async(sql,args)=>{
  if(sql.startsWith('INSERT INTO submission_requests'))requestHash=args[1];
  if(sql.startsWith('SELECT * FROM submission_requests'))return [{request_hash:requestHash,registration_id:saved?.registrationId,result_json:saved}];
  if(sql.startsWith('SELECT is_deleted'))return [{is_deleted:0}];return {};
 }});}finally{active=false;}}};
 const service=createRegistrationService({db,normaliseOrder,integrations:{capture:async()=>{assert.equal(active,true);captures++;}}});
 const input={idempotencyKey:'a'.repeat(20),packageId:'gp_ticket',attendee:{fullName:'Name',company:'Capital',jobTitle:'Partner',country:'China',email:'a@example.com',phone:'13800138000',visaLetter:'No',consent:true}};
 saved=await service.submit(input);await service.submit(input);assert.equal(captures,1);
});
test('paused channels still capture events for later delivery after the notification cutover',async()=>{
 let jobs=0;const integration=createFeishuIntegration({db:{},env:{...env,FEISHU_NOTIFY_ENABLED:'false'}});
 await integration.capture({query:async(sql)=>{if(sql.startsWith('INSERT INTO integration_jobs'))jobs++;return sql.startsWith('SELECT')?[row]:{};}},row.id,'material_uploaded',{kind:'card',version:1});assert.equal(jobs,1);
});
function workerFixture({notifyError,syncError,mutateDuringSync=false}={}) {
 const state={jobs:[{id:'job',event_id:'event',registration_id:row.id,kind:'registration_created',snapshot:JSON.stringify(row),occurred_at:'2026-10-21 00:00:00',status:'pending',attempts:0}],sync:{registration_id:row.id,target_key:'target',desired_version:3,synced_version:0,status:'pending',attempts:0},rate:{lastAttempt:0},control:{lastSweep:Date.now(),lastReconcile:Date.now()},notifications:0,updates:0};
 const query=async(sql,args=[])=>{
  if(sql.startsWith('SELECT j.*'))return state.jobs.filter(j=>j.status==='pending');
  if(sql.startsWith('SELECT * FROM feishu_sync_state'))return state.sync.status==='pending'?[{...state.sync}]:[];
  if(sql.includes("SELECT value_json FROM integration_control WHERE control_key='feishu:bot-rate'"))return [{value_json:state.rate}];
  if(sql.startsWith('SELECT value_json FROM integration_control'))return [{value_json:state.control}];
  if(sql.startsWith('SELECT * FROM registrations'))return [{...row}];
  if(sql.startsWith('SELECT m.kind')||sql.startsWith('SELECT kind,granted'))return [];
  if(sql.startsWith("UPDATE integration_control SET value_json=JSON_OBJECT('lastAttempt'"))state.rate.lastAttempt=args[0];
  if(sql.startsWith("UPDATE integration_jobs SET status='processing',attempts")){state.jobs[0].status='processing';state.jobs[0].attempts++;}
  if(sql.startsWith("UPDATE integration_jobs SET status='sent'"))state.jobs[0].status='sent';
  if(sql.startsWith('UPDATE integration_jobs SET status=?')){state.jobs[0].status=args[0];state.jobs[0].error=args[1];}
  if(sql.startsWith("UPDATE feishu_sync_state SET status='processing',attempts")){state.sync.status='processing';state.sync.attempts++;}
  if(sql.startsWith('UPDATE feishu_sync_state SET status=?')){state.sync.status=args[0];state.sync.error=args[1];}
  if(sql.startsWith('UPDATE feishu_sync_state SET record_id=?,synced_version=')){state.sync.synced_version=args[1];state.sync.status=state.sync.desired_version>args[2]?'pending':'synced';}
  return {};
 };
 const client={notify:async()=>{state.notifications++;if(notifyError)throw notifyError;},upsert:async()=>{state.updates++;if(mutateDuringSync)state.sync.desired_version=4;if(syncError)throw syncError;return {record_id:'rec'};}};
 const service=createFeishuIntegration({db:{query,transaction:fn=>fn({query}),withNamedLock:async(name,fn)=>fn(async()=>{})},env,client});
 return {state,service};
}
test('a blocked webhook does not prevent table sync and persists the failure code',async()=>{
 const {state,service}=workerFixture({notifyError:Object.assign(Error('private URL'),{blocked:true,code:'FEISHU_19021'})});
 await service.runOnce();assert.equal(state.jobs[0].status,'blocked');assert.equal(state.jobs[0].error,'FEISHU_19021');assert.equal(state.sync.status,'synced');assert.equal(state.updates,1);
});
test('a transient sync failure retries without resending a successful notification',async()=>{
 const {state,service}=workerFixture({syncError:Error('timeout with private payload')});await service.runOnce();await service.runOnce();
 assert.equal(state.notifications,1);assert.equal(state.sync.status,'pending');assert.equal(state.sync.error,'FEISHU_OPERATION_FAILED');
});
test('a newer version written while synchronizing remains pending',async()=>{
 const {state,service}=workerFixture({mutateDuringSync:true});await service.runOnce();assert.equal(state.sync.synced_version,3);assert.equal(state.sync.desired_version,4);assert.equal(state.sync.status,'pending');
});
test('eighth failed notification is retained for manual retry',async()=>{
 const {state,service}=workerFixture({notifyError:Error('timeout')});state.jobs[0].attempts=7;await service.runOnce();assert.equal(state.jobs[0].status,'failed');assert.equal(state.jobs[0].attempts,8);
});
test('a second process that cannot acquire the worker lock makes no external calls',async()=>{
 let called=0;const service=createFeishuIntegration({db:{withNamedLock:async()=>false},env,client:{notify:async()=>{called++;}}});assert.equal(await service.runOnce(),false);assert.equal(called,0);
});
test('schema preflight refuses existing incompatible columns before any writes',async()=>{
 let writes=0;const client=createFeishuClient({env,fetch:async(url,options)=>{if(options.method==='POST'&&!url.includes('/auth/'))writes++;return {ok:true,json:async()=>url.includes('/auth/')?{code:0,tenant_access_token:'t'}:{code:0,data:{items:[{field_name:'金额',type:1}]}}};}});
 const preview=await client.schema();assert.equal(preview.incompatible.length,1);await assert.rejects(client.schema(true),e=>e.code==='FEISHU_FIELD_TYPE_MISMATCH');assert.equal(writes,0);
});
test('old events before the notification cutover do not enqueue messages',async()=>{
 let jobs=0;const service=createFeishuIntegration({db:{},env:{...env,FEISHU_NOTIFY_SINCE:'2099-01-01T00:00:00Z'}});
 await service.capture({query:async sql=>{if(sql.startsWith('INSERT INTO integration_jobs'))jobs++;return sql.startsWith('SELECT')?[row]:{};}},row.id,'registration_created');assert.equal(jobs,0);
});
test('document-level permission errors block automatic retries until access is fixed',async()=>{
 const client=createFeishuClient({env,fetch:async url=>({ok:true,json:async()=>url.includes('/auth/')?{code:0,tenant_access_token:'t'}:{code:91403}})});
 await assert.rejects(client.schema(),e=>e.blocked&&e.code==='FEISHU_91403');
});
test('material request replay returns the current view without a second file version or notification',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lpclub-upload-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const data={item:{id:'item',kind:'card',version_no:0,row_version:1},requests:new Map(),captures:0,files:0};
 const query=async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM registrations'))return [{...row,event_key:'conference-2026',status:'Received'}];
  if(sql.startsWith('SELECT * FROM material_upload_requests'))return data.requests.has(args[1])?[data.requests.get(args[1])]:[];
  if(sql.startsWith('SELECT * FROM material_items'))return [{...data.item}];
  if(sql.startsWith('SELECT m.*,v.status'))return [{...data.item,status:'pending'}];
  if(sql.startsWith('INSERT INTO material_files'))data.files++;
  if(sql.startsWith('UPDATE material_items SET current_version_id'))Object.assign(data.item,{current_version_id:args[0],version_no:args[1]});
  if(sql.startsWith('INSERT INTO material_upload_requests'))data.requests.set(args[1],{kind:args[2],file_hash:args[3]});
  return [];
 };
 const service=require('../server/materials').createMaterialService({db:{query,transaction:work=>work({query})},env:{MATERIALS_ENABLED:'true',PUBLIC_BASE_URL:env.PUBLIC_BASE_URL,MATERIALS_SIGNING_KEY:'a'.repeat(32),MATERIALS_STORAGE_DIR:dir},integrations:{capture:async()=>{data.captures++;}}});
 const buffer=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).png().toBuffer();
 const input={buffer,filename:'card.png',mimeType:'image/png',idempotencyKey:'upload-request-123456'};
 await service.upload(row.ref,'card',input);await service.upload(row.ref,'card',input);
 assert.equal(data.item.version_no,1);assert.equal(data.files,1);assert.equal(data.captures,1);
 await assert.rejects(service.upload(row.ref,'logo',input),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
