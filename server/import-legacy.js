'use strict';
// One-time, offline import. Source exports stay outside the application and Git.
const crypto=require('node:crypto');
const {PACKAGES,validDate}=require('./order');
const {STATUSES}=require('./registration-service');
const EVENT='conference-2026';
function idFor(value){const hex=crypto.createHash('sha256').update('feishu:'+value).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
function dateTime(value,{required=false}={}){
 if(value==null||value===''){if(required)throw Error('Missing legacy datetime');return null;}
 let text=String(value).trim().replace(/\//g,'-');
 if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(text))text=text.replace(' ','T')+'+08:00';
 else if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text))throw Error('Invalid legacy datetime');
 const date=new Date(text);if(!Number.isFinite(date.getTime())||!validDate(text.slice(0,10)))throw Error('Invalid legacy datetime');return date.toISOString().slice(0,23).replace('T',' ');
}
const string=v=>v==null?'':String(v);
const flag=v=>v===true||/^(true|1|yes|i have read and agree)(?:\s*\/.*)?$/i.test(string(v).trim());
const yesNo=v=>/^(yes|是)(?:\s*\/.*)?$/i.test(string(v).trim())?'Yes':/^(no|否)(?:\s*\/.*)?$/i.test(string(v).trim())?'No':string(v);
const array=v=>Array.isArray(v)?v.map(string):string(v).split(/;\s*/).map(v=>v.trim()).filter(Boolean);
function mapRecord(record){
 const f=record.fields;if(!f||!record.record_id)throw Error('Missing source record fields or ID');
 const get=label=>f[label];const submitted=dateTime(get('Submitted At / 提交时间'),{required:true});
 const ref=string(get('Registration Reference / 报名编号')).trim(),email=string(get('Business Email / 企业邮箱')).trim().toLowerCase(),status=string(get('Status / 状态'))||'Received';
 if(!ref||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Missing or invalid legacy reference/email');
 if(!STATUSES.includes(status))throw Error('Invalid legacy status');
 for(const [key,value] of Object.entries(f))if(/Original \/|Publication \/|Materials Token|Materials State/.test(key)&&value!=null&&value!==''&&(!Array.isArray(value)||value.length))throw Error('Existing legacy materials require a dedicated migration');
 const amountRaw=get('Amount / 金额'),amount=amountRaw==null||amountRaw===''?0:Number(amountRaw);if(!Number.isFinite(amount)||Math.abs(amount)>9999999999.99)throw Error('Invalid legacy amount');
 const arrival=string(get('Expected Arrival Date / 预计抵达日期'));if(!validDate(arrival))throw Error('Invalid legacy arrival date');
 const packageId=string(get('Package ID / 套餐ID')),p=PACKAGES[packageId],deleted=flag(get('Is Deleted / 已删除')),deletedAt=dateTime(get('Deleted At / 删除时间'));
 const row={id:idFor(record.record_id),event_key:EVENT,ref,status,submitted_at:submitted,email,
  salutation:string(get('Salutation / 称谓')),full_name:string(get('Full Name / 姓名')),company:string(get('Company / Organization / 公司机构')),company_type:string(get('Organization Type / 机构类型')),department:string(get('Department / 部门')),job_title:string(get('Job Title / 职位')),country:string(get('Country / Region / 国家地区')),city:string(get('City / 城市')),
  mobile:string(get('Mobile Number / 手机号码')),whatsapp_same:yesNo(get('Same as WhatsApp or WeChat / 是否同号')),whatsapp_number:string(get('WhatsApp or WeChat Number / WhatsApp或微信号码')),investment_focus:JSON.stringify(array(get('Investment Focus / 投资方向'))),attendance_purpose:JSON.stringify(array(get('Purpose of Attendance / 参会目的'))),matchmaking:yesNo(get('LP & GP 1-on-1 Matchmaking / 一对一洽谈')),visa_letter:yesNo(get('Visa Invitation Letter / 签证邀请函')),arrival_date:arrival||null,guests:Number(get('Accompanying Guests / 同行人数')||0),privacy_consent:flag(get('Privacy Consent / 隐私授权'))?1:0,
  package_id:packageId,option_id:p?.optionId||'',attendee_category:string(get('Attendee Category / 报名身份')),ticket_name:string(get('Ticket / 票种')),currency:string(get('Currency / 币种'))||'USD',amount,display_price:string(get('Display Price / 显示价格')),pricing_basis:string(get('Pricing Basis / 计价说明')),source:string(get('Source / 来源')),email_status:string(get('Email Status / 邮件状态'))||'Not sent',email_sent_at:dateTime(get('Email Sent At / 邮件发送时间')),status_updated_at:dateTime(get('Status Updated At / 状态更新时间')),status_note:string(get('Status Note / 状态备注')),is_deleted:deleted||deletedAt?1:0,deleted_at:deletedAt||(deleted?submitted:null),deleted_by:string(get('Deleted By / 删除人')),deletion_reason:string(get('Deletion Reason / 删除原因')),language:string(get('Materials Language / 资料语言'))||'en',owner:string(get('Materials Owner / 资料负责人')),
  attendee_snapshot:JSON.stringify({_legacyFeishu:{recordId:record.record_id,fields:f}}),package_snapshot:JSON.stringify({id:packageId,optionId:p?.optionId||'',name:string(get('Attendee Category / 报名身份')),ticketName:string(get('Ticket / 票种')),price:amount,displayPrice:string(get('Display Price / 显示价格'))}),created_at:submitted};
 if(!Number.isInteger(row.guests)||row.guests<0||row.guests>65535)throw Error('Invalid legacy guest count');
 return row;
}
function prepareImport(records){
 if(!Array.isArray(records)||!records.length)throw Error('Empty legacy records');
 const refs=new Set(),emails=new Set(),ids=new Set();return records.map(record=>{const row=mapRecord(record);if(refs.has(row.ref))throw Error('Duplicate legacy ref');refs.add(row.ref);if(!row.deleted_at&&!['Rejected','Cancelled'].includes(row.status)){if(emails.has(row.email))throw Error('Duplicate active email');emails.add(row.email);}if(ids.has(row.id))throw Error('Duplicate source record ID');ids.add(row.id);return row;});
}
function validateVip(vip,rows,env){
 const codes=vip.codes||[],attempts=vip.attempts||[],events=vip.events||[],meta=vip.meta||[],key=Buffer.from(env.VIP_CODE_ENCRYPTION_KEY||'','base64');
 if(key.length!==32)throw Error('Invalid VIP encryption key');
 const verifier=crypto.createHash('sha256').update(key).digest('hex'),old=meta.find(r=>r.key==='key_verifier');if(codes.length&&old?.value!==verifier)throw Error('Legacy VIP key mismatch');
 const refs=new Map(rows.map(r=>[r.ref,r])),ids=new Set(),hashes=new Set();
 for(const c of codes){
  if(!['available','used','revoked'].includes(c.status))throw Error('Unresolved legacy VIP status');
  if(ids.has(c.id)||hashes.has(c.code_hash))throw Error('Duplicate legacy VIP');ids.add(c.id);hashes.add(c.code_hash);
  const bytes=Buffer.from(c.cipher,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));const plain=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');if(crypto.createHash('sha256').update(plain.trim().toUpperCase()).digest('hex')!==c.code_hash||plain.slice(-4)!==c.last4)throw Error('Legacy VIP cipher/hash mismatch');
  if(c.status==='used'&&!refs.has(c.registration_ref))throw Error('Used VIP registration reference not found');
  if(c.status==='used'&&c.used_email&&refs.get(c.registration_ref).email!==c.used_email.trim().toLowerCase())throw Error('Used VIP email mismatch');
 }
 for(const a of attempts)if(!ids.has(a.code_id)||!['used','failed','revoked'].includes(a.status)||(a.status==='used'&&!refs.has(a.registration_ref)))throw Error('Unresolved VIP attempt/reference');
 for(const e of events)if(!ids.has(e.code_id))throw Error('VIP event reference not found');
 return {codes,attempts,events,verifier,refs};
}
async function insert(tx,table,row){const cols=Object.keys(row);if(!cols.every(c=>/^[a-z_0-9]+$/.test(c))||!/^[a-z_]+$/.test(table))throw Error('Invalid import column');await tx.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,Object.values(row));}
async function importLegacy({db,env,source,vip}){
 const rows=prepareImport(source.records),v=validateVip(vip,rows,env),digest=crypto.createHash('sha256').update(JSON.stringify({source,vip})).digest('hex');
 return db.transaction(async tx=>{
  const prior=await tx.query("SELECT detail FROM audit_events WHERE action='legacy_import_complete' AND actor='migration' LIMIT 1");
  if(prior.length){const detail=typeof prior[0].detail==='string'?JSON.parse(prior[0].detail):prior[0].detail;if(detail.digest!==digest)throw Error('Target already contains a different legacy import');return {...detail,alreadyImported:true};}
  for(const table of ['registrations','vip_codes','vip_meta','vip_redemptions','material_items','material_files','material_versions','publication_consents','showcase_entries','mail_jobs','submission_requests','supplement_tokens','audit_events'])if(Number((await tx.query('SELECT COUNT(*) AS n FROM '+table))[0].n))throw Error('Refusing nonempty migration target');
  for(const row of rows){
   await insert(tx,'registrations',row);
   for(const kind of ['card','portrait','logo']){const id=crypto.randomUUID();await insert(tx,'material_items',{id,registration_id:row.id,kind});if(kind!=='card'){await insert(tx,'publication_consents',{registration_id:row.id,kind,granted:0,text_version:'legacy-import-no-consent'});await insert(tx,'showcase_entries',{id:crypto.randomUUID(),item_id:id,event_key:EVENT,kind,config_json:JSON.stringify({draft:{},published:null}),org_key:row.id});}}
   await insert(tx,'audit_events',{registration_id:row.id,action:'legacy_import',actor:'migration',detail:JSON.stringify({source:'feishu',recordId:JSON.parse(row.attendee_snapshot)._legacyFeishu.recordId})});
  }
  await insert(tx,'vip_meta',{meta_key:'key_verifier',meta_value:v.verifier});
  for(const c of v.codes){
   const out={};for(const col of ['id','code_hash','cipher','last4','batch_name','status','recipient_name','recipient_email','note','used_name','used_email','registration_ref'])out[col]=c[col]??'';
   for(const col of ['expires_at','distributed_at','used_at','created_at'])out[col]=dateTime(c[col],{required:col==='created_at'});
   await insert(tx,'vip_codes',out);
   if(c.status==='used'){const attempt=v.attempts.find(a=>a.code_id===c.id&&a.status==='used');await insert(tx,'vip_redemptions',{id:crypto.randomUUID(),code_id:c.id,registration_id:v.refs.get(c.registration_ref).id,request_key:attempt?.id||'legacy-'+c.id,created_at:out.used_at||out.created_at});}
  }
  for(const e of v.events)await insert(tx,'audit_events',{vip_code_id:e.code_id,action:e.action,actor:'legacy',detail:JSON.stringify({legacyEventId:e.id,message:e.detail}),created_at:dateTime(e.at,{required:true})});
  for(const a of v.attempts)await insert(tx,'audit_events',{vip_code_id:a.code_id,action:'legacy_vip_attempt',actor:'migration',detail:JSON.stringify(a),created_at:dateTime(a.created_at,{required:true})});
  const report={digest,registrations:rows.length,active:rows.filter(r=>!r.is_deleted).length,deleted:rows.filter(r=>r.is_deleted).length,vipCodes:v.codes.length,vipRedemptions:v.codes.filter(c=>c.status==='used').length,vipEvents:v.events.length,sourceRevision:source.revision||null};
  await insert(tx,'audit_events',{action:'legacy_import_complete',actor:'migration',detail:JSON.stringify(report)});return report;
 });
}
if(require.main===module){
 (async()=>{const fs=require('node:fs');const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),vip=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));const {loadEnv}=require('./env'),env=loadEnv({...process.env});const rows=prepareImport(source.records);validateVip(vip,rows,env);
 if(process.argv[4]!=='--apply'){console.log(JSON.stringify({dryRun:true,registrations:rows.length,vipCodes:vip.codes.length}));return;}
 const db=require('./database').createDatabase(env);try{console.log(JSON.stringify(await importLegacy({db,env,source,vip})));}finally{await db.close();}
 })().catch(e=>{console.error('Legacy import failed: '+(e.code||e.message));process.exitCode=1;});
}
module.exports={mapRecord,prepareImport,validateVip,importLegacy,dateTime};
