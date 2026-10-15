const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { VipStore } = require('../server/vip-store');
const { VipService } = require('../server/vip');
const { PACKAGES } = require('../server/packages');
function fixture(t, feishu = {}) {
  const store = new VipStore({ filename: ':memory:', key: crypto.randomBytes(32).toString('base64') });
  t.after(() => store.close());
  const item = store.generate({count:1})[0];
  const code = store.detail(item.id).item.code;
  return {store,item,code,service:new VipService({store,feishu,packages:PACKAGES})};
}
function order(id='gp_ticket') { const p=PACKAGES[id];return {ref:crypto.randomUUID(),package:{...p},attendee:{email:'jane@capital-example.com'},total:p.price,subtotal:p.price,items:[{name:p.ticketName,qty:1,lineTotal:p.price}],pricingBasis:p.name}; }
function input(code) {return {vipCode:code,idempotencyKey:crypto.randomUUID()};}
test('all five delegate passes preview free without consuming and other packages are excluded', t=>{
  const f=fixture(t);
  for(const identity of ['lp','lpclub_member','gp','investment_company','standard']) {
    const p=f.service.preview(PACKAGES[identity+'_ticket'],' '+f.code.toLowerCase()+' ');
    assert.equal(p.price,0);assert.equal(p.vipApplied,true);assert.ok(!JSON.stringify(p).includes(f.code));
  }
  for(const option of ['speaking','panel','matchmaking'])assert.throws(()=>f.service.preview(PACKAGES['gp_'+option],f.code),e=>e.code==='VIP_TICKET_ONLY');
  assert.equal(f.service.previewCode(f.code).status,'available');
  assert.throws(()=>f.service.previewCode('WRONG'),e=>e.code==='INVALID_VIP_CODE');
  assert.throws(()=>f.service.preview(PACKAGES.gp_ticket,'OLD-SHARED-CODE'),e=>e.code==='INVALID_VIP_CODE');
});
test('one write only, retry is idempotent, changed payload conflicts, new claimant blocked',async t=>{
  const f=fixture(t), request=input(f.code);let writes=0;
  const write=async ()=>{writes++;return {record_id:'rec-one'};};
  const first=await f.service.redeem(order(),request,write);
  const second=await f.service.redeem(order(),request,write);
  assert.equal(writes,1);assert.equal(second.replayed,true);assert.equal(second.result.ref,first.result.ref);assert.equal(first.result.package.price,0);
  assert.match(first.order.pricingBasis,new RegExp('VIP:'+f.item.id));
  assert.ok(!JSON.stringify(first.result).includes(f.code));
  const changed=order();changed.attendee.email='other@capital-example.com';
  await assert.rejects(f.service.redeem(changed,request,write),e=>e.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.service.redeem(order(),input(f.code),write),e=>e.code==='VIP_USED');
});
test('simultaneous redemption permits one writer, same pending key never writes twice',async t=>{
  const f=fixture(t), request=input(f.code);let finish,writes=0;
  const first=f.service.redeem(order(),request,async()=>{writes++;return new Promise(r=>finish=r);});
  await assert.rejects(f.service.redeem(order(),request,()=>{writes++;}),e=>e.code==='VIP_PROCESSING');
  await assert.rejects(f.service.redeem(order(),input(f.code),()=>{writes++;}),e=>e.code==='VIP_PROCESSING');
  finish({record_id:'rec-one'});await first;assert.equal(writes,1);
});
test('confirmed failed writes release, ambiguous writes and missing IDs require review',async t=>{
  const f=fixture(t), request=input(f.code);
  await assert.rejects(f.service.redeem(order(),request,async()=>{throw Object.assign(new Error('failed'),{definitelyNotSaved:true});}),e=>e.retryable===true);
  assert.equal(f.store.row(f.item.id).status,'available');
  await assert.rejects(f.service.redeem(order(),request,async()=>{}),e=>e.code==='VIP_RETRY_REQUIRED');
  await assert.rejects(f.service.redeem(order(),input(f.code),async()=>{throw new Error('timeout');}),e=>e.code==='VIP_REVIEW_REQUIRED'&&Boolean(e.ref));
  assert.equal(f.store.row(f.item.id).status,'review');
  const other=f.store.generate({count:1})[0],otherCode=f.store.detail(other.id).item.code;
  const otherOrder=order();otherOrder.attendee.email='other@capital-example.com';
  await assert.rejects(f.service.redeem(otherOrder,input(otherCode),async()=>null),e=>e.code==='VIP_REVIEW_REQUIRED');
  // This attempt uses another email because the first email remains held for review.
});
test('reconciliation includes deleted records, verifies ownership and never releases missing records',async t=>{
  let record=null,includeDeleted;
  const f=fixture(t,{async findRecordByReference(ref,flag){includeDeleted=flag;return record;}}),request=input(f.code);
  let discounted;
  await assert.rejects(f.service.redeem(order(),request,async o=>{discounted=o;throw new Error('timeout');}));
  assert.equal((await f.service.reconcile(f.item.id)).matched,false);assert.equal(f.store.row(f.item.id).status,'review');
  record={record_id:'rec-one',fields:{'Registration Reference / 报名编号':discounted.ref,'Business Email / 企业邮箱':discounted.attendee.email,'Package ID / 套餐ID':'gp_ticket','Full Name / 姓名':'Jane Reconciled','Attendee Category / 报名身份':PACKAGES.gp_ticket.name,'Ticket / 票种':PACKAGES.gp_ticket.ticketName,'Amount / 金额':0,'Pricing Basis / 计价说明':discounted.pricingBasis,'Is Deleted / 已删除':true}};
  record.fields['Amount / 金额']=2000;
  await assert.rejects(f.service.reconcile(f.item.id),e=>e.code==='VIP_RECORD_MISMATCH');
  record.fields['Amount / 金额']=0;
  assert.equal((await f.service.reconcile(f.item.id)).matched,true);assert.equal(includeDeleted,true);assert.equal(f.store.row(f.item.id).status,'used');assert.equal(f.store.detail(f.item.id).item.usedName,'Jane Reconciled');
  const retry=await f.service.redeem(order(),request,async()=>{throw new Error('must not write');});assert.equal(retry.result.saved,true);
});

test('a saved Feishu record remains held if SQLite finalization fails',async t=>{
  const f=fixture(t),request=input(f.code);let writes=0;
  const complete=f.store.complete;
  f.store.complete=()=>{throw Error('disk temporarily unavailable');};
  await assert.rejects(f.service.redeem(order(),request,async()=>{writes++;return {record_id:'rec-saved'};}),e=>e.code==='VIP_REVIEW_REQUIRED');
  assert.equal(f.store.row(f.item.id).status,'review');
  await assert.rejects(f.service.redeem(order(),request,async()=>{writes++;}),e=>e.code==='VIP_PROCESSING');
  assert.equal(writes,1);f.store.complete=complete;
});
