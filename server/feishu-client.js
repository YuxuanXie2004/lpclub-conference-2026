'use strict';
const crypto = require('node:crypto');
const {SYNC_FIELDS} = require('./feishu-projection');
const problem = (code, blocked=false) => Object.assign(new Error(code),{code,blocked});
const EXPIRED = new Set([99991661,99991663,99991668]);
const BLOCKED = new Set([91403,1254018,19021,19022,19024,99991664,99991672,99991679,1254001,1254003,1254004,1254005,1254006,1254007,1254010,1254015,1254027,1254037,1254045,1254301,1254302]);
function createFeishuClient({env=process.env,fetch:request=globalThis.fetch}={}) {
  let token='',expires=0;
  const base=()=>{
    if(!env.FEISHU_SYNC_APP_TOKEN||!env.FEISHU_SYNC_TABLE_ID)throw problem('FEISHU_TARGET_NOT_CONFIGURED',true);
    return `/bitable/v1/apps/${encodeURIComponent(env.FEISHU_SYNC_APP_TOKEN)}/tables/${encodeURIComponent(env.FEISHU_SYNC_TABLE_ID)}`;
  };
  async function json(url,options={}) {
    let res,data;
    try {res=await request(url,{...options,signal:options.signal||AbortSignal.timeout(15000)});data=await res.json();}
    catch(_){throw problem('FEISHU_DELIVERY_UNCERTAIN');}
    if(data.code!==0||!res.ok) {
      const code=Number(data.code);
      const error=problem(Number.isFinite(code)&&code!==0?'FEISHU_'+code:'FEISHU_HTTP_'+res.status,BLOCKED.has(code)||[400,401,403,404].includes(res.status));
      error.feishuCode=code;error.httpStatus=res.status;throw error;
    }
    return data;
  }
  async function tenantToken() {
    if(token&&Date.now()<expires)return token;
    if(!env.FEISHU_APP_ID||!env.FEISHU_APP_SECRET)throw problem('FEISHU_APP_NOT_CONFIGURED',true);
    const data=await json('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:env.FEISHU_APP_ID,app_secret:env.FEISHU_APP_SECRET})});
    if(!data.tenant_access_token)throw problem('FEISHU_TOKEN_MISSING',true);
    token=data.tenant_access_token;expires=Date.now()+Math.max(1,(Number(data.expire)||7200)-60)*1000;return token;
  }
  async function api(path,options={},refresh=true) {
    const auth=await tenantToken();
    try{return (await json('https://open.feishu.cn/open-apis'+path,{...options,headers:{'Content-Type':'application/json; charset=utf-8',Authorization:'Bearer '+auth}})).data||{};}
    catch(error){if(refresh&&EXPIRED.has(error.feishuCode)){token='';expires=0;return api(path,options,false);}throw error;}
  }
  async function notify(payload) {
    let url;
    try{url=new URL(env.FEISHU_BOT_WEBHOOK);}catch(_){throw problem('FEISHU_WEBHOOK_NOT_CONFIGURED',true);}
    if(url.origin!=='https://open.feishu.cn'||!/^\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(url.pathname))throw problem('FEISHU_WEBHOOK_INVALID',true);
    const body={...payload};
    if(env.FEISHU_BOT_SECRET){body.timestamp=String(Math.floor(Date.now()/1000));body.sign=crypto.createHmac('sha256',body.timestamp+'\n'+env.FEISHU_BOT_SECRET).update('').digest('base64');}
    const encoded=JSON.stringify(body);
    if(Buffer.byteLength(encoded)>20000)throw problem('FEISHU_MESSAGE_TOO_LARGE',true);
    await json(url.href,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:encoded});
  }
  async function paginate(path,options={}) {
    const items=[];let cursor='';
    do {
      const separator=path.includes('?')?'&':'?';
      const data=await api(path+separator+new URLSearchParams({page_size:'100',...(cursor?{page_token:cursor}:{})}),options);
      items.push(...(data.items||[]));
      if(data.has_more&&!data.page_token)throw problem('FEISHU_INVALID_PAGINATION',true);
      cursor=data.has_more?data.page_token:'';
    }while(cursor);
    return items;
  }
  const listRecords=()=>paginate(base()+'/records');
  const findRecords=id=>paginate(base()+'/records/search',{method:'POST',body:JSON.stringify({filter:{conjunction:'and',conditions:[{field_name:'数据库ID',operator:'is',value:[id]}]},automatic_fields:false})});
  async function updateRecord(id,fields) {const data=await api(base()+'/records/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({fields})});return data.record||{record_id:id};}
  async function upsert(recordId,fields,createKey) {
    if(recordId){try{return await updateRecord(recordId,fields);}catch(error){if(![1254043,1254044].includes(error.feishuCode)&&error.httpStatus!==404)throw error;}}
    const matches=(await findRecords(fields['数据库ID'])).sort((a,b)=>a.record_id.localeCompare(b.record_id));
    if(matches.length){
      const chosen=matches[0];
      for(const duplicate of matches.slice(1))await updateRecord(duplicate.record_id,{'同步重复':true});
      return updateRecord(chosen.record_id,fields);
    }
    // A stable client token supplements the database-ID lookup after uncertain writes.
    const hex=crypto.createHash('sha256').update(createKey+':'+(recordId||'initial')).digest('hex');
    const clientToken=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const data=await api(base()+'/records?client_token='+clientToken,{method:'POST',body:JSON.stringify({fields})});
    if(!data.record?.record_id)throw problem('FEISHU_RECORD_ID_MISSING');
    return updateRecord(data.record.record_id,fields);
  }
  async function schema(apply=false) {
    const fields=await paginate(base()+'/fields');
    const missing=[],incompatible=[];
    for(const expected of SYNC_FIELDS){const actual=fields.find(f=>f.field_name===expected.name);if(!actual)missing.push(expected);else if(actual.type!==expected.type)incompatible.push({name:expected.name,expected:expected.type,actual:actual.type});}
    if(apply&&incompatible.length)throw problem('FEISHU_FIELD_TYPE_MISMATCH',true);
    if(apply)for(const field of missing)await api(base()+'/fields',{method:'POST',body:JSON.stringify({field_name:field.name,type:field.type,...(field.type===5?{property:{date_formatter:'yyyy/MM/dd HH:mm'}}:{})})});
    return {missing,incompatible,ready:incompatible.length===0&&(apply||missing.length===0)};
  }
  async function ensureViews() {
    const views=await paginate(base()+'/views');
    const fields=await paginate(base()+'/fields');
    const deleted=fields.find(f=>f.field_name==='已删除'),duplicate=fields.find(f=>f.field_name==='同步重复'),identity=fields.find(f=>f.field_name==='数据库ID');
    if(!deleted||!duplicate||!identity)throw problem('FEISHU_SCHEMA_NOT_READY',true);
    for(const [name,isDeleted] of [['报名信息（同步）',false],['回收站（同步）',true]]){
      let view=views.find(v=>v.view_name===name);
      if(!view){const data=await api(base()+'/views',{method:'POST',body:JSON.stringify({view_name:name,view_type:'grid'})});view=data.view;}
      await api(base()+'/views/'+encodeURIComponent(view.view_id),{method:'PATCH',body:JSON.stringify({property:{filter_info:{conjunction:'and',conditions:[{field_id:deleted.field_id,operator:'is',value:JSON.stringify([isDeleted])},{field_id:duplicate.field_id,operator:'is',value:'[false]'},{field_id:identity.field_id,operator:'isNotEmpty'}]}}})});
    }
  }
  return {api,notify,upsert,listRecords,findRecords,updateRecord,schema,ensureViews};
}
function normalizeRemote(fields) {
  return Object.fromEntries(SYNC_FIELDS.map(({name,type})=>{
    let value=fields[name];
    if(type===1){if(Array.isArray(value))value=value.map(v=>v.text??'').join('');value=String(value??'');}
    else if(type===7)value=value===true||value===1;
    else if(type===2)value=Number(value)||0;
    else if(type===5)value=value==null?null:Number(value);
    else if(type===15)value={link:value?.link||'',text:value?.text||''};
    return [name,value];
  }));
}
module.exports={createFeishuClient,normalizeRemote,problem};
