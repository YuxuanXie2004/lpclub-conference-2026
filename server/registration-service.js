'use strict';
const crypto=require('node:crypto');
const {lockItems,takeDown}=require('./showcase-state');
const {toRegistrationRow,fromRegistrationRow,parseJSON}=require('./order');
const STATUSES=['Received','Under Review','Approved','Waitlisted','Rejected','Cancelled'];
const fail=(code,message,statusCode=400,extra={})=>Object.assign(new Error(message),{code,statusCode,...extra});
async function audit(tx,id,action,detail={}) {await tx.query('INSERT INTO audit_events(registration_id,action,actor,detail) VALUES (?,?,?,?)',[id,action,'administrator',JSON.stringify(detail)]);}
function createRegistrationService({db,normaliseOrder,pricing,vip,materials,mail,integrations,composeMail=order=>({order})}) {
  async function duplicate(email) {
    const rows=await db.query("SELECT ref FROM registrations WHERE event_key='conference-2026' AND active_email=LOWER(TRIM(?))",[email]);
    return fail('DUPLICATE_REGISTRATION','A registration already exists for this business email. Please contact LP CLUB if you need to update it.',409,{ref:rows[0]?.ref});
  }
  async function submit(input) {
    const key=input?.idempotencyKey;
    if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw fail('INVALID_IDEMPOTENCY_KEY','Please retry this registration from the website.');
    const vipRaw=typeof input.vipCode==='string'?input.vipCode.trim().toUpperCase():'';
    let normalized;
    let result;
    try {
      result=await db.transaction(async tx=>{
        const catalogue=pricing?await pricing.packages(tx,{lock:true}):null;
        normalized=normaliseOrder(input,catalogue?.packages);
        const requestHash=crypto.createHash('sha256').update(JSON.stringify({packageId:normalized.package.id,attendee:normalized.attendee,materials:normalized.materialPreferences,vipCode:vipRaw})).digest('hex');
        await tx.query('INSERT INTO submission_requests(idempotency_key,request_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE idempotency_key=idempotency_key',[key,requestHash]);
        const previous=(await tx.query('SELECT * FROM submission_requests WHERE idempotency_key=? FOR UPDATE',[key]))[0];
        if(previous.request_hash!==requestHash)throw fail('IDEMPOTENCY_CONFLICT','This submission has changed. Please start a new registration.',409);
        if(previous.registration_id){
          const saved=(await tx.query('SELECT is_deleted FROM registrations WHERE id=?',[previous.registration_id]))[0];
          if(!saved||saved.is_deleted)throw fail('REGISTRATION_UNAVAILABLE','This registration is no longer available. Contact the organiser.',409);
          return parseJSON(previous.result_json);
        }
        let order=normalized,code;
        if(vipRaw){
          if(!vip)throw fail('VIP_STORAGE_UNAVAILABLE','VIP storage is unavailable. Please contact LP CLUB.',503);
          if(order.package.optionId!=='ticket')throw fail('VIP_TICKET_ONLY','VIP Code applies to delegate passes only. Please select a Delegate Pass.');
          code=await vip.previewCode(vipRaw,tx);
          const p={...order.package,originalPrice:order.package.price,price:0,displayPrice:'Complimentary / VIP Code',vipApplied:true};
          order={...order,package:p,total:0,subtotal:0,items:[{name:p.ticketName,qty:1,lineTotal:0}],pricingBasis:p.name+' — VIP Code complimentary delegate pass (standard USD '+p.originalPrice.toLocaleString('en-US')+') [VIP:'+code.id+']'};
        }
        if(input.expectedPrice!==undefined&&input.expectedPrice!==null&&input.expectedPrice!==''){
          const expectedPrice=Number(input.expectedPrice);
          if(!Number.isFinite(expectedPrice)||expectedPrice<0||!Number.isInteger(expectedPrice))throw fail('INVALID_EXPECTED_PRICE','The confirmed registration price is invalid.',400);
          if(expectedPrice!==order.total)throw fail('PRICE_CHANGED','Registration pricing changed. Please review the updated price and submit again.',409,{currentPrice:order.total,currentRevision:catalogue?.revision});
        }
        const row=toRegistrationRow(order);
        const enabled=materials?.ready()===true;
        row.email_status=mail?.configured()?'Queued':'Not configured';
        const columns=Object.keys(row);
        await tx.query('INSERT INTO registrations ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')',Object.values(row));
        if(vipRaw)await vip.redeem(tx,vipRaw,{id:row.id,ref:row.ref,email:row.email,fullName:row.full_name},key);
        const preparation=enabled?await materials.initialize(tx,order,row):null;
        const email=mail?await mail.enqueue(tx,row.id,'registration',composeMail(order,preparation?.supplementUrl),'registration:'+row.id):{skipped:true,reason:'SMTP not configured'};
        await integrations?.capture(tx,row.id,'registration_created');
        const response={registrationId:row.id,ref:order.ref,package:order.package,saved:true,email};
        await tx.query('UPDATE submission_requests SET registration_id=?,result_json=? WHERE idempotency_key=?',[row.id,JSON.stringify(response),key]);
        await tx.query('INSERT INTO audit_events(registration_id,action,actor,detail) VALUES (?,?,?,?)',[row.id,'registration_created','registrant',JSON.stringify({packageId:order.package.id,vipApplied:!!vipRaw})]);
        return response;
      });
    } catch(error) {
      if(error.code==='ER_DUP_ENTRY')throw await duplicate(normalized?.attendee.email);
      if(error.statusCode)throw error;
      throw fail('DATABASE_UNAVAILABLE','Registration could not be confirmed. Please retry the same submission.',503,{retryable:true});
    }
    if(materials?.ready()) {
      const grant=materials.uploadGrant(result.ref);
      return {...result,materials:{uploadToken:grant.token,expiresAt:grant.expiresAt}};
    }
    return result;
  }
  function filters(input={}) {
    const mode=input.mode==='deleted'?'deleted':'active',where=['r.event_key=?',mode==='deleted'?'r.deleted_at IS NOT NULL':'r.deleted_at IS NULL'],args=['conference-2026'];
    const q=String(input.q||'').trim().slice(0,180);
    if(q){where.push('(r.ref LIKE ? OR r.full_name LIKE ? OR r.company LIKE ? OR r.email LIKE ?)');args.push(...Array(4).fill('%'+q.replace(/[\\%_]/g,'\\$&')+'%'));}
    if(STATUSES.includes(input.status)){where.push('r.status=?');args.push(input.status);}
    if(input.package){where.push('(r.package_id=? OR r.ticket_name=?)');args.push(String(input.package).slice(0,255),String(input.package).slice(0,255));}
    return {where:where.join(' AND '),args,mode};
  }
  async function list(input={}) {
    const {where,args,mode}=filters(input),page=Math.max(1,Math.floor(Number(input.page)||1)),pageSize=Math.max(1,Math.min(100,Math.floor(Number(input.pageSize)||50)));
    const counts=await db.query('SELECT r.status,COUNT(*) AS n FROM registrations r WHERE '+where+' GROUP BY r.status',args);
    const stats={Total:counts.reduce((sum,row)=>sum+Number(row.n),0),...Object.fromEntries(counts.map(r=>[r.status,Number(r.n)]))};
    const rows=await db.query('SELECT r.* FROM registrations r WHERE '+where+' ORDER BY r.submitted_at DESC,r.id DESC LIMIT ? OFFSET ?',[...args,pageSize,(page-1)*pageSize]);
    const packages=await db.query('SELECT DISTINCT ticket_name FROM registrations r WHERE r.event_key=? AND '+(mode==='deleted'?'r.deleted_at IS NOT NULL':'r.deleted_at IS NULL')+' ORDER BY ticket_name',['conference-2026']);
    return {rows:rows.map(fromRegistrationRow),total:stats.Total,page,pageSize,stats,packages:packages.map(p=>p.ticket_name)};
  }
  async function detail(ref) {
    const row=(await db.query('SELECT * FROM registrations WHERE event_key=? AND ref=?',['conference-2026',ref]))[0];
    if(!row)throw fail('REGISTRATION_NOT_FOUND','Registration not found',404);
    return fromRegistrationRow(row);
  }
  async function exportRows(input={}) {
    const rows=[];for await(const batch of exportBatches(input))rows.push(...batch);return rows;
  }
  async function* exportBatches(input={}) {
    const {where,args}=filters(input);let last='';
    for(;;){const rows=await db.query('SELECT r.* FROM registrations r WHERE '+where+' AND r.id>? ORDER BY r.id LIMIT 500',[...args,last]);if(!rows.length)return;yield rows.map(fromRegistrationRow);last=rows.at(-1).id;}
  }
  async function lifecycle(action,body) {
    try {
      return await db.transaction(async tx=>{
        const r=(await tx.query('SELECT * FROM registrations WHERE event_key=? AND ref=? FOR UPDATE',['conference-2026',body.ref]))[0];
        if(!r||(action==='restore'?!r.deleted_at:!!r.deleted_at))throw fail('REGISTRATION_NOT_FOUND','Registration not found',404);
        if(!Number.isInteger(body.rowVersion))throw fail('VERSION_REQUIRED','Refresh registration before saving.',400);
        if(body.rowVersion!==r.row_version)throw fail('VERSION_CONFLICT','Registration changed; refresh before saving.',409);
        if(action==='status'){
          if(!STATUSES.includes(body.status))throw fail('INVALID_STATUS','Invalid status');
          if(body.status===r.status&&String(body.note||'').trim().slice(0,500)===String(r.status_note||''))return {ref:r.ref,status:r.status,deleted:false,restored:false};
          await tx.query('UPDATE registrations SET status=?,status_note=?,status_updated_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?',[body.status,String(body.note||'').trim().slice(0,500),r.id]);
        }else if(action==='delete')await tx.query("UPDATE registrations SET is_deleted=1,deleted_at=UTC_TIMESTAMP(3),deleted_by='administrator',deletion_reason=?,row_version=row_version+1 WHERE id=?",[String(body.reason||'').trim().slice(0,500),r.id]);
        else if(action==='restore')await tx.query("UPDATE registrations SET is_deleted=0,deleted_at=NULL,deleted_by='',deletion_reason='',row_version=row_version+1 WHERE id=?",[r.id]);
        else throw fail('INVALID_ACTION','Invalid action');
        const items=await lockItems(tx,[r.id]);
        if(action!=='status'||body.status!=='Approved')await takeDown(tx,items,r.event_key);
        await tx.query('UPDATE material_items SET row_version=row_version+1 WHERE registration_id=?',[r.id]);
        await integrations?.capture(tx,r.id);
        await audit(tx,r.id,action,{status:body.status,reason:body.reason,note:body.note});
        return {ref:r.ref,status:body.status,deleted:action==='delete',restored:action==='restore'};
      });
    }catch(error){if(error.code==='ER_DUP_ENTRY'){const r=(await db.query('SELECT email FROM registrations WHERE ref=?',[body.ref]))[0];throw await duplicate(r?.email||'');}throw error;}
  }
  return {submit,list,detail,exportRows,exportBatches,lifecycle};
}
module.exports={createRegistrationService,STATUSES};
