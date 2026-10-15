'use strict';
const crypto = require('node:crypto');
const { error } = require('./vip-store');

function discountPackage(p) {
  if (p.optionId !== 'ticket') throw error('VIP_TICKET_ONLY', 'VIP Code applies to delegate passes only. Please select a Delegate Pass.');
  return { ...p, originalPrice: p.price, price: 0, displayPrice: 'Complimentary / VIP Code', vipApplied: true };
}
function discountedOrder(order, id) {
  const p = discountPackage(order.package);
  return { ...order, package: p, total: 0, subtotal: 0,
    items: [{name:p.ticketName,qty:1,lineTotal:0}],
    pricingBasis: p.name + ' — VIP Code complimentary delegate pass (standard USD ' + p.originalPrice.toLocaleString('en-US') + ') [VIP:' + id + ']' };
}
function resultFor(order, recordId) {
  return { ref: order.ref, package: order.package, saved: true, feishu: {recordId}, email: {skipped:true,reason:'Email delivery pending'} };
}
class VipService {
  constructor({store,feishu,packages}) { this.store=store;this.feishu=feishu;this.packages=packages; }
  preview(p, code) { discountPackage(p);this.store.preview(code);return discountPackage(p); }
  previewCode(code) { return this.store.preview(code); }
  async redeem(order, input, writeRegistration) {
    discountPackage(order.package);
    // Only normalized registration data contributes to the fingerprint; server-generated references do not.
    const requestHash=crypto.createHash('sha256').update(JSON.stringify({packageId:order.package.id,attendee:order.attendee})).digest('hex');
    const a=this.store.reserve({code:input.vipCode,idempotencyKey:input.idempotencyKey,requestHash,email:order.attendee.email,packageId:order.package.id,registrationRef:order.ref});
    const adjusted=discountedOrder({...order,ref:a.registration_ref},a.code_id);
    if (!a.fresh) {
      if(a.status==='used')return {replayed:true,attemptId:a.id,order:adjusted,result:JSON.parse(a.result_json||'null')||resultFor(adjusted,a.record_id)};
      if(a.status==='failed')throw error('VIP_RETRY_REQUIRED','Please submit again to retry this registration.',409);
      throw Object.assign(error(a.status==='revoked'?'VIP_REVOKED':'VIP_PROCESSING',a.status==='revoked'?'This VIP Code has been revoked.':'This registration is being processed. Please contact LP CLUB with your reference.',409),{ref:a.registration_ref});
    }
    let record;
    try { record=await writeRegistration(adjusted); }
    catch(e) {
      if(e.definitelyNotSaved) {
        this.store.release(a.id,'报名未保存，兑换码已释放');
        throw Object.assign(e,{retryable:true});
      }
      this.store.review(a.id,'飞书写入结果不确定，等待核对');
      throw Object.assign(error('VIP_REVIEW_REQUIRED','We could not confirm your registration. Please contact LP CLUB with your reference; do not submit a new registration.',503),{ref:a.registration_ref});
    }
    if(!record||!record.record_id) {
      this.store.review(a.id,'飞书响应缺少记录编号，等待核对');
      throw Object.assign(error('VIP_REVIEW_REQUIRED','Please contact LP CLUB to confirm your registration.',503),{ref:a.registration_ref});
    }
    const result=resultFor(adjusted,record.record_id);
    try { this.store.complete(a.id,record.record_id,result,adjusted.attendee.fullName); }
    catch(_) {
      // A known saved record must never release its code, even if SQLite cannot finalize it.
      try {this.store.review(a.id,'飞书已保存，核销落库失败，等待核对');}catch(_){}
      throw Object.assign(error('VIP_REVIEW_REQUIRED','Please contact LP CLUB to confirm your registration.',503),{ref:a.registration_ref});
    }
    return {replayed:false,attemptId:a.id,order:adjusted,record,result};
  }
  async reconcile(id) {
    const row=this.store.row(id);
    if(row.status!=='review')throw error('VIP_NOT_EDITABLE','仅待核对兑换码可以核对。',409);
    const a=this.store.latestAttempt(id);
    const record=await this.feishu.findRecordByReference(a.registration_ref,true);
    if(!record) {this.store.event(id,'reconciled_missing','飞书暂未找到记录；保持待核对');return {item:this.store.display(this.store.row(id)),matched:false};}
    const f=record.fields||{};
    if(!record.record_id||f['Registration Reference / 报名编号']!==a.registration_ref||
      String(f['Business Email / 企业邮箱']||'').trim().toLowerCase()!==a.email||
      f['Package ID / 套餐ID']!==a.package_id||!this.packages[a.package_id]||this.packages[a.package_id].optionId!=='ticket'||
      f['Attendee Category / 报名身份']!==this.packages[a.package_id].name||f['Ticket / 票种']!==this.packages[a.package_id].ticketName||
      ![0,'0'].includes(f['Amount / 金额'])||!String(f['Pricing Basis / 计价说明']||'').includes('[VIP:'+id+']')) {
      this.store.event(id,'reconciled_mismatch','飞书记录内容不匹配；保持待核对');
      throw error('VIP_RECORD_MISMATCH','飞书记录的身份套餐、金额或兑换码关联不一致，请人工检查。',409);
    }
    const p=discountPackage(this.packages[a.package_id]);
    this.store.complete(a.id,record.record_id,{ref:a.registration_ref,package:p,saved:true,feishu:{recordId:record.record_id},email:{skipped:true,reason:'Registration reconciled; please check email status with LP CLUB'}},f['Full Name / 姓名']);
    this.store.event(id,'reconciled','已核对飞书记录（包含回收站）');
    return {item:this.store.display(this.store.row(id)),matched:true};
  }
}
module.exports={VipService,discountPackage};
