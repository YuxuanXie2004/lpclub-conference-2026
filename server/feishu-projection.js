'use strict';
const crypto = require('node:crypto');
const {publicUrl} = require('./public-paths');
const TEXT_FIELDS = {
  数据库ID:'id', 报名编号:'ref', 报名状态:'status', 称谓:'salutation', 姓名:'full_name', 公司机构:'company', 机构类型:'company_type',
  部门:'department', 职位:'job_title', 国家地区:'country', 城市:'city', 企业邮箱:'email', 手机号码:'mobile', 是否同号:'whatsapp_same',
  WhatsApp或微信号码:'whatsapp_number', 一对一洽谈:'matchmaking', 签证邀请函:'visa_letter', 套餐ID:'package_id', 报名身份:'attendee_category',
  票种:'ticket_name', 币种:'currency', 显示价格:'display_price', 计价说明:'pricing_basis', 来源:'source', 邮件状态:'email_status',
  状态备注:'status_note', 删除人:'deleted_by', 删除原因:'deletion_reason', 负责人:'owner', 跟进备注:'follow_up_note'
};
const DATE_FIELDS = {报名时间:'submitted_at',预计抵达日期:'arrival_date',邮件发送时间:'email_sent_at',状态更新时间:'status_updated_at',删除时间:'deleted_at',源数据变更时间:'sync_changed_at'};
const KINDS = {card:'名片',portrait:'头像',logo:'Logo'};
const SYNC_FIELDS = [
  ...Object.keys(TEXT_FIELDS).map(name=>({name,type:1})),
  ...Object.keys(DATE_FIELDS).map(name=>({name,type:5})),
  ...['投资方向','参会目的','内容摘要'].map(name=>({name,type:1})),
  ...['同行人数','金额','同步版本'].map(name=>({name,type:2})),
  ...['隐私授权','已删除','同步重复','头像展示授权','Logo展示授权'].map(name=>({name,type:7})),
  {name:'后台入口',type:15},{name:'最近成功同步时间',type:5},
  ...Object.values(KINDS).flatMap(label=>[{name:label+'状态',type:1},{name:label+'版本',type:2},{name:label+'上传时间',type:5}])
];
function millis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const raw=String(value), stamp=Date.parse(raw.length===10?raw+'T00:00:00Z':/[zZ]|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');
  return Number.isFinite(stamp)?stamp:null;
}
function list(value) {try {const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed.join('; '):'';}catch(_){return '';}}
function adminLink(ref,env,withToken=false) { const url=new URL(publicUrl(env.PUBLIC_BASE_URL,'table'));url.searchParams.set('tab','materials');url.searchParams.set('ref',ref);if(withToken&&env.ADMIN_TOKEN)url.searchParams.set('token',env.ADMIN_TOKEN);return url.href; }
function mapFields(row,items=[],consents=[],env={}) {
  const fields=Object.fromEntries(Object.entries(TEXT_FIELDS).map(([label,column])=>[label,String(row[column]??'')]));
  for(const [label,column] of Object.entries(DATE_FIELDS))fields[label]=millis(row[column]);
  Object.assign(fields,{'投资方向':list(row.investment_focus),'参会目的':list(row.attendance_purpose),'同行人数':Number(row.guests)||0,'金额':Number(row.amount)||0,'同步版本':Number(row.sync_version)||1,'隐私授权':Boolean(row.privacy_consent),'已删除':Boolean(row.is_deleted||row.deleted_at),'同步重复':false,'后台入口':{link:adminLink(row.ref,env),text:'查看后台'}});
  for(const [kind,label] of Object.entries(KINDS)) {
    const item=items.find(i=>i.kind===kind);
    fields[label+'状态']=kind==='portrait'&&!['speaking','panel'].includes(row.option_id)?'not_applicable':!item?.current_version_id?'missing':kind==='card'&&item.status==='pending'?'received':item.status||'pending';
    fields[label+'版本']=Number(item?.version_no)||0;
    fields[label+'上传时间']=item?.current_version_id?millis(item.uploaded_at):null;
  }
  for(const kind of ['portrait','logo'])fields[KINDS[kind]+'展示授权']=Boolean(consents.find(c=>c.kind===kind)?.granted);
  fields['内容摘要']=contentHash(fields);
  return fields;
}
const META=new Set(['同步版本','最近成功同步时间','内容摘要']);
function contentHash(fields) {
  const stable=Object.fromEntries(Object.keys(fields).filter(k=>!META.has(k)).sort().map(k=>[k,fields[k]]));
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function safeText(value) {return String(value??'').slice(0,500).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\r\n]/g,' ');}
function buildCard(event,env) {
  const s=event.snapshot,material=event.kind==='material_uploaded';
  const lines=[['报名编号',s.ref],['姓名',s.full_name],['公司',s.company]];
  if(material)lines.push(['资料类型',KINDS[s.kind]||s.kind],['资料版本',s.version]);
  else lines.push(['职位',s.job_title],['套餐',s.ticket_name],['金额',`${s.currency||'USD'} ${Number(s.amount)||0}`]);
  lines.push(['时间',new Date(millis(event.occurredAt)||Date.now()).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）'],['事件编号',event.id]);
  return {msg_type:'interactive',card:{config:{wide_screen_mode:true},header:{template:material?'orange':'green',title:{tag:'plain_text',content:material?'参会资料补交':'新增大会报名'}},elements:[{tag:'div',text:{tag:'plain_text',content:lines.map(([k,v])=>`${k}：${safeText(v)}`).join('\n')}},{tag:'action',actions:[{tag:'button',text:{tag:'plain_text',content:'查看管理后台'},type:'primary',url:adminLink(s.ref,env,true)}]}]}};
}
module.exports={SYNC_FIELDS,mapFields,contentHash,buildCard,millis};
